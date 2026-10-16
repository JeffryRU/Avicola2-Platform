# ADR 0001 — Lakehouse en Delta sin MinIO y despliegue en GCP con una VM

- **Estado:** aceptado
- **Fecha:** 2026-10-15

## Contexto

El diseño inicial guardaba el lakehouse (bronze, silver, gold) en **MinIO** con tablas **Delta Lake**. Al revisarlo:

- El volumen de datos es pequeño (con datos sintéticos, unas 10 000 filas en gold). MinIO no aporta escala.
- MinIO suma un servicio, RAM, credenciales S3 en varios lugares y obliga a usar `AWS_S3_ALLOW_UNSAFE_RENAME`, que quita la garantía ACID ante escrituras concurrentes.
- Delta sí aporta valor: upsert con `merge`, transacciones y **time travel** para reproducir el dataset con que se entrenó cada modelo.
- El despliegue se hará en **Google Cloud (GCP)**, cuyo almacenamiento de objetos nativo es **Google Cloud Storage (GCS)**.
- Debe seguir funcionando en local (Windows + Docker) y, si es necesario, en una laptop con pocos recursos.

## Decisión

1. **Se mantiene Delta Lake** (Parquet por debajo) para silver y gold. **Se elimina MinIO.**
2. **La ubicación del lakehouse es configurable** con una sola variable:
   - local: `LAKEHOUSE_URI=./data/lakehouse` (disco local, montado como volumen);
   - GCP: `LAKEHOUSE_URI=gs://<bucket>/lakehouse`.
   El código usa `deltalake` (delta-rs), que soporta ambas rutas sin cambios. Bronze sigue la misma regla (`{LAKEHOUSE_URI}/bronze/...`).
3. **Despliegue en GCP con una sola VM de Compute Engine** que corre el mismo `docker compose` (perfil `lite`) que en local:
   - VM pequeña (referencia: `e2-medium`, 2 vCPU y 4 GB). El tamaño final se valida con el consumo real.
   - **GCS** para el lakehouse (un bucket con los prefijos `bronze/`, `silver/` y `gold/`).
   - **PostgreSQL en contenedor** en la VM, sobre disco persistente, con `pg_dump` diario a GCS como respaldo.
   - **Caddy** como proxy inverso con HTTPS automático (Let's Encrypt) delante del backend y de n8n. Solo se abren los puertos 80 y 443. Postgres y los puertos internos no se exponen.
   - Autenticación a GCS con la **cuenta de servicio de la VM** (ADC), con permisos solo sobre el bucket. No se guardan claves JSON en el repositorio.
4. **Un solo escritor de Delta:** solo el backend escribe en las tablas Delta, y las escrituras se serializan. n8n solo escribe en bronze.
5. **LLM por API** (`LLM_PROVIDER=anthropic`) en la nube. Ollama queda solo para el perfil `full` en local.

## Alternativas consideradas

- **Mantener MinIO en local para "simular" GCS:** se descarta. delta-rs ya abstrae la ruta, así que el emulador no aporta nada y cuesta RAM.
- **Silver y gold en PostgreSQL:** es más simple, pero se pierde el time travel y el argumento académico del lakehouse.
- **Serverless (Cloud Run + Cloud SQL):** se descarta por ahora.
  - n8n necesita estar siempre activo para los cron y los triggers, así que en Cloud Run exige `min-instances=1`.
  - Cloud SQL tiene un costo fijo mensual.
  - Hay más piezas que configurar (VPC, conectores, secretos).
  - Puede revisarse en un ADR futuro si el proyecto crece.

## Consecuencias

**Positivas**
- Un servicio menos (MinIO y `minio-init`) y menos RAM.
- El mismo compose en local y en la nube, de modo que lo que funciona en local se despliega igual.
- ACID real: el disco local tiene rename atómico y delta-rs soporta GCS de forma nativa.
- El time travel de Delta permite guardar en `model_version` la versión del dataset de entrenamiento.
- Con HTTPS público, el webhook de Telegram funciona sin túneles.

**Negativas / a tener en cuenta**
- **DuckDB sobre GCS** necesita **claves HMAC** (no acepta la cuenta de servicio). Hay dos opciones:
  - leer con `deltalake` (`DeltaTable(...).to_pyarrow_dataset()`) y consultar ese dataset con DuckDB, sin necesidad de HMAC (opción preferida);
  - crear un `SECRET` de tipo `gcs` con HMAC guardadas en `.env` o Secret Manager.
- **No ejecutar `VACUUM`** con una retención que borre versiones referenciadas por modelos registrados.
- **Una VM es un único punto de falla.** Es aceptable para un taller. Se mitiga con respaldos de Postgres y con el lakehouse en GCS.
- **Costo:** la VM cobra mientras está encendida. Se puede detener fuera de las demos. Hay que revisar los créditos gratuitos o educativos y la calculadora de precios de GCP.
- **En la nube no existe la carpeta `data/inbox` de las laptops.** La ingesta en la nube será por subida desde la app (`/ingest/upload`) y, opcionalmente, por una carpeta compartida de Google Drive con el trigger de Google Drive de n8n. En local se mantiene `data/inbox` con un trigger por **polling**.
