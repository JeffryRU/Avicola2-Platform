# ADR 0004 — Arquitectura hexagonal, base de datos intercambiable y app de vendedores como PWA

- **Estado:** aceptado
- **Fecha:** 2026-11-02

## Contexto

- El mockup de planificación de demanda (rama `mockup/noraves-app`) era un HTML de unas 1400 líneas con un servidor Node y **Azure SQL**. El resto de la plataforma usa FastAPI y **Supabase** ([ADR 0002](0002-supabase-como-base-de-datos.md)).
- Se pidió migrarlo a React + Vite como **PWA** (la usan los vendedores desde el celular), con Tailwind + shadcn/ui y validaciones con zod.
- Se pidió **arquitectura hexagonal estricta**, principios KISS, SOLID y DRY, y que el backend **no dependa del motor de base de datos**: hoy Supabase, más adelante quizá Azure SQL en producción.
- Los nombres de las tablas deben poder cambiarse en un solo lugar (no por columna).

## Decisión

### Backend: un módulo por contexto con capas hexagonales

```
backend/app/
├── shared/                         núcleo compartido
│   ├── domain/                     errores (DomainError, NotFoundError, AuthenticationError,
│   │                               ConflictError) y calendario de fechas pico
│   └── infrastructure/
│       ├── database/               engine por motor, nombres de tablas, metadata, sesión
│       ├── http/                   errores → HTTP, /health, servir la PWA
│       ├── lakehouse.py            bronze y tablas Delta (único que conoce LAKEHOUSE_URI)
│       └── calendar.py             feriados de Perú (calendario puro en shared/domain/calendar.py)
├── ingest/                         ingesta de Excel/CSV: bronze → silver → gold
│   ├── domain/                     esquema, catálogo, normalización, parseo y mapeos (Python puro)
│   ├── application/                puertos (Protocol), IngestService y casos de uso de mapeos/log
│   ├── infrastructure/             adaptadores: lector pandas, Delta, SQL, HTTP, plantilla, sintéticos
│   └── bootstrap.py                raíz de composición
└── planning/                       planificación de demanda (la app de vendedores)
    ├── domain/                     entidades y reglas (Python puro)
    ├── application/                puertos (Protocol) y casos de uso
    ├── infrastructure/             adaptadores: SQL, scrypt/JWT, reloj, ventas, forecast, HTTP, CLI
    └── bootstrap.py                raíz de composición: el único que une puertos y adaptadores
```

- **Dependencias hacia adentro:** `domain` no importa nada externo; `application` solo `domain` y sus puertos. `tests/test_architecture.py` lo verifica en cada `pytest`.
- **Puertos de salida** (`application/ports.py`): repositorios, `SalesSource`, `DemandForecaster`, `PasswordHasher`, `TokenService`, `Clock`. Cambiar una fuente (ERP real, modelo de ML) es escribir otro adaptador y tocar solo `bootstrap.py`.
- **La ingesta ya migró a esta estructura** (antes `app/ingest`, `app/lakehouse`, `app/api`, `app/synthetic` y `app/ml`); ver [Migración de la ingesta](#migración-de-la-ingesta).

### Base de datos independiente del motor

- **El motor sale de `DATABASE_URL`.** Todo el acceso es SQLAlchemy Core/ORM con tipos portables (`Uuid`, `Numeric`, `func.now()`), sin SQL propio de un motor.
- `shared/infrastructure/database/engine.py` tiene un **perfil por motor** (argumentos de conexión, si usa esquemas y cómo crearlos): Postgres/Supabase, SQL Server/Azure SQL (`pymssql` o `pyodbc`), MySQL y SQLite. Sumar un motor = sumar un perfil.
- **Esquema lógico → físico:** las tablas declaran el esquema `app`; el engine lo traduce con `schema_translate_map` a `DB_SCHEMA` (p. ej. `dbo` en Azure SQL) o lo omite en motores sin esquemas. Las migraciones usan `app_schema()` y `ref()` (`shared/infrastructure/database/migrations.py`) por la misma razón.
- **Azure SQL queda configurado pero apagado:** driver opcional (`uv sync --extra azure` o `DB_EXTRAS=azure` en Docker) y ejemplo en `.env.example`.
- Verificado: la cadena completa de migraciones, `alembic check`, la carga de datos y el downgrade corren en **Postgres 17** y en **SQLite**; los tests de la API corren sobre SQLite en memoria. **No se probó contra un SQL Server real.**

### Nombres de tablas en un solo lugar

- `backend/config/tables.yaml` mapea **nombre lógico → nombre físico** de cada tabla y define el esquema. El código (ORM, Core y migraciones nuevas) solo usa nombres lógicos (`TABLES["projections"]`).
- Renombrar una tabla ya creada exige además una migración que la renombre.

### Frontend: PWA con la misma separación por capas

```
frontend/src/
├── core/                 núcleo: fechas y formatos (domain), puertos y ApiError (application),
│                         cliente HTTP con zod y almacenamiento del navegador (infrastructure)
├── modules/
│   ├── auth/             domain · application · infrastructure · ui
│   └── planning/         domain · application · infrastructure · ui (pages, components, hooks)
├── ui/                   sistema de diseño: shadcn/ui, marca, gráficos, layout (sin negocio)
└── app/                  raíz de composición (container.ts), rutas y estructura
```

- **ESLint impone las capas** (`no-restricted-imports` en `eslint.config.js`): el dominio no importa React; la UI no importa adaptadores, los recibe por `useContainer()`.
- **zod** valida el formulario de login, el borrador de proyección (fechas, 1–7 días, 0–9999 unidades, al menos una unidad por día), **cada respuesta de la API** y lo que se lee de `localStorage`.
- **Tailwind v4 + shadcn/ui** con los tokens de color del mockup (marcas Noraves y Grupo Rocío) en `ui/styles/globals.css`.
- **PWA** (`vite-plugin-pwa`): instalable, con service worker; catálogo y vendedores se leen sin conexión. **Cola offline:** cada envío se guarda primero en el dispositivo; si no hay red queda "Por sincronizar" y se reenvía al volver la conexión (idempotente por `submission_id`).
- **FastAPI sirve el build** (`frontend/dist`) con fallback a `index.html`; la imagen Docker lo compila en una etapa previa.

## Alternativas consideradas

- **Mantener Node + Azure SQL del mockup:** dos backends y dos bases para una misma plataforma; el ML vive en Python.
- **Un repositorio SQL distinto por motor:** duplicaría la lógica (contra DRY). SQLAlchemy ya abstrae los dialectos; solo las diferencias reales (conexión, esquemas) van en el perfil.
- **Next.js o una app nativa:** el SSR no aporta (FastAPI sirve los estáticos) y una PWA cubre instalación, offline y cámara/micrófono a futuro.
- **Reescribir también la ingesta en el mismo cambio:** mayor riesgo sin beneficio inmediato para la app de vendedores; se hizo después, en un cambio aparte (ver abajo).

## Consecuencias

- La venta real (ERP) sigue **simulada** (`SimulatedSalesSource`), como en el mockup, hasta tener la fuente real.
- "Sugerir con historial" usa el **promedio del mismo día de la semana** (`WeekdayAverageForecaster`); el modelo de ML lo reemplazará por otro adaptador del mismo puerto.
- Los vendedores tienen su propia tabla (`np_sellers`) y login con JWT; el vendedor sale del token, nunca del cuerpo de la petición. Los hashes scrypt son compatibles con los del mockup.
- TypeScript queda en la versión 6 porque typescript-eslint aún no soporta TypeScript 7.

## Migración de la ingesta

- **Fecha:** 2026-11-02. La ingesta se reorganizó con las mismas capas, **sin cambiar el comportamiento**: los endpoints `/ingest/*` y `/health` (los que usa n8n) responden igual, incluido el OpenAPI, y `IngestService` sigue siendo la única ruta bronze → silver → gold.
- **Dominio puro:** `schemas.yaml` y `catalog.yaml` se modelan con dataclasses; pydantic los valida al cargarlos (`ingest/infrastructure/config.py`, con `TypeAdapter`). El parseo trabaja con filas (`list[dict]`) en vez de DataFrames; el agregado de claves repetidas replica la suma de `groupby.sum` de pandas (compensación de Kahan, vacíos ignorados) para dar los mismos números.
- **Puertos** (`ingest/application/ports.py`): `FileReader`, `BronzeStore`, `AnalyticsStore` (silver y gold), `IngestRepository`, `IngestionLogRepository` y `MappingRepository`. La validación de mapeos pasó del endpoint al dominio (`domain/mapping.py`) y sus errores llegan a HTTP por el manejador compartido (se sumó `ConflictError` → 409).
- **Compartido:** el acceso al lakehouse (`shared/infrastructure/lakehouse.py`), el `/health` y el calendario de Perú quedan en `shared`, porque también los usarán el forecast y otros contextos.
- **Verificado:** las respuestas de 56 llamadas a la API y el contenido de las tablas Delta resultantes son idénticos byte a byte antes y después del cambio; `tests/test_architecture.py` cubre ahora `ingest` y prohíbe pandas, pyarrow, deltalake, DuckDB, openpyxl y la configuración en `domain` y `application`.
