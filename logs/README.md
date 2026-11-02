# logs/

Archivos de log de la plataforma. La carpeta se versiona; los archivos `.log`, no (`.gitignore`).

| Archivo | Contenido |
|---|---|
| `app.log` | Todo desde `LOG_LEVEL`: cada petición a `/api` y `/ingest` (método, ruta, código, `duration_ms`), logins, proyecciones guardadas, cargas de Excel y avisos. |
| `errors.log` | Solo `ERROR` y `CRITICAL` del backend, con la traza completa. Es lo primero que hay que revisar ante una falla. |
| `frontend.log` | Errores de la PWA en el navegador del vendedor: pantallas que se rompen, errores de JavaScript y promesas rechazadas. Cada línea trae pantalla, vendedor (si había sesión), versión del build, navegador y la traza. |

`app.log` y `errors.log` son solo del backend; lo del navegador va aparte en `frontend.log`.

- Rotan al llegar a `LOG_MAX_MB` y se guardan `LOG_BACKUPS` copias (`app.log.1`, `app.log.2`, …).
- Cada línea lleva el **id de la petición** entre corchetes. La API lo devuelve en la cabecera `X-Request-ID` (y en el cuerpo de un error 500): búscalo aquí para ver todo lo que pasó en esa petición.
- Nunca se registran contraseñas, tokens ni los valores de un formulario inválido; solo el campo y el motivo.
- En Docker, la carpeta está montada en `/data/logs`; la consola sigue disponible con `docker compose logs backend`.
- En GCP conviene `LOG_FORMAT=json` (una línea JSON por evento, la entiende Cloud Logging).
- Con `UVICORN_WORKERS` > 1 cada proceso rota los archivos por su cuenta y puede perder líneas al rotar; en ese caso usar `LOG_TO_FILES=false` y leer la consola.

## Errores del frontend

- La PWA los envía a `POST /api/client-logs` en lotes (a los 2 s, o al cerrar la página). Sin conexión los guarda en memoria y los manda al volver la red.
- El mismo error en la misma pantalla se envía una sola vez por minuto, y el backend acepta como máximo 30 reportes por minuto por IP.
- Si una pantalla se rompe, el vendedor ve "Algo salió mal" con botones para recargar o volver al inicio, en vez de una página en blanco.
- El endpoint es público (un error puede pasar antes del login): el usuario que aparece es el que informa el navegador, no una identidad verificada.

## Código

- Backend: `backend/app/shared/infrastructure/logging/` (configuración, formato, middleware y `client.py` para los reportes del navegador).
- Frontend: `frontend/src/core/application/error-reporter.ts`, `core/infrastructure/` (envío y captura global) y `ui/components/error-boundary.tsx`.
