# Despliegue en producción

La carpeta [`deploy/`](../deploy) sirve igual para tres caminos. Elige uno:

| Camino | Para qué | HTTPS lo pone |
|---|---|---|
| **A. Dokploy** (recomendado en un VPS) | Panel ligero (~300–400 MB en reposo). Despliega el compose casi tal cual y redepliega solo en cada `git push`. | Traefik (de Dokploy) |
| **B. Coolify** | Panel con más catálogo de apps y comunidad; pesa más en reposo y reconstruye al reiniciar servicios de un compose. | Traefik (de Coolify) |
| **C. Sin panel** (VPS o VM de GCP, [ADR 0001](adr/0001-almacenamiento-gcs-y-despliegue-en-vm.md)) | Solo Docker y Caddy, con un script de preparación. | Caddy (`deploy/compose.caddy.yml`) |

> **Destino por decidir:** el [ADR 0001](adr/0001-almacenamiento-gcs-y-despliegue-en-vm.md) y `CLAUDE.md` piden GCP (VM y GCS). Si el despliegue final es en un VPS con Dokploy o Coolify, se registra en un ADR nuevo.

## Qué se despliega

`deploy/compose.prod.yml` levanta tres servicios. Dokploy y Coolify lo usan tal cual; en el camino C se le suma `compose.caddy.yml`.

| Servicio | Qué hace | Expuesto |
|---|---|---|
| `backend` | API y PWA (FastAPI sirve el build de React). Aplica las migraciones al arrancar. | Puerto interno 8000, detrás del proxy, en `https://APP_DOMAIN` |
| `n8n` | Orquestador. | Puerto interno 5678. El editor solo por túnel SSH (`127.0.0.1:5678`); los webhooks, por `https://N8N_DOMAIN` |
| `db-backup` | `pg_dump` diario de los esquemas `app` y `n8n` de Supabase, con retención. | No |

- **Volúmenes con nombre:** `lakehouse` (Delta), `logs`, `n8n_data`, `inbox` y `backups`. Se usan volúmenes y no rutas del host porque así los respaldos de volúmenes de Dokploy y Coolify los incluyen.
- **La base sigue en Supabase Cloud.** El healthcheck del backend consulta la base cada 10 s, así que, en principio, el proyecto gratuito no llega a pausarse por inactividad mientras el servidor esté encendido.

## Antes de empezar (común a todos)

1. **Supabase:** el connection string del **Session pooler** (puerto 5432), en *Connect → Session pooler*. Conviene que el servidor esté cerca de la región del proyecto: cada pantalla hace varias consultas.
2. **Secretos:** genera tres con `openssl rand -hex 32`: `AUTH_SECRET`, `INGEST_API_TOKEN` y `N8N_ENCRYPTION_KEY`. Este último no se puede cambiar después: n8n dejaría de leer sus credenciales.
3. **Dominios sin comprar nada:** usa [sslip.io](https://sslip.io). Con la IP `203.0.113.10`:
   - `APP_DOMAIN=app.203-0-113-10.sslip.io`
   - `N8N_DOMAIN=n8n.203-0-113-10.sslip.io`

   Let's Encrypt emite el certificado igual que con un dominio propio. Si luego compras uno, solo cambias estas dos variables.
4. **Variables:** copia [`deploy/production.env.example`](../deploy/production.env.example) y complétalo. **Nunca** lo subas al repo.

> Fuera de `APP_ENV=local`, la API **no arranca** con una configuración insegura: `AUTH_SECRET` corto, `INGEST_API_TOKEN` vacío o la cookie sin HTTPS ([ADR 0005](adr/0005-seguridad-de-sesion-y-cuentas.md)). Si falla, `docker compose logs backend` dice qué falta.

## A. Dokploy

1. **Instalar** en el VPS (Ubuntu o Debian; deja libres los puertos 80, 443 y 3000):
   ```bash
   curl -sSL https://dokploy.com/install.sh | sh
   ```
2. Entra a `http://<ip>:3000` y crea el usuario administrador. En *Settings → Web Server*, asígnale un dominio al panel (p. ej., `panel.203-0-113-10.sslip.io`) con HTTPS. Después cierra el puerto 3000 en el firewall.
3. **Proyecto → Create Service → Compose:**
   - **Provider:** GitHub (conecta la cuenta), repositorio `Avicola2-Platform`, rama `main`.
   - **Compose Path:** `deploy/compose.prod.yml`.
   - **Advanced:** activa **Isolated Deployment**. Así Dokploy conecta los servicios a su red sin romper la red interna entre `backend` y `n8n`.
4. **Environment:** pega las variables del `.env` de producción.
5. **Domains:**
   - `backend`: host `APP_DOMAIN`, puerto **8000**, HTTPS con **Let's Encrypt**.
   - `n8n`: agrégalo **solo cuando haga falta un webhook público** (p. ej., Telegram): host `N8N_DOMAIN`, puerto **5678**. Con Dokploy queda expuesto todo n8n, editor incluido, protegido por su propio login. Activa la verificación en dos pasos del usuario de n8n.
6. **Deploy.** Para que se actualice solo en cada `git push` a `main`, activa **Autodeploy**, o copia el webhook de la pestaña *Deployments* en GitHub.
7. **Respaldos:** en *Volume Backups*, programa copias de los volúmenes `backups` (dumps de la base) y `lakehouse` hacia un destino S3 (Cloudflare R2, Backblaze B2 o un bucket de GCS con interoperabilidad S3).

## B. Coolify

1. **Instalar** en el VPS:
   ```bash
   curl -fsSL https://cdn.coollabs.io/coolify/install.sh | bash
   ```
   El panel queda en `http://<ip>:8000`. Asígnale un dominio en *Settings* y cierra ese puerto.
2. **Project → New Resource → Docker Compose** (desde un repositorio de GitHub):
   - Rama `main`; **Docker Compose Location:** `/deploy/compose.prod.yml`.
   - **Base Directory:** `/` (la raíz del repo; el build usa `..` como contexto).
3. **Environment Variables:** pega las del `.env` de producción.
4. **Domains por servicio:** en Coolify, el puerto interno va pegado al dominio.
   - `backend`: `https://app.203-0-113-10.sslip.io:8000`.
   - `n8n`: solo si hace falta un webhook público, `https://n8n.203-0-113-10.sslip.io:5678`. Las mismas advertencias que en Dokploy.
5. **Deploy**, y activa el despliegue automático por *push* con la app de GitHub de Coolify.
6. **Respaldos:** programa copias del volumen `backups` (y de `lakehouse`) hacia un destino S3.

## C. Sin panel (VPS o VM de GCP)

1. **Preparar el servidor:** instala Docker, abre en el firewall solo 22, 80 y 443, y agrega swap si tiene menos de 4 GB:
   ```bash
   sudo REPO_URL=https://github.com/<usuario>/Avicola2-Platform.git bash deploy/bootstrap-vps.sh
   ```
   En GCP, abre los puertos 80 y 443 con las reglas de firewall de la VPC, y entra por SSH con `gcloud compute ssh --tunnel-through-iap`.
2. **Variables:** `cp deploy/production.env.example /opt/avicola2/.env` y complétalo.
3. **Levantar** (Caddy saca los certificados solo):
   ```bash
   cd /opt/avicola2
   docker compose -f deploy/compose.prod.yml -f deploy/compose.caddy.yml --env-file .env up -d --build
   ```
4. **Actualizar:** `git pull` y el mismo comando. Caddy deja pasar a n8n solo los webhooks (`/webhook/*`, `/form/*`); el editor queda cerrado desde internet.

## Frontend en Vercel (opcional)

Si la PWA se publica en Vercel y el backend queda en el VPS ([ADR 0007](adr/0007-frontend-en-vercel-con-proxy-api.md)), Vercel reenvía `/api/*` al backend. Así la cookie de sesión sigue siendo del mismo sitio y no hace falta CORS.

1. **`frontend/vercel.json`** tiene dos reenvíos de `/api/*`, elegidos por el host de Vercel:
   - Los dominios de producción (`avicola2-platform.vercel.app` y los alias de la rama `main`) van al backend de producción: `https://avicola.13-140-234-184.sslip.io`.
   - Cualquier otro host (rama `develop` y vistas previas) va al backend de develop: `https://avicola-dev.13-140-234-184.sslip.io`.

   Si cambia la IP, el dominio o el nombre del proyecto en Vercel, edita la expresión regular de `missing` y los dos destinos.
2. **En Vercel → Add New Project:** el repositorio, con **Root Directory** `frontend`. Vercel toma de `vercel.json` el comando `pnpm build` y la salida `dist`. Producción sigue la rama `main`; la rama `develop` se publica como vista previa en `avicola2-platform-git-develop-<equipo>.vercel.app`.
3. **Versión de pnpm:** `vercel.json` instala y compila con la versión exacta de `packageManager` (`npx pnpm@<versión>`), porque el pnpm por defecto de Vercel no lee el lockfile de pnpm 12 (`ERR_PNPM_BROKEN_LOCKFILE`) y corepack no siempre detecta `packageManager`. No hace falta `ENABLE_EXPERIMENTAL_COREPACK`.
4. **`TRUSTED_ORIGINS` en cada backend (Coolify)**, y redespliega. Sin esto, el backend rechaza el login reenviado por Vercel ("Origen no permitido").
   - Producción: los dominios exactos de producción, separados por coma.
   - Develop: `https://avicola2-platform-*-<equipo>.vercel.app` (comodín para `develop` y las vistas previas).
5. **Comprobar:** `https://<tu-proyecto>.vercel.app/api/health` responde `{"status":"ok",...}` a través del proxy, y el login funciona. Lo mismo en el dominio de la rama `develop`.

Vercel corta cada conexión reenviada a los 120 s. El canal de notificaciones en vivo se reconecta solo y, al reconectarse, la app vuelve a pedir lo pendiente.

## Después del primer despliegue (común)

1. **Comprobar:** `https://APP_DOMAIN/health` responde `{"status":"ok","database":"ok"}`.
2. **Primer supervisor** (los usuarios de prueba no existen en producción):
   ```bash
   docker compose -f deploy/compose.prod.yml exec backend python -m app.planning.infrastructure.cli init
   docker compose -f deploy/compose.prod.yml exec backend python -m app.planning.infrastructure.cli supervisor <usuario> "<Nombre Apellido>"
   ```
   - `init` carga el catálogo de productos.
   - `supervisor` muestra una contraseña temporal, que se cambia al entrar.
   - Después, el supervisor crea a los vendedores desde la pantalla **Usuarios**.

   En Dokploy y Coolify esto se corre desde la terminal del servicio `backend` (sin el prefijo `docker compose ... exec backend`).
3. **Editor de n8n** por túnel SSH, desde tu PC:
   ```bash
   ssh -L 5678:127.0.0.1:5678 usuario@<ip-del-vps>
   ```
   Abre `http://localhost:5678`, crea el usuario de n8n e importa `n8n/workflows/01_ingesta_excel.json` (*Workflows → Import from file*).
4. **Excel de prueba:** cópialo a la carpeta vigilada:
   ```bash
   docker compose -f deploy/compose.prod.yml cp archivo.xlsx n8n:/data/inbox/
   ```

## Actualizar sin hacer cosas a mano (IaC / GitOps)

- **Lo que define el despliegue está en el repo:** `deploy/compose.prod.yml`, el `Dockerfile` y las migraciones, que se aplican solas al arrancar. Con Dokploy o Coolify conectados a GitHub, un `git push` a `main` reconstruye y redespliega.
- **En el panel solo se configura una vez:** el proyecto, el repositorio, las variables y los dominios. Para que eso también sea código hay herramientas de la comunidad, todavía jóvenes:
  - [proveedor de Terraform para Coolify](https://pkg.go.dev/github.com/coolify-terraform/terraform-provider-coolify), versión 0.1.x.
  - [dokli](https://pypi.org/project/dokli/) para Dokploy: un manifiesto YAML con `plan` y `apply`.

  Para una sola app no compensan; conviene adoptarlas si se suman más servidores o entornos.

## Respaldos y restauración

- **Base (Supabase):** `db-backup` deja un `avicola2-AAAAMMDD-HHMM.dump` por día en el volumen `backups` y borra los de más de `BACKUP_KEEP_DAYS` días. Para restaurar (con un cliente de PostgreSQL 17):
  ```bash
  pg_restore --no-owner --clean --if-exists -d "postgresql://...:5432/postgres?sslmode=require" avicola2-20261103-0300.dump
  ```
- **Lakehouse:** el volumen `lakehouse`. Se puede rehacer desde los archivos de bronze y la ingesta, pero conviene respaldarlo con los demás.
- **Fuera del servidor:** un respaldo que solo vive en el mismo disco no protege si el servidor se pierde. Copia los volúmenes `backups` y `lakehouse` a S3 o GCS con el respaldo de volúmenes del panel o con `rclone`.

## Logs

- **Archivos:** `app.log`, `errors.log` y `frontend.log` en el volumen `logs` ([logs/README.md](../logs/README.md)).
- **Consola:** `docker compose -f deploy/compose.prod.yml logs -f backend`, o la pestaña *Logs* del panel.

## Lista de control

- [ ] `APP_ENV=production`, con `AUTH_SECRET`, `INGEST_API_TOKEN` y `N8N_ENCRYPTION_KEY` generados y guardados en un gestor de contraseñas.
- [ ] Firewall: solo 22, 80 y 443. El puerto del panel (3000 u 8000) cerrado tras asignarle un dominio.
- [ ] HTTPS activo en `APP_DOMAIN`. El login funciona y la cookie `nv_session` sale con `Secure`.
- [ ] Editor de n8n sin exponer a internet, o con verificación en dos pasos si se publicó su dominio.
- [ ] Respaldo de la base del día visible en el volumen `backups`, y copia fuera del servidor configurada.
- [ ] Primer supervisor creado y contraseña temporal cambiada.
