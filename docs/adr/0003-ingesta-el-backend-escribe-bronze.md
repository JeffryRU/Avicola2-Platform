# ADR 0003 — La ingesta pasa por el backend: n8n envía el archivo y el backend escribe bronze

- **Estado:** aceptado
- **Fecha:** 2026-10-15

## Contexto

El diseño inicial decía que n8n copiaba el archivo crudo a bronze y luego llamaba a `/ingest/transform`. Al implementarlo:

- El lakehouse vive en un volumen del backend (`./data/lakehouse`) o en GCS. Si n8n escribiera ahí, también necesitaría ese volumen o las credenciales de GCS, y habría dos escritores del lakehouse.
- La lógica de rutas de bronze (`bronze/{fuente}/{AAAA}/{MM}/{DD}/...`) quedaría duplicada en n8n y en el backend.

## Decisión

1. **n8n lee el archivo de `/data/inbox` y lo envía por `POST /ingest/upload`** (multipart). **El backend guarda el crudo en bronze**, valida, escribe silver y gold, y registra en `ingestion_log`. El backend es el único escritor del lakehouse.
2. **`POST /ingest/transform`** reprocesa un archivo que ya está en bronze, por su `bronze_path`. Sirve tras corregir un mapeo o el esquema.
3. **Mapeo de columnas** (orden): alias de `schemas.yaml` → mapeo confirmado en `column_mappings` (por firma de columnas) → pendiente.
   - Un archivo con columnas obligatorias sin reconocer queda como `needs_mapping`, y se crea o actualiza un mapeo pendiente con la propuesta automática.
   - `PUT /ingest/mappings/{id}/proposal` guarda una propuesta (la usará el flujo de IA del paso 6).
   - `POST /ingest/mappings/{id}/confirm` la confirma y **reprocesa automáticamente** los archivos pendientes con la misma firma.
   - Un mapeo puede fijar **constantes** con claves `"=campo"`, por ejemplo `{"=type": "proyeccion", "=source": "message"}`, para archivos sin columna `tipo`.
4. **Autenticación provisional** de `/ingest/*` con el header `X-Api-Token` (`INGEST_API_TOKEN`) hasta el login con JWT (paso 5). n8n lo lee con `$env`, por eso se configura `N8N_BLOCK_ENV_ACCESS_IN_NODE=false`.
5. **Un solo escritor de Delta:** lock de proceso y `UVICORN_WORKERS=1`. `scripts/load_synthetic.py` también escribe, así que no hay que correrlo mientras el backend procesa cargas.

## Consecuencias

- n8n no necesita credenciales del lakehouse. El mismo flujo sirve en local y en GCP.
- **Archivos de hasta 20 MB** por carga.
- **El upsert actualiza e inserta, pero no borra:** si un Excel corregido quita filas, esas filas siguen en silver. Si hace falta, se agregará un modo "reemplazar por fecha y canal".
- **Granularidad semanal:** los archivos semanales (como el resumen de Tiendas) quedan `needs_mapping`. Cargarlos como si fueran diarios mezclaría granularidades, así que se resolverá cuando se confirme cómo llegan los datos reales (docs/assumptions.md).
- **Sin columna `tipo`, las filas se tratan como pedidos** (`routing.default` en `schemas.yaml`), salvo que el mapeo fije `=type`.
