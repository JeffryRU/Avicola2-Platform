# ADR 0023: base de datos local en el VPS como principal y copia en Supabase

- **Estado:** propuesto (aplicado en el repo; se activa cambiando el `.env` del servidor)
- **Fecha:** 2026-11-23
- **Reemplaza en parte:** [ADR 0002](0002-supabase-como-base-de-datos.md) (Supabase deja de ser la base principal en el VPS; sigue como copia y como plan B).

## Contexto

Medido en develop (VPS de Contabo, Supabase en `us-west-2`):

- **Latencia:** cada consulta viaja a otra región. n8n guarda cada ejecución en Supabase y tardaba **4–17 s solo en empezar** a responder una pregunta del asistente.
- **Conexiones:** el pooler de Supabase en el plan gratuito admite **15 conexiones**, y ya se usan todas: 13 del backend y 2 de n8n. Con 50 personas a la vez, las peticiones esperan turno y pueden fallar con «max clients reached».
- **Pausa del plan gratuito:** Supabase se pausa tras una semana sin uso (ver «Trampas conocidas» en CLAUDE.md).

Se pidió que la web aguante **al menos 50 personas a la vez** y tener una base de respaldo: si una se cae, que se pueda seguir con la otra, ambas con los mismos datos.

## Decisión

**Postgres en el mismo VPS (servicio `db` del compose) es la base principal de la app y de n8n. Supabase recibe una copia completa cada `COPY_EVERY_MINUTES` (15 por defecto, servicio `db-copy`).**

```
backend ─┐                     ┌─ db-copy: pg_dump (app, n8n) → pg_restore en una transacción ─→ Supabase (copia)
n8n ─────┼─→ db (Postgres 17) ─┤
         │                     └─ db-backup: volcados diarios en el volumen `backups` (14 días)
```

- **Rápida y sin límite de 15:** la base está junto a la app (sin viaje a otra región) y admite 100 conexiones.
- **Copia sin abrir puertos:** el VPS empuja la copia a Supabase por el pooler. No se publica el puerto de `db`.
- **Copia siempre entera:** cada copia entra en una sola transacción (`--single-transaction`), así Supabase nunca queda a medias.
- **Si el VPS se pierde:** se apunta `DATABASE_URL` (y n8n) a Supabase y la app sigue. Se pierden a lo sumo los minutos desde la última copia (RPO ≤ `COPY_EVERY_MINUTES`).
- **El cambio es explícito:** mientras `DATABASE_URL` apunte a Supabase, todo sigue como en el ADR 0002 y `db-copy` se apaga sola.

## Alternativas descartadas

- **Las dos bases activas, escribiendo en ambas, con cambio automático:** si se escribe en las dos durante una caída, quedan dos versiones distintas de los mismos datos y no se pueden juntar sin perder algo (*split-brain*). No compensa.
- **Supabase principal y réplica local de solo lectura:** no resuelve la latencia ni el límite de 15 conexiones, y durante una caída no se puede guardar nada.
- **Réplica lógica continua local → Supabase:** Supabase tendría que suscribirse a nuestra base, lo que obliga a abrir el puerto de Postgres del VPS a internet y a permisos que el plan administrado no garantiza.

## Consecuencias

- **Migración una vez:** `pg_dump` desde Supabase y restaurar en `db`, con la app detenida (pasos en `docs/deploy.md`, «Base local en el VPS»).
- **Respaldos:** `db-backup` sigue volcando a diario, ahora desde la base local. Supabase es la copia fuera del servidor.
- **Memoria:** `db` usa ~512 MB (`DB_MEM_LIMIT`); el VPS tiene margen. El perfil `lite` local no cambia.
- **Desarrollo local:** sigue igual (Supabase o el perfil `localdb`).
- **Pendiente:** medir con una prueba de carga de 50 personas antes y después del cambio.
