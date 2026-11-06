# ADR 0006 — Notificaciones reales y tiempo real con SSE

- **Estado:** aceptado
- **Fecha:** 2026-11-03

## Contexto

- Las notificaciones de la app venían del mockup:
  - Una ("Proyección pendiente") se calculaba en el navegador al abrir la app.
  - Las otras tres eran textos fijos.
  - "Leído" se guardaba solo en el dispositivo.
- No había ningún canal desde el servidor. Si un vendedor enviaba su proyección, el supervisor no lo veía hasta recargar.
- Se pidió que las notificaciones sean reales y lleguen en el momento.
- Se evaluó agregar Redis o RabbitMQ y llevar los datos por WebSocket. Kafka ya estaba descartado por las reglas del proyecto.

## Decisión

### Notificaciones guardadas

- **Tabla `np_notifications`** (nombre en `tables.yaml`), una fila por destinatario, con `read_at`. Así, "leído" se sincroniza entre dispositivos.
- **Tipos reales:**

  | Tipo | Cuándo | Para quién |
  |---|---|---|
  | `projection_submitted` | Un vendedor envía su proyección | Supervisores |
  | `projection_reminder` | El cron de n8n (lun–sáb 9:00) encuentra que falta la proyección de hoy | Cada vendedor que no la registró (una vez por día, por `dedupe_key`) |
  | `announcement` | n8n envía un aviso, p. ej., carga de Excel con problemas o ventas actualizadas | Todos, un rol o un usuario |

- **API:**
  - `GET /api/notifications` y `POST /api/notifications/read` para el usuario.
  - `POST /api/internal/notifications` y `POST /api/internal/notifications/projection-reminders` para n8n, con el token de servicio `X-Api-Token`.
  - Avisos de quién no registró al pasar la hora de corte: una tarea periódica dentro de la API (cada `PLANNING_SCHEDULER_SECONDS`), porque la hora la cambia el supervisor y un cron fijo de n8n no la seguiría. Es idempotente (clave por día), así que varios workers o n8n (`POST /api/internal/notifications/missed-projections`) no duplican avisos.

### Tiempo real

- **Server-Sent Events en `GET /api/events`,** no WebSocket:
  - El flujo va en un solo sentido (servidor → navegador).
  - `EventSource` reconecta solo.
  - Usa la misma cookie HttpOnly de la sesión.
  - Pasa sin configuración por Caddy y Traefik.
- **El canal solo avisa que algo cambió;** los datos se vuelven a pedir por la API normal. Así se conservan la validación con zod, la caché de TanStack Query, la cola offline y el control de permisos, que ya existen. Los eventos son:
  - `notification`: la lista se actualiza y aparece un aviso en pantalla.
  - `projections.changed`: los dashboards abiertos se refrescan.
  - `session.revoked`: el navegador cierra la sesión al instante si el supervisor restableció la contraseña o desactivó la cuenta.
- **Puerto `EventPublisher` y bus en memoria** (`InMemoryEventBus`): los casos de uso publican; el bus reparte a las conexiones SSE de su proceso, filtrando por usuario o rol.
- **La conexión SSE no ocupa una conexión de la base:** autentica con su propia sesión breve y la cierra antes de empezar a transmitir.
- **Cada 20 s envía un comentario `: ping`** para que los proxies no corten la conexión por inactividad.

### Confirmaciones dentro de la app

- Las acciones con confirmación (restablecer contraseña, desactivar cuenta) usan un diálogo de la app (`ConfirmDialog`), no `window.confirm()`.
- Algunos navegadores embebidos y PWA instaladas bloquean los diálogos nativos y devuelven "Cancelar" sin mostrarlos. Por eso el botón Restablecer no hacía nada.

## Alternativas consideradas

- **WebSocket para todo, incluidos los datos:** duplicaría la API (validación, permisos, caché) y rompería la cola offline, que depende de REST. WebSocket conviene cuando el navegador también debe enviar en vivo, como en un chat.
- **Redis pub/sub:** solo hace falta con varios procesos o servidores del backend. Con `UVICORN_WORKERS=1` el bus en memoria alcanza. Cuando se escale, es otro adaptador del mismo puerto. Postgres `LISTEN/NOTIFY` también sirve, sin infraestructura extra, porque Supabase ya está y el pooler está en modo sesión.
- **RabbitMQ:** aporta colas persistentes, confirmaciones y reintentos. Aquí no se necesitan:
  - Las notificaciones ya quedan guardadas en la base, y el canal en vivo solo dice "hay algo nuevo"; si un aviso se pierde, el navegador lo recupera al reconectarse.
  - El trabajo asíncrono (cron, reintentos) ya lo orquesta n8n.
  - Usa unos 100–200 MB en reposo, frente al límite del perfil `lite`.

  Conviene si aparecen trabajos pesados en segundo plano que n8n no cubra bien.
- **Seguir calculando los avisos en el navegador:** no permite avisar de lo que hacen otros, como el envío de un vendedor al supervisor, ni sincronizar "leído".

## Consecuencias

- **Con más de un proceso de uvicorn,** un evento solo llega a las conexiones del proceso que lo publicó. Antes de subir `UVICORN_WORKERS`, hay que cambiar el adaptador del bus (Redis o Postgres `LISTEN/NOTIFY`).
- **El recordatorio depende de que el workflow `02_recordatorio_proyeccion` esté activo en n8n.** Su hora (9:00) se cambia ahí.
- **Una notificación con `link` solo navega a rutas internas de la app** (empiezan con `/`); el backend y el frontend lo validan.
