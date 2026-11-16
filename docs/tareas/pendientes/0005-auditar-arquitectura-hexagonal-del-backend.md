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

- [ ] `domain/` no importa nada de `application/`, `infrastructure/`, FastAPI, SQLAlchemy, pandas ni otras librerías externas.
- [ ] `application/` depende solo de `domain/` y de **puertos** (interfaces), nunca de adaptadores concretos.
- [ ] Los adaptadores (`infrastructure/`) implementan los puertos. El cableado se hace en un único punto de composición.
- [ ] Un módulo (`ingest`, `planning`) no importa internos de otro. Si lo necesita, se usa un puerto o el código pasa a `shared/`.
- [ ] Hacer cumplir estas reglas automáticamente con `import-linter` (contratos de capas e independencia) en CI.

### Única fuente de la verdad

- [ ] Buscar duplicados: constantes, nombres de tablas y columnas, estados (`ok`, `partial`, `failed`, `needs_mapping`…), roles, rutas de la API, mensajes de error, valores por defecto (`YIELD_FACTOR`, `PLANNING_*`) y validaciones repetidas.
- [ ] Centralizar cada uno en `shared/` (o en el `domain/` del módulo dueño), usando enums o constantes tipadas.
- [ ] Revisar `backend/config/` (`catalog.yaml`, `planning_seed.yaml`) y `core/config.py`: cada valor de configuración se lee en un solo lugar.
- [ ] Decidir si `shared/` se renombra a `commons/` o se queda como está, y dejarlo documentado. Lo importante es que haya un solo lugar.

### Clean code

- [ ] Funciones o clases largas, nombres poco claros, código muerto, `# type: ignore` y `noqa` sin justificar.

### Resultado

- [ ] Escribir el informe de la auditoría (archivo, regla incumplida y propuesta) y corregir en commits pequeños.
- [ ] Actualizar el ADR 0004 si cambian las reglas.

## Criterios de aceptación

- `import-linter` corre en CI y pasa.
- No quedan constantes ni reglas duplicadas relevantes.
- Pasan los tests (incluidos los de `tests/adversarial`) y ruff.

## Notas

- Seguir las pruebas adversariales: una revisión independiente, Hypothesis para las reglas de dominio que se muevan y fuzzing en las entradas.
