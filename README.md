# AviPlanner — Planificación de demanda y saca de pollo

**AviPlanner** centraliza los datos de las áreas de Avícola 2 (el cliente), predice la demanda de pollo y calcula cuánto pedir a granja (la **saca**) sobre una sola fuente de verdad. Proyecto de taller (UPAO, Ingeniería de Sistemas).

- Arquitectura: [`docs/architecture.md`](docs/architecture.md)
- Supuestos por validar: [`docs/assumptions.md`](docs/assumptions.md)
- Decisiones (ADR): [`docs/adr/`](docs/adr/)
- Despliegue: [`docs/deploy.md`](docs/deploy.md)

## Qué hace

| Parte | Para quién | Qué resuelve |
|---|---|---|
| **Proyecciones** | Vendedores | Registran lo que estiman vender por producto y día, desde el celular y sin conexión (cola offline). Botón «Sugerir» con el modelo de demanda. |
| **Dashboards** | Supervisores | Resumen semanal, proyección vs. venta real (de ARIS) y quién registró cada día. |
| **Stock y producción** | Jefe de despacho | Stock de despacho y producción diaria por rango (pedido, llegada, calidad B y peso de la parvada). |
| **Saca** | Supervisores | Cuánto pedir a granja por tipo: `stock − pedidos de mañana + proyección de pasado mañana + plus`, con la llegada estimada por rango. |
| **Datos de ARIS** | Supervisores y n8n | Carga incremental del export de DESPACHO y VENTAS (solo reemplaza las fechas que trae el archivo). Desde la app, Google Drive, Telegram o WhatsApp. |
| **Modelo de demanda** | Supervisores | Métricas de los modelos y cuál se usa en cada parte. Se reentrena solo al subir datos nuevos y de madrugada. |
| **Asistente** | Todos | Chat con IA en la app, Telegram y WhatsApp que responde con los permisos de quien pregunta. |
| **Cuentas y roles** | Supervisores | Vendedor, jefe de despacho, supervisor y supervisor general. Habilitaciones y horario de corte para editar días cerrados. |

Hay una **PWA** (web instalable) y una **app móvil** nativa para Android e iOS.

## Modelos

| Parte | Modelo |
|---|---|
| **Demanda** | Compiten 10 modelos sobre la historia de ARIS (división temporal 70/15/15) y para cada uso gana el de menor error. Machine learning: **gradient boosting** (`HistGradientBoostingRegressor`, pérdida Poisson) en cuatro variantes: boosting, maestro (todas las series), destilado y apilado. Estadísticos: mediana de 4 semanas, suavizado exponencial, Croston TSB y SBA, por cliente y un promedio robusto de 6 modelos. |
| **Llegada por rango** | Suavizado exponencial con distintas vidas medias y un híbrido con **gradient boosting** que corrige según el peso de la parvada. Se ajusta solo cada vez que cambia la producción. |
| **Saca** | Fórmula del negocio sobre stock, pedidos, proyección y plus (no es un modelo). |
| **Asistente** | Modelos de lenguaje de Claude (`AGENT_MODEL`, `ASSISTANT_MODEL`, `ASSISTANT_VISION_MODEL`). |

La comparación de modelos está en [`notebooks/modelo_demanda.ipynb`](notebooks/modelo_demanda.ipynb) y en `scripts/compare_*.py`. Decisiones: [ADR 0013](docs/adr/0013-modelo-de-llegada-que-se-ajusta-solo.md) (llegada), [ADR 0019](docs/adr/0019-modelo-de-demanda-contra-la-venta-real.md) y [ADR 0020](docs/adr/0020-un-modelo-de-demanda-por-uso.md) (demanda).

## Arquitectura

```
PWA (React) ─┐                                      ┌─ db: Postgres 17 (app y n8n)
App móvil ───┼─→ backend (FastAPI, hexagonal) ──────┼─ redis: caché
Telegram ────┤        ↑ MCP /mcp (solo lectura)     └─ lakehouse: Delta (bronze/silver/gold)
WhatsApp ────┴─→ n8n (ingesta, recordatorios, agente de IA)
                      db-copy: copia a Supabase cada 15 min · db-backup: volcados diarios
```

- **Backend:** FastAPI + SQLAlchemy 2 + Alembic, con arquitectura hexagonal (`domain`, `application`, `infrastructure`). Las capas las vigila `import-linter` ([ADR 0004](docs/adr/0004-arquitectura-hexagonal-y-base-de-datos-intercambiable.md), [ADR 0016](docs/adr/0016-capas-con-import-linter-y-fuentes-unicas.md)).
- **Frontend:** React + Vite + Tailwind + shadcn/ui + zod, organizado por features ([ADR 0008](docs/adr/0008-frontend-por-features.md)). El backend sirve la PWA ya compilada.
- **Base de datos:** Postgres en el mismo servidor; Supabase recibe una copia y sirve de respaldo ([ADR 0023](docs/adr/0023-base-local-en-el-vps-y-copia-en-supabase.md)). La base se elige con `DATABASE_URL` (Postgres, Supabase, Azure SQL o SQLite para demos).
- **Configuración en YAML** (`backend/config/`): catálogo, tablas, archivos de carga ([ADR 0021](docs/adr/0021-archivos-de-carga-en-yaml.md)), feriados, asistente y usuarios de prueba.
- **Asistente:** chat en la app que pasa por el backend hacia el agente de n8n ([ADR 0022](docs/adr/0022-asistente-en-la-app-para-todos.md), [ADR 0024](docs/adr/0024-historial-tablas-y-canales-del-asistente.md)).

## Requisitos

- Docker con Compose v2.20 o superior.
- [uv](https://docs.astral.sh/uv/), para el backend o los tests fuera de Docker.
- Node 24 y pnpm, para el frontend fuera de Docker.
- Un proyecto de [Supabase](https://supabase.com) (opcional), o el perfil `localdb` sin internet.

## Puesta en marcha

1. **Entorno:**
   ```bash
   cp .env.example .env
   ```
   Completa en `.env` al menos:
   - `DATABASE_URL`: Supabase (**Connect → Session pooler**) o el Postgres local (ver «perfil localdb» en `.env.example`).
   - `AUTH_SECRET` y `N8N_ENCRYPTION_KEY`: claves aleatorias largas (`openssl rand -hex 32`). No cambies la de n8n después: cifra sus credenciales.
   - `INGEST_API_TOKEN`: token con el que n8n llama a la API.

2. **Levantar los servicios:**
   ```bash
   docker compose up -d                      # con Supabase
   docker compose --profile localdb up -d    # con Postgres local
   ```
   El backend aplica las migraciones al arrancar.
   - App (PWA) y API: http://127.0.0.1:8000 · documentación: http://127.0.0.1:8000/docs
   - Salud: `/health` (proceso) y `/health/ready` (con base)
   - n8n: http://127.0.0.1:5678
   - Perfil `full`: agrega Ollama para un modelo de lenguaje local.

3. **Datos iniciales:**
   ```bash
   docker compose exec backend python -m app.planning.infrastructure.cli init
   docker compose exec backend python -m app.planning.infrastructure.cli seed
   ```
   Con `APP_ENV=local` se crean usuarios de prueba (`general`, `supervisor`, `despacho` y 7 vendedores) con la contraseña `PLANNING_DEMO_PASSWORD` (por defecto `demo1234`).

## Comandos del backend

`python -m app.planning.infrastructure.cli <comando>` (dentro del contenedor, o `uv run` desde `backend/`):

| Comando | Qué hace |
|---|---|
| `init` | Productos y, en local, usuarios de prueba. |
| `seed` · `show [n]` · `clear --yes` | 3 semanas de ejemplo, resumen y borrar proyecciones. |
| `supervisor <usuario> "<nombre>" [--general]` | Crea un supervisor con contraseña inicial. En producción, el primero debe ser `--general`. |
| `rol <usuario> <rol>` | Cambia el rol: `seller`, `dispatch_chief`, `supervisor`, `general_supervisor`. |
| `vendedores [--simple] [--reset]` | Cuentas de los vendedores de la tabla maestra. |
| `historia [carpeta]` | Carga completa de datos reales desde `data/inbox/`: `DESPACHO*.csv`, `VENTAS*.csv` y el Excel de producción. Reemplaza lo anterior. |
| `produccion <archivo.xlsx>` | Historia de producción (hoja `DB_CALIDA_B`). |
| `tiendas <archivo.xlsx>` | Pedidos de brasa de las tiendas para la saca. |
| `entrenar` | Entrena los modelos de demanda (también lo hace el programador). |
| `archivos` | Qué archivos acepta la app, sus columnas y qué módulos los usan. |

## Carga de datos

- **Export de ARIS (DESPACHO y VENTAS):** Excel o CSV, hasta 80 MB. Se reemplazan solo las fechas que trae el archivo, así que se puede subir un día, una semana o todo, y repetirlo sin duplicar.
  - Desde la app: pantalla **ARIS** (supervisores).
  - Desde n8n: workflows `04_drive_aris`, `05_telegram_aris` y `06_whatsapp_aris`, que llaman a `POST /api/internal/aris` con `X-Api-Token`.
- **Columnas reconocidas:** `backend/config/imports.yaml`. Los títulos se comparan sin tildes, mayúsculas ni espacios; si ARIS cambia uno, se agrega un alias sin tocar el código. Las filas con valores inválidos se descartan y la respuesta dice cuáles y por qué.
- **Ingesta al lakehouse:** deja un `.xlsx` o `.csv` en `data/inbox/` (workflow `01_ingesta_excel`) o súbelo a `POST /ingest/upload` con `X-Api-Token`. Pasa por bronze → silver (Delta) → `gold.daily_demand`.

## Workflows de n8n

En `n8n/workflows/` (cómo importarlos: [`n8n/workflows/README.md`](n8n/workflows/README.md)):

| Workflow | Qué hace |
|---|---|
| `01_ingesta_excel` | Envía al backend los archivos que caen en `data/inbox/`. |
| `02_recordatorio_proyeccion` | Recordatorio diario a los vendedores que no registraron. |
| `03_agente_chatbot` | Agente para el chat de supervisores. |
| `04_drive_aris` · `05_telegram_aris` · `06_whatsapp_aris` | Carga del export de ARIS desde cada canal. |
| `07_asistente_app` | Agente del asistente de la app, Telegram y WhatsApp, que consulta el MCP como la persona que pregunta. |

## Seguridad

- Sesión en cookie HttpOnly en la web y `Authorization: Bearer` en la app móvil (`POST /api/auth/token`).
- Permisos por rol en una sola fuente; cada vendedor ve solo sus datos.
- La cuenta se bloquea 15 minutos tras 5 intentos fallidos.
- En producción (`APP_ENV` distinto de `local`) la API no arranca sin `AUTH_SECRET` de 32 caracteres o más, sin `INGEST_API_TOKEN` o sin HTTPS para la cookie.
- El MCP es de solo lectura, con límite de llamadas y auditoría. El asistente usa un pase de 5 minutos con los permisos de quien pregunta.

## Desarrollo

**Backend:**
```bash
cd backend
uv sync
uv run alembic upgrade head
uv run uvicorn app.main:app --reload
uv run ruff check . && uv run ruff format .
uv run lint-imports
uv run pytest
```

**Frontend:**
```bash
cd frontend
pnpm install
pnpm dev                              # http://localhost:5173, reenvía /api a 127.0.0.1:8000
pnpm lint && pnpm test && pnpm build
```

**App móvil:** ver [`mobile/README.md`](mobile/README.md). Se publica en GitHub Releases al crear un tag `v*`.

**Datos sintéticos** (desde la raíz):
```bash
uv run --project backend python scripts/generate_template.py
uv run --project backend python scripts/generate_synthetic.py
uv run --project backend python scripts/load_synthetic.py
```

> En Windows, usa `127.0.0.1` y no `localhost` en las URLs de base de datos: `localhost` resuelve primero a IPv6 y la conexión se queda colgada.

**Logs:** en [`logs/`](logs/README.md) (`app.log`, `errors.log`, `frontend.log`). Cada respuesta trae `X-Request-ID` para seguir una petición. Se ajustan con `LOG_LEVEL`, `LOG_FORMAT` y `LOG_TO_FILES`.

## Despliegue

Guía completa: [`docs/deploy.md`](docs/deploy.md). `deploy/compose.prod.yml` levanta backend, Postgres, Redis, n8n, la copia a Supabase (`db-copy`) y los respaldos diarios (`db-backup`). Variables de producción: `deploy/production.env.example`.

- **Coolify o Dokploy** en un VPS: despliegan el compose desde GitHub y se actualizan en cada `git push`.
- **Sin panel:** `deploy/bootstrap-vps.sh` prepara el servidor y Caddy pone el HTTPS (`deploy/compose.caddy.yml`).
- **Frontend en Vercel** (opcional): `frontend/vercel.json` reenvía `/api` al backend; configura `TRUSTED_ORIGINS` con el dominio de Vercel.

Sin dominio propio sirve sslip.io (`app.<ip>.sslip.io`). El editor de n8n solo se abre por túnel SSH; sus webhooks, por `N8N_DOMAIN`.

## Estructura

```
backend/
  app/planning/     app principal: domain · application · infrastructure · bootstrap.py
  app/ingest/       ingesta al lakehouse (bronze → silver → gold)
  app/shared/       núcleo: errores, base de datos por motor, HTTP, logs
  app/db/           migraciones de Alembic
  config/           catalog, tables, imports, feriados, assistant, planning_seed (YAML)
frontend/src/
  app/              composición, rutas y estructura
  features/         una carpeta por parte del negocio (projections, saca, aris, model, assistant…)
  shared/           interfaz y utilidades comunes
mobile/             app Kotlin Multiplatform (Android e iOS)
n8n/workflows/      workflows exportados
deploy/             compose de producción, Caddy, Traefik y script del VPS
notebooks/          comparación de modelos de demanda
scripts/            datos sintéticos, plantillas y comparación o entrenamiento de modelos
data/               inbox, lakehouse local, plantillas y ejemplos
logs/               logs del backend y de la PWA (no se versionan)
docs/               arquitectura, supuestos, despliegue y ADR
```
