# ADR 0002 — Supabase Cloud como base de datos (app y n8n)

- **Estado:** aceptado
- **Fecha:** 2026-10-15
- **Reemplaza en parte a:** [ADR 0001](0001-almacenamiento-gcs-y-despliegue-en-vm.md), en el punto "PostgreSQL en contenedor en la VM".

## Contexto

El diseño original usaba un contenedor de PostgreSQL con dos bases (`app` y `n8n`). El equipo prefiere **Supabase**. Supabase es PostgreSQL gestionado, así que SQLAlchemy y Alembic funcionan sin cambios.

## Decisión

1. **Supabase Cloud** (plan gratuito) reemplaza al contenedor de PostgreSQL, tanto en local como en GCP.
2. **De Supabase se usa solo la base de datos.** El login sigue siendo JWT propio del backend. No se usan Supabase Auth, Storage ni la Data API.
3. **Un solo proyecto de Supabase, dos esquemas:**
   - `app`: tablas de la app, gestionadas con Alembic (la tabla `alembic_version` también vive ahí);
   - `n8n`: tablas internas de n8n (`DB_POSTGRESDB_SCHEMA=n8n`).
   - **Nada en `public`:** Supabase expone `public` por su Data API (PostgREST). Al usar `app`, las tablas no quedan accesibles con la `anon key`.
4. **La conexión es por el pooler (Supavisor) en modo sesión** (`aws-0-<region>.pooler.supabase.com:5432`, usuario `postgres.<project-ref>`, `sslmode=require`):
   - la conexión directa (`db.<ref>.supabase.co`) es solo IPv6, y la VM de GCP y muchas redes domésticas usan IPv4;
   - el modo transacción (puerto 6543) no soporta prepared statements, que usan psycopg y n8n.
5. **Perfil `localdb` opcional** en Docker Compose: un Postgres local que imita a Supabase (base `postgres`, usuario `postgres`) para trabajar sin internet y para pruebas.

## Alternativas consideradas

- **Supabase self-hosted:** se descarta. Son unos 10 contenedores (Kong, GoTrue, PostgREST, Realtime, Storage, Studio…) y rompe la meta de menos de 2.5 GB del perfil `lite`.
- **Supabase Auth:** se descarta por ahora. Obligaría a validar sus JWT y a guardar los roles en los metadatos del usuario. Puede revisarse en un ADR futuro.
- **Base de n8n en SQLite** o en un Postgres local aparte: se descarta. Con todo en Supabase, los workflows y credenciales de n8n sobreviven si se recrea la VM.

## Consecuencias

**Positivas**
- Un contenedor menos: el perfil `lite` queda en n8n + backend.
- Respaldos, panel web (Studio) y SQL editor incluidos. Ya no hace falta un `pg_dump` propio.
- La misma base sirve para el desarrollo local y para GCP.

**Negativas / a tener en cuenta**
- **Hace falta internet** para desarrollar (o usar el perfil `localdb`).
- **El plan gratuito pausa el proyecto tras ~1 semana sin actividad.** Se reactiva desde el dashboard, y hay que hacerlo antes de una demo.
- **Límites del plan gratuito:** unos 500 MB de base y un número limitado de conexiones en el pooler. Los pools son chicos y configurables (`DB_POOL_SIZE=5`, `N8N_DB_POOL_SIZE=2`).
- **SSL de n8n:** el certificado del pooler lo firma la CA de Supabase. Por defecto `N8N_DB_SSL_REJECT_UNAUTHORIZED=false` (cifrado, sin verificar la CA). Para verificarlo, montar la CA del dashboard y usar `DB_POSTGRESDB_SSL_CA`.
- **Latencia:** la región del proyecto de Supabase debe estar cerca de la VM de GCP (por ejemplo, ambas en `us-east`, o São Paulo para Perú).
- **El histórico analítico sigue en el lakehouse Delta** (ADR 0001), no en Supabase. Supabase solo guarda el estado transaccional.
