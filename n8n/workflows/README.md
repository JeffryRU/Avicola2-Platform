# Workflows de n8n

Se versionan como JSON exportado. Para importarlos en el n8n del compose, ejecuta desde la raíz del repo. En Git Bash, antepón `MSYS_NO_PATHCONV=1` para que no reescriba las rutas.

```bash
docker compose exec n8n n8n import:workflow --input=/data/workflows/01_ingesta_excel.json
docker compose exec n8n n8n import:workflow --input=/data/workflows/02_recordatorio_proyeccion.json
docker compose exec n8n n8n import:workflow --input=/data/workflows/03_agente_chatbot.json
docker compose exec n8n n8n import:workflow --input=/data/workflows/04_drive_aris.json
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

- **Qué hace:** a cada vendedor activo que todavía no registró su proyección del próximo día abierto (mañana, salvo que ya haya pasado el corte), le llega la notificación "Proyección pendiente", en el momento si tiene la app abierta. Se envía como máximo una vez por vendedor y día: volver a ejecutarlo no repite el aviso.
- **Hora:** se cambia en el nodo *Schedule* (expresión cron `0 9 * * 1-6`). Es solo la hora del recordatorio: la hora límite la fija el supervisor en la app.
- **Antes del corte** tampoco hace falta n8n: la API avisa a quien aún no registró con `PLANNING_CLOSING_REMINDER_MINUTES` de anticipación (30 por defecto) sobre la hora de corte vigente. Con la revisión apagada, n8n puede llamar a `POST /api/internal/notifications/closing-soon` cada minuto.
- **Pasado el corte** no hace falta n8n: la API revisa cada minuto y avisa a quien no registró y al supervisor (`PLANNING_SCHEDULER_SECONDS`). Si se apaga esa revisión (`0`), n8n puede llamar a `POST /api/internal/notifications/missed-projections` con la misma frecuencia.
- **Reintentos:** 3 intentos, separados 5 s, si el backend no responde.

## 03_agente_chatbot

```
Chat de supervisores (Basic Auth) → Agente AviPlanner ← Claude (Anthropic)
                                                     ← Memoria (8 mensajes)
                                                     ← AviPlanner MCP (POST {{ $env.BACKEND_URL }}/mcp)
```

Chatbot que responde preguntas de negocio con datos reales: proyecciones por vendedor y día, quién registró, saca sugerida, stock, producción y cargas de archivos. Solo lee: no registra ni cambia nada. Decisión, permisos y costo en el [ADR 0017](../../docs/adr/0017-agente-de-ia-con-mcp-y-n8n.md).

### Antes de importarlo

1. **Token del agente en el backend.** Genera uno (`openssl rand -hex 32`) y ponlo en `MCP_AGENT_TOKEN` del `.env` (en producción, en el panel o en el `.env` del servidor). Reinicia el backend: `docker compose up -d backend`. Ese token actúa con el rol de solo lectura `ai_agent` (ve lo mismo que un supervisor).
2. **Modelo (opcional).** `AGENT_MODEL` en el `.env`: `claude-sonnet-5-5` por defecto; `claude-haiku-5-5` es la opción barata. Después, `docker compose up -d n8n`.
3. **Credenciales en n8n** (*Overview → Credentials → Create*). Usa exactamente estos nombres; los valores nunca van al repositorio:

   | Nombre | Tipo | Valor |
   |---|---|---|
   | `Anthropic (AviPlanner)` | Anthropic | La clave de la API de Anthropic (consola de Anthropic). |
   | `AviPlanner MCP (agente)` | Bearer Auth | El mismo valor de `MCP_AGENT_TOKEN`. |
   | `AviPlanner chat (supervisores)` | Basic Auth | Usuario y contraseña del chat. Entrégalos **solo a supervisores**. |

### Importar y activar

```bash
docker compose exec n8n n8n import:workflow --input=/data/workflows/03_agente_chatbot.json
docker compose exec n8n n8n publish:workflow --id=aviplannerAgente03
docker compose restart n8n
```

Abre el workflow en el editor y, en cada nodo con un aviso de credencial (*Claude (Anthropic)*, *AviPlanner MCP* y *Chat de supervisores*), elige la credencial creada arriba y guarda.

### Probarlo

1. En el nodo *Chat de supervisores*, copia la **Chat URL** y ábrela en el navegador. Entra con el usuario y la contraseña del chat. En el editor también sirve el botón *Open chat*.
2. Haz al menos estas tres preguntas y compara con la app:
   - «¿Cuánto proyectó Roberto Navarro para mañana?» (pantalla de proyecciones del supervisor).
   - «¿Qué saca se sugiere para hoy?» (pantalla Saca).
   - «¿Qué cargas de archivos fallaron hoy?» (`GET /ingest/log?status=failed`).
3. Pregunta algo sin datos, por ejemplo la producción de hace dos años: debe decir que no hay datos, sin inventar cifras.
4. Revisa la auditoría en `logs/app.log`: una línea `app.mcp` por herramienta, con usuario `agente:n8n`, herramienta, argumentos y resultado.

Para probar el MCP sin n8n:

```bash
curl -s http://localhost:8000/mcp -H "Authorization: Bearer $MCP_AGENT_TOKEN" \
  -H "Content-Type: application/json" -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"listar_vendedores","arguments":{}}}'
```

Sin la cabecera `Authorization`, o con un token inválido, responde 401.

### Notas

- **Quién puede usar el chat:** solo supervisores. El agente ve todo el equipo; un vendedor con acceso al chat vería datos de otros. Para eso no se usa «n8n User Auth»: daría acceso al editor de n8n.
- **Sin `temperature`:** `claude-sonnet-5-5` y `claude-haiku-5-5` rechazan valores distintos al predeterminado. No la agregues en las opciones del nodo.
- **Límite:** 30 llamadas a herramientas por minuto para el agente (`MCP_RATE_LIMIT`), compartidas por todos los que usan el chat. Si se pasa, el agente dice que espere un minuto.
- **Fecha de hoy:** el system prompt la toma de `$now` en hora de Lima, para entender «hoy», «mañana» y «el jueves».
- **Otro cliente MCP** (por ejemplo Claude Desktop): usa la misma URL con el token de la persona (`POST /api/auth/token`). Así ve solo lo que su rol permite.

## Avisos propios desde n8n

Cualquier workflow puede notificar a los usuarios de la app con un *HTTP Request*:

- `POST {{ $env.BACKEND_URL }}/api/internal/notifications`
- Cabecera `X-Api-Token: {{ $env.INGEST_API_TOKEN }}`
- Cuerpo JSON:
  ```json
  {"audience": "sellers", "title": "Ventas actualizadas", "body": "Ya puedes comparar la venta real de ayer.", "link": "/dashboards/vs-venta"}
  ```

`audience` acepta `all`, `sellers`, `supervisors` o el usuario de una persona. `link` es opcional y solo admite rutas internas de la app (empiezan con `/`).

## 04_drive_aris

```
Google Drive Trigger (carpeta, cada 15 min) → ¿Excel o CSV? → Descargar → POST /api/internal/aris → ¿200?
                                                    └→ ignorar                         ├→ aviso «Datos de ARIS cargados»
                                                                                       └→ aviso «No se pudo cargar»
```

Quien tenga el export de ARIS (DESPACHO y/o VENTAS, en Excel o CSV) lo deja en una carpeta de Google Drive y se carga solo, igual que si lo subiera desde el aviso de la app.

- **Solo reemplaza las fechas que trae el archivo:** se puede dejar el export de un día, de una semana o el completo, y volver a dejar el mismo sin duplicar nada.
- **Después de cargar,** el backend pide al programador que reentrene el modelo de demanda (tarda alrededor de un minuto). A los supervisores les llega un aviso con lo cargado o con el error.
- **Una hoja de cálculo de Google** se descarga como Excel.

### Para activarlo

1. **Carpeta.** Crea una carpeta en Google Drive y pon su URL en `ARIS_DRIVE_FOLDER_URL` del `.env` de n8n (en Coolify, en las variables del servicio). Después reinicia n8n.
2. **Credencial.** En n8n, abre el workflow, entra a *Archivo nuevo en la carpeta de Drive* y conecta una credencial **Google Drive OAuth2** de una cuenta con acceso a esa carpeta. Usa la misma credencial en *Descargar de Drive*.
3. **Publicar.** Activa el workflow: `docker compose exec n8n n8n publish:workflow --id=avicola2DriveAris04`, o actívalo desde el editor.
