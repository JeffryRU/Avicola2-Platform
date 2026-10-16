# Architecture Decision Records

Cada decisión de arquitectura relevante o supuesto de proceso se registra aquí como `NNNN-titulo-corto.md`, con las secciones: **Contexto, Decisión, Alternativas consideradas, Consecuencias**, y un estado (`propuesto | aceptado | reemplazado por NNNN`).

| ADR | Título | Estado |
|---|---|---|
| [0001](0001-almacenamiento-gcs-y-despliegue-en-vm.md) | Lakehouse en Delta sin MinIO y despliegue en GCP con una VM | aceptado (la parte de Postgres, reemplazada por 0002) |
| [0002](0002-supabase-como-base-de-datos.md) | Supabase Cloud como base de datos (app y n8n) | aceptado |
| [0003](0003-ingesta-el-backend-escribe-bronze.md) | La ingesta pasa por el backend: n8n envía el archivo y el backend escribe bronze | aceptado |
