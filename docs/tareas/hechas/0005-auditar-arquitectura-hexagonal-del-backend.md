# 0005 · Auditar a fondo la arquitectura hexagonal del backend y la única fuente de la verdad

- **Área:** backend
- **Prioridad:** alta
- **Creada:** 2026-11-16
- **Relacionada:** [ADR 0004 — Arquitectura hexagonal](../../adr/0004-arquitectura-hexagonal-y-base-de-datos-intercambiable.md)

## Contexto

El backend **debe** respetar la arquitectura hexagonal ([ADR 0004](../../adr/0004-arquitectura-hexagonal-y-base-de-datos-intercambiable.md)). Lo que se repite va a un módulo común, para que haya **una única fuente de la verdad**: cada nombre, constante, regla o configuración se define en un solo lugar.

Estructura actual de `backend/app/`:

- `ingest/` y `planning/`, cada uno con `domain/`, `application/` e `infrastructure/`.
- `shared/` (`domain/` con `calendar` y `errors`; `infrastructure/` con base de datos, http, logging, caché y lakehouse). Hoy cumple el papel de «commons».
- `core/config.py`, `db/migrations` y `main.py`.

## Qué hay que hacer

### Dirección de dependencias

- [x] `domain/` no importa nada de `application/`, `infrastructure/`, FastAPI, SQLAlchemy, pandas ni otras librerías externas.
- [x] `application/` depende solo de `domain/` y de **puertos** (interfaces), nunca de adaptadores concretos.
- [x] Los adaptadores (`infrastructure/`) implementan los puertos. El cableado se hace en un único punto de composición.
- [x] Un módulo (`ingest`, `planning`) no importa internos de otro. Si lo necesita, se usa un puerto o el código pasa a `shared/`.
- [x] Hacer cumplir estas reglas automáticamente con `import-linter` (contratos de capas e independencia) en CI.

### Única fuente de la verdad

- [x] Buscar duplicados: constantes, nombres de tablas y columnas, estados (`ok`, `partial`, `failed`, `needs_mapping`…), roles, rutas de la API, mensajes de error, valores por defecto (`YIELD_FACTOR`, `PLANNING_*`) y validaciones repetidas.
- [x] Centralizar cada uno en `shared/` (o en el `domain/` del módulo dueño), usando enums o constantes tipadas.
- [x] Revisar `backend/config/` (`catalog.yaml`, `planning_seed.yaml`) y `core/config.py`: cada valor de configuración se lee en un solo lugar.
- [x] Decidir si `shared/` se renombra a `commons/` o se queda como está, y dejarlo documentado. Lo importante es que haya un solo lugar.

### Clean code

- [x] Funciones o clases largas, nombres poco claros, código muerto, `# type: ignore` y `noqa` sin justificar.

### Resultado

- [x] Escribir el informe de la auditoría (archivo, regla incumplida y propuesta) y corregir en commits pequeños.
- [x] Actualizar el ADR 0004 si cambian las reglas.

## Criterios de aceptación

- `import-linter` corre en CI y pasa.
- No quedan constantes ni reglas duplicadas relevantes.
- Pasan los tests (incluidos los de `tests/adversarial`) y ruff.

## Notas

- Seguir las pruebas adversariales: una revisión independiente, Hypothesis para las reglas de dominio que se muevan y fuzzing en las entradas.

## Resultado (2026-11-16)

Decisiones y fuentes únicas en el [ADR 0016](../../adr/0016-capas-con-import-linter-y-fuentes-unicas.md). Falta solo el último punto de «Resultado»: el informe está aquí, pero los commits los hace quien revisa.

**Capas.** Siete contratos de import-linter en `backend/pyproject.toml`: capas de cada módulo, raíz de composición solo desde los adaptadores de entrada, `ingest` y `planning` independientes, plataforma y `shared` por capas, dominio puro (sin frameworks ni E/S, también por vías indirectas) y adaptadores de salida sin depender de los de entrada. CI corre `uv run lint-imports`; `tests/test_architecture.py` corre los mismos contratos y comprueba que cubran todos los contextos.

- **Violaciones encontradas:** ninguna. No hizo falta ningún `ignore_imports`. Se comprobó que los contratos detectan violaciones inyectándolas a propósito.
- **`shared/`:** se queda con ese nombre (no pasa a `commons/`).

**Duplicados centralizados** (archivo → regla → solución):

| Dónde estaba | Qué se repetía | Dónde quedó |
|---|---|---|
| `pipeline.py`, `service.py`, `use_cases.py`, `repository.py`, `router.py` y `db/models.py` de la ingesta | `ok`/`partial`/`failed`/`needs_mapping`, `pending`/`confirmed`, `alias`/`llm`/`user` y la tabla `orders` | `IngestStatus`, `MappingStatus`, `ProposedBy`, `ORDERS_TABLE` y `DAILY_DEMAND_TABLE` en `ingest/domain/models.py` |
| 11 llamadas a `require(...)` | Mensajes de permiso denegado | Tabla `DENIED` en `permissions.py` |
| `stock.py` y `production.py` | Misma regla «hasta 7 días atrás, nunca a futuro» | `check_recent_day`, en `planning/domain/dates.py` |
| `use_cases.py` (privado, importado por stock y producción), `export.py` | `_check_range` | `check_range`, también en `planning/domain/dates.py` |
| Repositorios SQL y con caché, saca, CLI, tablas, schemas | Calidad `"A"`, `"BRASA"`, `"General"`, rol por defecto `"seller"` | `QUALITY_A`, `Product.is_projectable` y `projectable()`; `BRASA_CATEGORY`, `DEFAULT_LOCATION` y `SELLER` |
| `schemas.py` | Patrón de la hora de corte; límites 7, 300, 100, 100 000 y 1 000 000; decisiones | Constantes del dominio (`CUTOFF_PATTERN`, `MAX_*`, `Decision`) |
| Routers, seguridad, log de peticiones | `"/api"` e `"/ingest"` | `shared/infrastructure/http/paths.py` |
| `editing.py` y `notifications.py` de application | Enlaces a pantallas | Constantes y funciones en `planning/domain/notifications.py` |
| `cli.py` | `planning_seed.yaml` leído dos veces; `PLANNING_DEMO_PASSWORD` desde `os.environ` (ignoraba el `.env`) | `load_seed()`; `Settings.planning_demo_password` |
| `config.py`, `lakehouse.py`, `cli.py`, generador sintético | Raíz del repo y valores por defecto de `YIELD_FACTOR` y `AVG_LIVE_WEIGHT_KG` | `REPO_ROOT`, `BACKEND_DIR` y `DEFAULT_*` en `core/config.py` |
| `.env.example` | `PLANNING_CUTOFF_TIME=19:00`, distinto del valor vigente (14:00) | Corregido |

**Clean code.**

- `parse()` (ingesta) y `IngestService._process` se dividieron en partes. Ya no hace falta el `noqa` de complejidad.
- Se borró `app/db/session.py`, que no se usaba.
- Se quitó un import bajo `TYPE_CHECKING` que no era necesario.
- Se justificaron los `noqa` que no tenían justificación (`normalize.py`, `cache.py`).

**Verificación.**

- El OpenAPI generado es idéntico byte a byte antes y después.
- Una revisión independiente comparó con Hypothesis el `parse()` viejo y el nuevo en 7000 casos, sin diferencias. También encontró que import-linter, corrido dentro de pytest, desactivaba los loggers. Se corrigió: ahora corre en otro proceso.
- `tests/test_single_source_rules.py` prueba las reglas movidas con Hypothesis y oráculos escritos desde la especificación.

**Quedó fuera (y por qué).**

- **Límites de `Settings` que repiten reglas del dominio** (`planning_cutoff_days_before ≤ 7`): `core` no puede importar el dominio, y el dominio vuelve a validar.
- **Valores por defecto en `deploy/compose.prod.yml`:** es despliegue y queda fuera de este cambio.
- **Migraciones:** son historia.
- **Duplicados menores que cambiarían el OpenAPI si se tocaran:** largos de usuario y contraseña repetidos en varios schemas, `MAX_UNITS_PER_LINE` sin reflejo en `DayIn`, audiencia `"all"`.
- **Tablas heredadas sin uso:** `saca_plan_statuses` y los modelos `users`, `saca_plans` y `alerts` de `db/models.py`. Van con la unificación de usuarios pendiente (ADR 0010).
