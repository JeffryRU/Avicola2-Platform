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

## Requisitos

- Docker Desktop (con Compose v2.20 o superior).
- [uv](https://docs.astral.sh/uv/), solo para correr el backend o los tests fuera de Docker.
- Un proyecto en [Supabase](https://supabase.com) (plan gratuito), o usar el perfil `localdb` sin internet.

## Puesta en marcha

1. **Configurar el entorno:**
   ```bash
   cp .env.example .env
   ```
   Completa en `.env`:
   - **Datos de conexión de Supabase.** En el dashboard: **Connect → Session pooler**. Se usa el host `aws-0-<region>.pooler.supabase.com`, el puerto `5432` y el usuario `postgres.<project-ref>`.
   - **`N8N_ENCRYPTION_KEY`** con una clave aleatoria larga (`openssl rand -hex 32`). No la cambies después, porque cifra las credenciales que guarda n8n.

2. **Levantar los servicios:**
   ```bash
   docker compose up -d
   ```
   El backend aplica las migraciones al arrancar.
   - Backend: http://127.0.0.1:8000/health · documentación de la API: http://127.0.0.1:8000/docs
   - n8n: http://127.0.0.1:5678

3. **Sin internet (Postgres local en lugar de Supabase):** ajusta `.env` según la sección "perfil localdb" de `.env.example` y luego:
   ```bash
   docker compose --profile localdb up -d
   ```

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

## Estructura

```
backend/        FastAPI, SQLAlchemy, Alembic (app/db/migrations)
n8n/workflows/  workflows exportados
data/           inbox (carpeta vigilada), lakehouse local, plantillas y ejemplos
docs/           arquitectura, supuestos y ADR
```
