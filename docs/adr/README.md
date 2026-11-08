# Architecture Decision Records

Cada decisión de arquitectura relevante o supuesto de proceso se registra aquí como `NNNN-titulo-corto.md`, con las secciones: **Contexto, Decisión, Alternativas consideradas, Consecuencias**, y un estado (`propuesto | aceptado | reemplazado por NNNN`).

| ADR | Título | Estado |
|---|---|---|
| [0001](0001-almacenamiento-gcs-y-despliegue-en-vm.md) | Lakehouse en Delta sin MinIO y despliegue en GCP con una VM | aceptado (la parte de Postgres, reemplazada por 0002) |
| [0002](0002-supabase-como-base-de-datos.md) | Supabase Cloud como base de datos (app y n8n) | aceptado |
| [0003](0003-ingesta-el-backend-escribe-bronze.md) | La ingesta pasa por el backend: n8n envía el archivo y el backend escribe bronze | aceptado |
| [0004](0004-arquitectura-hexagonal-y-base-de-datos-intercambiable.md) | Arquitectura hexagonal, base de datos intercambiable y app de vendedores como PWA | aceptado |
| [0005](0005-seguridad-de-sesion-y-cuentas.md) | Seguridad de sesión y cuentas: cookie HttpOnly, supervisor y recuperación asistida | aceptado |
| [0006](0006-notificaciones-y-tiempo-real.md) | Notificaciones reales y tiempo real con SSE | aceptado |
| [0007](0007-frontend-en-vercel-con-proxy-api.md) | Frontend en Vercel con proxy de /api al backend | aceptado |
| [0008](0008-frontend-por-features.md) | Frontend por features (screaming) y vocabulario en una sola fuente | aceptado |
| [0009](0009-app-movil-kotlin-multiplatform.md) | App móvil con Kotlin Multiplatform, distribuida por GitHub Releases | aceptado |
| [0010](0010-roles-y-permisos.md) | Roles y permisos en una sola fuente, con supervisor general | aceptado |
