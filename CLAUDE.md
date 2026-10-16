# CLAUDE.md — Avicola2-Platform

Plataforma de **planificación de saca** para **Avícola 2** (taller universitario UPAO, Ingeniería de Sistemas). Centraliza los Excel de cada área en un lakehouse, predice la demanda de pollo con ML, usa IA generativa para capturar y consultar datos, y ofrece una app web donde Comercial, Producción y los canales trabajan sobre una sola fuente de verdad.

**Antes de generar código, lee:**
- [`docs/architecture.md`](docs/architecture.md): especificación completa (proceso, datos, ML, IA, workflows, pantallas).
- [`docs/assumptions.md`](docs/assumptions.md): lo que aún no está confirmado.
- [`docs/adr/`](docs/adr/): decisiones tomadas. Empieza por la [0001](docs/adr/0001-almacenamiento-gcs-y-despliegue-en-vm.md).

---

## Restricciones obligatorias
- **n8n es obligatorio** como orquestador.
- **Hay que integrar IA generativa**, además del modelo de forecast.
- **Funciona en local** (Windows + Docker Desktop) y **se despliega en GCP** (una VM de Compute Engine + GCS).
- **Base de datos: Supabase Cloud** ([ADR 0002](docs/adr/0002-supabase-como-base-de-datos.md)), conectada por el pooler en modo sesión.
- **Hardware limitado:** el perfil `lite` debe consumir menos de unos 2.5 GB de RAM (con `mem_limit` por servicio).
- **Interfaz en español. Código en inglés** (variables, funciones, tablas, columnas).
- **Commits sin atribución a Claude:** sin `Co-Authored-By` ni enlaces de sesión (configurado en `.claude/settings.json`).

## Arquitectura en una línea
`Excel / Telegram → n8n → FastAPI → Lakehouse Delta (LAKEHOUSE_URI: ./data/lakehouse o gs://...) + Supabase (Postgres) ← React`

| Componente | Hace | No hace |
|---|---|---|
| **n8n** | Detectar archivos, guardar crudos en bronze, llamar endpoints, cron, notificaciones, flujos con LLM | Transformar datos, lógica de negocio, escribir en la base de la app |
| **FastAPI** | API, lógica de negocio, bronze→silver→gold, predicción, DuckDB, `ingestion_log` | Programar tareas ni enviar mensajes |
| **ml-train** | Entrenar y hacer backtest (contenedor de un solo uso) | Atender peticiones de usuario |
| **Supabase Cloud (Postgres)** | Estado de la app (esquema `app`) y de n8n (esquema `n8n`) | Histórico analítico. Auth, Storage y Data API **no** se usan |
| **Lakehouse (Delta)** | Histórico analítico y archivos crudos | Datos transaccionales |
| **React** | UI por rol (estáticos servidos por FastAPI) | Lógica de negocio |

**Stack:**
- Python 3.12, FastAPI, SQLAlchemy 2 + Alembic, Pydantic v2, uv, ruff.
- `deltalake` + DuckDB, statsforecast, lightgbm.
- React + Vite + TS, shadcn/ui + Tailwind, TanStack Query, Recharts, pnpm.
- Docker Compose. **Sin MinIO, Spark, Airflow ni Kafka.**

---

## Reglas de diseño (no romper)

**Datos**
- **Ningún esquema de silver va fijo en el código.** Se define en `backend/config/schemas.yaml` (columnas, tipos, alias, `merge_keys`, `granularity`). Si cambian los datos reales, se edita el YAML.
- **Contrato mínimo para el forecast:** `date`, `channel`, `product` (o `"TOTAL"`) y `qty_kg`. Los campos opcionales no pueden romper nada.
- **Mapeo de columnas, en este orden:** alias del YAML → `column_mappings` confirmado → propuesta del LLM (pendiente de confirmar).
- **Nombres sin sufijo `_id`** en silver y gold (`customer`, `product`).

**Lakehouse**
- **Toda ruta del lakehouse sale de `LAKEHOUSE_URI`.** Nunca escribir rutas locales ni `gs://` fijas en el código.
- **Escrituras con `merge` (upsert)** por clave natural; nunca hacer append ciego.
- **Un solo escritor de Delta** (backend o ml-train), con escrituras serializadas. n8n solo escribe en bronze.
- **`model_version` guarda la versión Delta** del dataset de entrenamiento. No ejecutar `VACUUM` sobre versiones referenciadas.
- **DuckDB con `memory_limit` y `threads`** desde `.env`. Sobre GCS, leer con `deltalake` → Arrow → DuckDB (sin HMAC).

**ML**
- **El baseline naive estacional es obligatorio;** todo se compara contra él.
- **Backtest con rolling origin**, nunca un split aleatorio. WAPE es la métrica principal.
- **Parámetros (estacionalidad, lags, calendario) según `granularity`** (`daily` | `weekly`).
- **Nunca entrenar dentro de una petición HTTP:** el entrenamiento corre en `ml-train`, lanzado por el cron.
- **Saca sugerida:** `forecast + margen → / yield_factor → / avg_live_weight_kg`, en kg y en aves. Los factores son configurables.

**Base de datos (Supabase)**
- **Tablas de la app siempre en el esquema `app`**, nunca en `public` (Supabase expone `public` por su Data API). Todo cambio de esquema, por migración de Alembic.
- **Conexión por el pooler en modo sesión** (puerto 5432, IPv4, `sslmode=require`). No usar la conexión directa (solo IPv6) ni el puerto 6543.
- **Hosts de Postgres en `.env` como `127.0.0.1`**, no `localhost` (en Windows `localhost` resuelve a IPv6 y Docker no responde ahí).
- **Sin internet:** perfil `localdb` (Postgres local que imita a Supabase).

**App**
- **Usuarios con rol `canal`:** siempre filtrados por su `channel`.
- **Estados del plan de saca:** `varchar` validado desde la configuración, no un ENUM de Postgres.
- **Text-to-SQL:** la lista blanca, el modo de solo lectura y el límite de filas los impone el backend, nunca el LLM.

**Proceso**
- **El flujo As-Is no está confirmado.** No acoplar la lógica a un orden de pasos. Ante una duda, elegir la opción más simple, dejarla configurable y registrarla en `docs/assumptions.md` o en un ADR.
- **Mantener independientes ingesta, ML y app**, de modo que se pueda rehacer una sin tocar las otras.

**Entorno**
- **Todo parametrizado en `.env`;** `.env.example` documenta cada variable.
- **LLM por API** (`LLM_PROVIDER=anthropic`) en la nube y en la laptop antigua. Ollama solo en el perfil `full`.
- **Imágenes slim.**

---

## Trampas conocidas
- **Local File Trigger de n8n en Windows + Docker:** sin **polling** no detecta archivos. Hay que verificar además que el nodo esté habilitado en la versión de n8n.
- **Telegram Trigger:** necesita HTTPS público. En local hace falta un túnel o `getUpdates`; en GCP lo resuelve Caddy.
- **StatsForecast (numba):** la primera ejecución compila con JIT y genera picos de RAM y tiempo. Esa es una razón más para que `ml-train` vaya aparte.
- **Supabase gratuito se pausa** tras ~1 semana sin uso: reactivarlo antes de una demo.
- **Demanda censurada:** los días con recorte no reflejan la demanda real (ver `docs/assumptions.md`).

---

## Estructura del repositorio
```
Avicola2-Platform/
├── CLAUDE.md · README.md · docker-compose.yml · .env.example · Caddyfile
├── frontend/                 # React + Vite (build → servido por el backend)
├── backend/
│   ├── app/
│   │   ├── api/              # routers por módulo
│   │   ├── core/             # config, seguridad, logging
│   │   ├── db/               # SQLAlchemy y Alembic
│   │   ├── lakehouse/        # Delta + DuckDB (única capa que conoce LAKEHOUSE_URI)
│   │   ├── ingest/           # validación y transformaciones
│   │   └── ml/               # features, modelos, backtest, entrypoint de ml-train
│   ├── config/schemas.yaml
│   ├── models/               # artefactos en local (en GCP: {LAKEHOUSE_URI}/models)
│   ├── tests/
│   └── pyproject.toml
├── n8n/workflows/            # JSON exportados
├── data/
│   ├── inbox/                # carpeta vigilada en local
│   ├── lakehouse/            # Delta local (no se versiona)
│   ├── templates/            # plantilla Excel
│   └── samples/              # Excel de ejemplo
├── scripts/                  # generate_synthetic.py, seed, deploy
└── docs/                     # architecture.md, assumptions.md, adr/
```

## Comandos (a completar cuando exista el código)
- Levantar en local: `docker compose up -d` (perfil lite contra Supabase) · sin internet: `docker compose --profile localdb up -d`
- Migraciones: `cd backend && uv run alembic upgrade head` (el contenedor backend también las aplica al arrancar)
- Entrenar: `docker compose run --rm ml-train`
- Backend: `uv run ruff check . && uv run pytest`
- Frontend: `pnpm lint && pnpm build`

## Convenciones
- **Python:** ruff (lint + format), type hints y docstrings breves.
- **TypeScript:** modo estricto, ESLint y Prettier.
- **Commits:** en español, estilo convencional (`feat:`, `fix:`, `docs:`) y **sin atribución a Claude**.
- **No subir** datos reales, `.env`, `data/lakehouse/` ni artefactos pesados.
- **Decisiones de arquitectura relevantes:** ADR en `docs/adr/`.
- **Definición de terminado:** levanta con `docker compose --profile lite up`, tiene tests mínimos (validación de ingesta y backtest) y el README está actualizado.
