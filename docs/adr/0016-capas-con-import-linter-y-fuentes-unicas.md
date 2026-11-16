# ADR 0016: capas verificadas con import-linter, `shared/` como módulo común y una sola fuente por regla

- **Estado:** aceptado
- **Fecha:** 2026-11-16

## Contexto

- El backend sigue la arquitectura hexagonal del [ADR 0004](0004-arquitectura-hexagonal-y-base-de-datos-intercambiable.md). Hasta ahora la verificaba `tests/test_architecture.py`, que recorría los imports con `ast` y tenía su propia lista de frameworks prohibidos.
- Esa prueba no veía todo: no comprobaba que `ingest` y `planning` fueran independientes, ni que `shared` no dependiera de ellos, ni quién podía usar la raíz de composición. Tampoco veía imports indirectos.
- La [tarea 0005](../tareas/pendientes/0005-auditar-arquitectura-hexagonal-del-backend.md) pidió auditar las capas y buscar valores repetidos que pudieran divergir.
- La auditoría no encontró violaciones de capas. Sí encontró duplicados: estados de la ingesta escritos a mano en 6 archivos, mensajes de permiso copiados en 11 llamadas, la misma regla de fechas en stock y producción, límites de la API copiados del dominio, prefijos de rutas en 7 lugares, la calidad «A» en 7, y `planning_seed.yaml` leído dos veces. `.env.example` decía `PLANNING_CUTOFF_TIME=19:00` cuando el valor vigente es 14:00.

## Decisión

### Las reglas de capas son contratos de import-linter

Viven en `backend/pyproject.toml` (`[tool.importlinter]`). CI corre `uv run lint-imports` en el job del backend, y `tests/test_architecture.py` corre los mismos contratos dentro de `pytest`.

| Contrato | Regla |
|---|---|
| `capas-de-cada-modulo` | En `ingest` y `planning`: `bootstrap` e `infrastructure` → `application` → `domain`. Nunca al revés. |
| `bootstrap-solo-desde-entradas` | La raíz de composición (`bootstrap.py`) solo la importan `app.main` y los adaptadores de entrada (HTTP, consola, tareas periódicas). Un adaptador de salida nunca la usa. |
| `modulos-independientes` | `ingest` y `planning` no se importan entre sí. Lo que compartan va a `shared/`. |
| `plataforma-por-capas` | `app.main` → módulos → `shared` → `core`. `shared` no conoce los módulos; `core` no conoce a nadie. |
| `shared-por-capas` | En `shared`: `infrastructure` → `domain`. |
| `dominio-puro` | `domain` y `application` (de los módulos y de `shared`) no importan `core`, `db`, `shared.infrastructure` ni frameworks: FastAPI, Starlette, uvicorn, httpx, SQLAlchemy, pydantic, pandas, numpy, pyarrow, deltalake, DuckDB, openpyxl, YAML, JWT, Alembic, holidays, Redis, fpdf, scikit-learn, psycopg, pymssql, entre otros. Tampoco la E/S de la biblioteca estándar (`sqlite3`, `socket`, `subprocess`, `http`, `urllib`). También por vías indirectas. |
| `adaptadores-de-salida` | Persistencia, archivos y lakehouse no importan los adaptadores de entrada (HTTP, consola, tareas periódicas). |

- **Actualización (2026-11-16, [ADR 0017](0017-agente-de-ia-con-mcp-y-n8n.md)):** los adaptadores MCP (`ingest/infrastructure/mcp`, `planning/infrastructure/mcp`) son adaptadores de entrada: pueden usar `bootstrap` y ningún adaptador de salida los importa. `mcp` se suma a los frameworks prohibidos en el dominio y la aplicación.
- `bootstrap` e `infrastructure` están al mismo nivel (`"bootstrap : infrastructure"`): el router HTTP pide a `bootstrap` los casos de uso ya cableados. El contrato `bootstrap-solo-desde-entradas` impide que un adaptador de salida haga lo mismo.
- No hay `ignore_imports`: no hizo falta ninguna excepción.
- `app.db` (ORM de las tablas de la ingesta y migraciones de Alembic) no entra en las capas de la plataforma: `migrations/env.py` importa las tablas de `planning` para registrarlas. Sí está prohibido en `domain` y `application`.

### `shared/` se queda con ese nombre

- `shared/` ya cumple el papel de «commons» y lo usan los dos módulos, los tests, los scripts y la documentación. Renombrarlo a `commons/` no aporta nada y movería decenas de imports.
- Va a `shared/` lo que usan dos o más módulos y no es de ninguno: errores de dominio, calendario, base de datos, HTTP (errores, seguridad, rutas), logs, caché y lakehouse.
- Lo que es de un módulo se queda en el `domain/` de ese módulo, aunque lo lean adaptadores de otras capas.

### Dónde vive cada fuente de la verdad

| Qué | Dónde |
|---|---|
| Roles, permisos y mensajes de permiso denegado | `planning/domain/permissions.py` (`ROLE_PERMISSIONS`, `MANAGEABLE_ROLES`, `DENIED`, `FORBIDDEN`). `require(rol, permiso)` ya no recibe el mensaje. |
| Estados de una carga, de un mapeo y quién lo propuso | `ingest/domain/models.py` (`IngestStatus`, `MappingStatus`, `ProposedBy`, `StrEnum`). La regla ok/partial/failed es `IngestStatus.of_rows`. |
| Tabla silver que alimenta gold y nombre de la tabla gold | `ingest/domain/models.py` (`ORDERS_TABLE`, `DAILY_DEMAND_TABLE`). Los esquemas siguen en `config/schemas.yaml`. |
| Calidad de producto y categoría brasa | `planning/domain/models.py` (`QUALITY_A`, `QUALITY_B`, `BRASA_CATEGORY`, `Product.is_projectable`, `projectable()`). |
| Rango de consulta y registro de días pasados | `planning/domain/dates.py` (`check_range`, `check_order`, `check_recent_day`). Stock y producción la usan con sus días y su texto. |
| Hora de corte, decisiones sobre habilitaciones y largo del motivo | `planning/domain/editing.py` (`CUTOFF_PATTERN`, `Decision`, `DECISIONS`, `MAX_REASON`, `MAX_DAYS_BEFORE`). La API valida con las mismas constantes. |
| Límites de cantidades | `planning/domain/stock.py` (`MAX_UNITS`, `DEFAULT_LOCATION`), `production.py` (`MAX_BIRDS`), `saca.py` (`MAX_PLUS`). |
| Pantallas a las que llevan los avisos | `planning/domain/notifications.py` (`REGISTER_LINK`, `register_day_link`, etc.). |
| Prefijos de las rutas (`/api`, `/ingest`) | `shared/infrastructure/http/paths.py`. Los usan los routers, la seguridad y el log de peticiones. |
| Configuración del entorno | `core/config.py` (`Settings`). Nadie lee `os.environ` por su cuenta; `PLANNING_DEMO_PASSWORD` pasó a `Settings`. `REPO_ROOT`, `BACKEND_DIR`, `DEFAULT_YIELD_FACTOR` y `DEFAULT_AVG_LIVE_WEIGHT_KG` también viven ahí. |
| Archivos de `config/` | Un lector por archivo: `ingest/infrastructure/config.py` (`schemas.yaml`, `catalog.yaml`), `shared/infrastructure/database/tables.py` (`tables.yaml`) y `cli.load_seed` (`planning_seed.yaml`). |
| Nombres de tablas | `config/tables.yaml` (sin cambios, ADR 0004). |

## Alternativas consideradas

- **Mantener `tests/test_architecture.py` con `ast`:** no ve imports indirectos ni independencia entre módulos, y duplicaba la lista de frameworks. Ahora corre los contratos de import-linter.
- **Renombrar `shared/` a `commons/`:** mismo contenido, muchos cambios y ningún beneficio.
- **Mover los routers HTTP fuera de `infrastructure/` (carpeta `entrypoints/`):** dejaría `bootstrap` encima de toda la infraestructura sin capas no independientes. Es una reestructuración grande; el contrato `protected` logra lo mismo.
- **Enums para roles y decisiones en la API:** cambiaría el OpenAPI (aparecerían esquemas `$ref` nuevos). Se dejaron como constantes y `Literal`, y una prueba verifica que `Decision` coincide con `DECISIONS`.

## Consecuencias

- Una violación de capas rompe CI con el camino exacto del import. Un contexto nuevo tiene que sumarse a los contratos (lo comprueba `tests/test_architecture.py`).
- El comportamiento de la API no cambió: el OpenAPI generado es idéntico byte a byte antes y después, y pasan todas las pruebas.
- `tests/test_single_source_rules.py` prueba con Hypothesis las reglas movidas, contra oráculos escritos desde la especificación (no desde el código).
- `.env.example` vuelve a decir `PLANNING_CUTOFF_TIME=14:00`, como `Settings` y `docs/assumptions.md`.
- `app/db/session.py` (un reexport sin uso) se borró.
- **Quedan duplicados conocidos, a propósito:**
  - Los límites de `Settings` que repiten reglas del dominio (`planning_cutoff_days_before` hasta 7) siguen en `core/config.py`: `core` no puede importar el dominio. El dominio vuelve a validar al usarlos.
  - Las migraciones de Alembic conservan sus valores literales: son historia y no deben cambiar.
  - `deploy/compose.prod.yml` repite los valores por defecto de `YIELD_FACTOR` y `AVG_LIVE_WEIGHT_KG`.
