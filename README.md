# Avícola 2 — Plataforma de planificación de saca

Plataforma para centralizar los datos de las áreas de Avícola 2, predecir la demanda de pollo y planificar la saca sobre una sola fuente de verdad. Proyecto de taller (UPAO, Ingeniería de Sistemas).

- Arquitectura: [`docs/architecture.md`](docs/architecture.md)
- Supuestos por validar: [`docs/assumptions.md`](docs/assumptions.md)
- Decisiones (ADR): [`docs/adr/`](docs/adr/)

## Estado

**Paso 1 del MVP (infraestructura) listo:**
- `docker-compose.yml` con perfil `lite` (n8n + backend), `full` (+ Ollama) y `localdb` (Postgres local).
- Backend FastAPI con `/health`, SQLAlchemy 2 y migraciones de Alembic (esquema `app`).
- Base de datos en **Supabase Cloud** (app en el esquema `app`, n8n en el esquema `n8n`).

**Paso 2 del MVP (datos sintéticos y plantilla) listo:**
- `scripts/generate_synthetic.py`: 18 meses de pedidos, proyecciones, saca y excedentes en `data/synthetic/`, más 5 Excel de ejemplo en `data/samples/`.
- `scripts/generate_template.py`: plantilla de carga con listas desplegables y validaciones en `data/templates/`.
- Catálogo de canales y productos configurable en `backend/config/catalog.yaml`.

**Paso 3 del MVP (ingesta) listo:**
- `backend/config/schemas.yaml`: esquemas de silver, alias de columnas, claves de merge y ruteo por `tipo`.
- `/ingest/upload` y `/ingest/transform`: bronze → validación por fila → silver (Delta, merge por clave) → `gold.daily_demand`, con registro en `ingestion_log`.
- Mapeo de columnas: alias → mapeo confirmado → pendiente (`/ingest/mappings`), con reproceso automático al confirmar.
- Workflow `n8n/workflows/01_ingesta_excel.json`: vigila `data/inbox` y envía cada Excel o CSV al backend.
- `scripts/load_synthetic.py`: carga el histórico sintético por la misma ruta de ingesta.

**App de planificación de demanda (vendedores) lista** — migración del mockup Noraves ([ADR 0004](docs/adr/0004-arquitectura-hexagonal-y-base-de-datos-intercambiable.md)):
- PWA en `frontend/` (React + Vite + Tailwind + shadcn/ui + zod), pensada para el celular, instalable y con cola offline.
- API `/api/*` en el backend con arquitectura hexagonal (`backend/app/planning`), login de vendedores con JWT.
- Base de datos intercambiable por `DATABASE_URL`: Supabase hoy; Azure SQL configurado para más adelante. Nombres de tablas en `backend/config/tables.yaml`.

## Requisitos

- Docker Desktop (con Compose v2.20 o superior).
- [uv](https://docs.astral.sh/uv/), solo para correr el backend o los tests fuera de Docker.
- Node 24 y pnpm, solo para desarrollar el frontend fuera de Docker.
- Un proyecto en [Supabase](https://supabase.com) (plan gratuito), o usar el perfil `localdb` sin internet.

## Puesta en marcha

1. **Configurar el entorno:**
   ```bash
   cp .env.example .env
   ```
   Completa en `.env`:
   - **Datos de conexión de Supabase.** En el dashboard: **Connect → Session pooler**. Se usa el host `aws-0-<region>.pooler.supabase.com`, el puerto `5432` y el usuario `postgres.<project-ref>`.
   - **`N8N_ENCRYPTION_KEY`** con una clave aleatoria larga (`openssl rand -hex 32`). No la cambies después, porque cifra las credenciales que guarda n8n.
   - **`AUTH_SECRET`** con otra clave aleatoria larga: firma las sesiones de los vendedores.

2. **Levantar los servicios:**
   ```bash
   docker compose up -d
   ```
   El backend aplica las migraciones al arrancar.
   - App de vendedores (PWA): http://127.0.0.1:8000
   - Backend: http://127.0.0.1:8000/health · documentación de la API: http://127.0.0.1:8000/docs
   - n8n: http://127.0.0.1:5678

3. **Sin internet (Postgres local en lugar de Supabase):** ajusta `.env` según la sección "perfil localdb" de `.env.example` y luego:
   ```bash
   docker compose --profile localdb up -d
   ```

4. **Datos de la app de vendedores** (productos, vendedores y, si quieres, 3 semanas de ejemplo):
   ```bash
   docker compose exec backend python -m app.planning.infrastructure.cli init
   docker compose exec backend python -m app.planning.infrastructure.cli seed
   ```
   Usuarios de prueba: `jperez`, `mrios`, `cleon` (contraseña `PLANNING_DEMO_PASSWORD`, por defecto `demo1234`).

## App de planificación de demanda

- **Base de datos:** la elige `DATABASE_URL` (Supabase, Azure SQL, Postgres local o SQLite para demos). Para Azure SQL ver la sección correspondiente de `.env.example`.
- **Nombres de tablas:** `backend/config/tables.yaml` (renombrar una tabla ya creada requiere una migración).
- **Catálogo y usuarios de prueba:** `backend/config/planning_seed.yaml`. Los usuarios de prueba (`supervisor`, `jperez`, `mrios`, `cleon`, contraseña `demo1234`) solo se crean con `APP_ENV=local`.
- **Comandos** (`cd backend`): `uv run python -m app.planning.infrastructure.cli init | seed | show [n] | clear --yes | supervisor <usuario> "<nombre>"`.
- **Cuentas y seguridad** ([ADR 0005](docs/adr/0005-seguridad-de-sesion-y-cuentas.md)):
  - La sesión va en una cookie HttpOnly. El token no aparece en las respuestas ni en el almacenamiento del navegador.
  - El **supervisor** crea las cuentas y restablece las contraseñas olvidadas desde la pantalla **Usuarios**: entrega una contraseña temporal que el vendedor cambia al entrar.
  - Tras 5 intentos fallidos la cuenta se bloquea 15 minutos.
  - Cada vendedor ve solo sus datos.
- **En producción** (`APP_ENV` distinto de `local`):
  - La API no arranca sin un `AUTH_SECRET` de al menos 32 caracteres, sin `INGEST_API_TOKEN` o sin HTTPS para la cookie.
  - El primer supervisor se crea con `cli supervisor`.
- **Venta real:** todavía simulada, como en el mockup. **"Sugerir con historial":** promedio del mismo día de la semana; ahí se conectará el modelo de ML.

## Desarrollo del frontend

```bash
cd frontend
pnpm install
pnpm dev            # http://localhost:5173 (reenvía /api al backend en 127.0.0.1:8000)
pnpm lint && pnpm test && pnpm build
```

Las capas (`domain`, `application`, `infrastructure`, `ui`) las vigila ESLint: el dominio no importa React y la interfaz no importa adaptadores.

## Datos sintéticos y plantilla

Desde la raíz del repo:

```bash
uv run --project backend python scripts/generate_template.py
uv run --project backend python scripts/generate_synthetic.py            # histórico hasta ayer
uv run --project backend python scripts/generate_synthetic.py --end 2026-10-14 --seed 42
uv run --project backend python scripts/load_synthetic.py               # carga el histórico en el lakehouse
```

## Ingesta

- **Manual:** deja un `.xlsx`, `.xls` o `.csv` en `data/inbox/`. El workflow `01_ingesta_excel` de n8n lo envía al backend (cómo importarlo y activarlo: [`n8n/workflows/README.md`](n8n/workflows/README.md)).
- **Por API:** necesitas el token `INGEST_API_TOKEN` del `.env`:
  ```bash
  curl -H "X-Api-Token: $INGEST_API_TOKEN" -F file=@data/samples/Horeca_comercial1_20261014.xlsx http://127.0.0.1:8000/ingest/upload
  ```
- **Mapeos pendientes:** `GET /ingest/mappings`. Para confirmar uno, `POST /ingest/mappings/{id}/confirm` con `{"mapping": {"Peso neto (kg)": "qty_kg", "=type": "proyeccion"}}`.
- **Documentación interactiva:** http://127.0.0.1:8000/docs

## Despliegue

Ver [docs/deploy.md](docs/deploy.md). La carpeta `deploy/` sirve para tres caminos:
- **Dokploy** (recomendado en un VPS) o **Coolify**: despliegan `deploy/compose.prod.yml` desde GitHub y se actualizan solos en cada `git push`.
- **Sin panel** (VPS o VM de GCP): `deploy/bootstrap-vps.sh` prepara el servidor y Caddy pone el HTTPS.

Sin dominio propio sirve sslip.io (`app.<ip>.sslip.io`). Incluye un respaldo diario de la base.

## Desarrollo del backend

```bash
cd backend
uv sync
uv run alembic upgrade head          # aplica migraciones a DATABASE_URL
uv run alembic revision --autogenerate -m "descripción"   # nueva migración
uv run uvicorn app.main:app --reload
uv run ruff check . && uv run ruff format .
uv run pytest
```

> En Windows, usa `127.0.0.1` y no `localhost` en las URLs de base de datos del `.env`: `localhost` resuelve primero a IPv6 y la conexión se queda colgada.

### Logs

Los logs quedan en [`logs/`](logs/README.md): `app.log` (peticiones, logins, envíos, cargas), `errors.log` (solo errores del backend, con la traza) y `frontend.log` (errores que la PWA reporta desde el navegador del vendedor). Cada respuesta trae la cabecera `X-Request-ID`; buscándola en los logs se ve todo lo que pasó en esa petición. Se ajustan con `LOG_LEVEL`, `LOG_FORMAT` (`text` | `json`) y `LOG_TO_FILES` en el `.env`. El código está en `backend/app/shared/infrastructure/logging/`.

## Estructura

```
backend/        FastAPI, SQLAlchemy, Alembic (app/db/migrations)
  app/shared/     núcleo hexagonal: errores de dominio, base de datos por motor, HTTP
  app/planning/   app de vendedores: domain · application · infrastructure · bootstrap.py
  config/         schemas.yaml, catalog.yaml, tables.yaml, planning_seed.yaml
frontend/       PWA (React + Vite + Tailwind + shadcn/ui + zod): core · modules · ui · app
n8n/workflows/  workflows exportados
data/           inbox (carpeta vigilada), lakehouse local, plantillas y ejemplos
logs/           app.log, errors.log y frontend.log (no se versionan)
docs/           arquitectura, supuestos y ADR
```
