# Workflows de n8n

Se versionan como JSON exportado. Para importarlos en el n8n del compose, ejecuta desde la raíz del repo. En Git Bash, antepón `MSYS_NO_PATHCONV=1` para que no reescriba las rutas.

```bash
docker compose exec n8n n8n import:workflow --input=/data/workflows/01_ingesta_excel.json
docker compose exec n8n n8n import:workflow --input=/data/workflows/02_recordatorio_proyeccion.json
docker compose exec n8n n8n publish:workflow --id=avicola2IngestaExcel01
docker compose exec n8n n8n publish:workflow --id=avicola2Recordatorio02
docker compose restart n8n
```

Para exportar los cambios hechos en el editor y versionarlos:

```bash
docker compose exec n8n n8n export:workflow --id=avicola2IngestaExcel01 --pretty --output=/home/node/01.json
docker compose cp n8n:/home/node/01.json n8n/workflows/01_ingesta_excel.json
```

## 01_ingesta_excel

```
Local File Trigger (/data/inbox, polling) → ¿Excel o CSV? → Leer archivo → POST /ingest/upload
                                                   └→ ignorar          → ¿status ≠ ok? → Preparar aviso
                                                                                     └→ Carga correcta
```

- **Detección de archivos:** por *polling*, porque en Windows + Docker los eventos del sistema de archivos no llegan al contenedor. Ignora `.gitkeep`, `~$*` (bloqueos de Excel abiertos) y `*.tmp`.
- **Envío al backend:** manda el archivo con `source=inbox` y el header `X-Api-Token` (`INGEST_API_TOKEN` del `.env`). El backend lo guarda en bronze, valida, carga silver/gold y registra en `ingestion_log` ([ADR 0003](../../docs/adr/0003-ingesta-el-backend-escribe-bronze.md)).
- **Avisos:** si el resultado no es `ok` (`partial`, `failed` o `needs_mapping`), arma un aviso con los primeros errores y lo envía como **notificación a los supervisores** (`POST /api/internal/notifications`). Les llega en el momento, en la campana de la app. Más adelante también podrá ir por Telegram.
- **Volver a guardar un archivo** en `inbox` lo carga de nuevo. No duplica filas, porque las escrituras son por merge.
- **Requisitos en n8n 2.x:** el Local File Trigger viene desactivado por defecto; el compose lo habilita con `NODES_EXCLUDE`.

## 02_recordatorio_proyeccion

```
Schedule (lun–sáb 9:00, America/Lima) → POST /api/internal/notifications/projection-reminders
```

- **Qué hace:** a cada vendedor activo que todavía no registró su proyección de hoy, le llega la notificación "Proyección pendiente", en el momento si tiene la app abierta. Se envía como máximo una vez por vendedor y día: volver a ejecutarlo no repite el aviso.
- **Hora:** se cambia en el nodo *Schedule* (expresión cron `0 9 * * 1-6`). Es el único lugar donde está la hora límite.
- **Reintentos:** 3 intentos, separados 5 s, si el backend no responde.

## Avisos propios desde n8n

Cualquier workflow puede notificar a los usuarios de la app con un *HTTP Request*:

- `POST {{ $env.BACKEND_URL }}/api/internal/notifications`
- Cabecera `X-Api-Token: {{ $env.INGEST_API_TOKEN }}`
- Cuerpo JSON:
  ```json
  {"audience": "sellers", "title": "Ventas actualizadas", "body": "Ya puedes comparar la venta real de ayer.", "link": "/dashboards/vs-venta"}
  ```

`audience` acepta `all`, `sellers`, `supervisors` o el usuario de una persona. `link` es opcional y solo admite rutas internas de la app (empiezan con `/`).
