# logs/

Archivos de log del backend. La carpeta se versiona; los archivos `.log`, no (`.gitignore`).

| Archivo | Contenido |
|---|---|
| `app.log` | Todo desde `LOG_LEVEL`: cada petición a `/api` y `/ingest` (método, ruta, código, `duration_ms`), logins, proyecciones guardadas, cargas de Excel y avisos. |
| `errors.log` | Solo `ERROR` y `CRITICAL`, con la traza completa. Es lo primero que hay que revisar ante una falla. |

- Rotan al llegar a `LOG_MAX_MB` y se guardan `LOG_BACKUPS` copias (`app.log.1`, `app.log.2`, …).
- Cada línea lleva el **id de la petición** entre corchetes. La API lo devuelve en la cabecera `X-Request-ID` (y en el cuerpo de un error 500): búscalo aquí para ver todo lo que pasó en esa petición.
- Nunca se registran contraseñas, tokens ni los valores de un formulario inválido; solo el campo y el motivo.
- En Docker, la carpeta está montada en `/data/logs`; la consola sigue disponible con `docker compose logs backend`.
- En GCP conviene `LOG_FORMAT=json` (una línea JSON por evento, la entiende Cloud Logging).
- Con `UVICORN_WORKERS` > 1 cada proceso rota los archivos por su cuenta y puede perder líneas al rotar; en ese caso usar `LOG_TO_FILES=false` y leer la consola.

El código está en `backend/app/shared/infrastructure/logging/`.
