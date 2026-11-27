# ADR 0024: Historial, tablas y canales (Telegram y WhatsApp) del asistente

- **Estado:** aceptado (2026-11-26)
- **Amplía:** [ADR 0022](0022-asistente-en-la-app-para-todos.md)

## Contexto

El asistente de la app (ADR 0022) responde por streaming, pero:

- las conversaciones no se guardan: al cerrar el panel se pierden y no se pueden retomar;
- las respuestas con tablas llegan como texto y no se pueden ampliar ni descargar en Excel;
- solo existe dentro de la app, y el equipo trabaja sobre todo por WhatsApp y Telegram;
- los vendedores anotan la proyección en papel o en una pizarra: enviar una foto es más rápido que
  escribirla otra vez.

## Decisión

### 1. Historial en Postgres (esquema `app`)

No se agrega MongoDB: el estado de la app vive en Postgres (CLAUDE.md, ADR 0002 y 0023). Dos
tablas nuevas (nombres en `backend/config/tables.yaml`, migración de Alembic con `app_schema()`):

| Tabla | Columnas |
|---|---|
| `np_assistant_conversations` | `id` (uuid, pk), `username`, `channel` (`app` \| `telegram` \| `whatsapp`), `title` (varchar 120, la primera pregunta recortada), `created_at`, `updated_at`, `archived` (bool) |
| `np_assistant_messages` | `id` (uuid, pk), `conversation_id` (fk, on delete cascade), `role` (`user` \| `assistant`), `text`, `blocks` (JSON, solo del asistente), `suggestions` (JSON), `created_at` |

- Cada persona ve **solo sus** conversaciones (el `username` sale de la sesión, nunca del cuerpo).
- El id de la conversación lo sigue eligiendo la app (UUID). La primera pregunta la crea.
- Se guardan la pregunta y la respuesta final (`done`). Las que detiene el guardrail también.
- Retención: `ASSISTANT_HISTORY_DAYS` (90 por defecto). El cron diario borra las más viejas.
- La memoria del agente sale de este historial: el backend le manda al agente los últimos 8 mensajes de la conversación (`history`, cada uno recortado a 1,500 caracteres) y el flujo 07 ya no tiene nodo de memoria. Así, una conversación retomada desde el historial, o desde Telegram o WhatsApp, conserva el contexto aunque n8n se reinicie, sin otra credencial de base en n8n.

### 2. Respuestas con tablas

El agente escribe las tablas como **tablas Markdown** (`| col | col |` con la fila `|---|`). Si
la tabla tiene título, va en la línea anterior como `**Título**`. El backend las separa de la
respuesta final:

```json
{"type": "done", "message_id": "uuid", "reply": "texto completo",
 "blocks": [
   {"type": "text", "text": "Para mañana…"},
   {"type": "table", "title": "Proyección del 27/11", "columns": ["Producto", "Unidades", "Kg"],
    "rows": [["Brasa", "2340", "2340"]]}
 ],
 "suggestions": ["¿Por qué…?"]}
```

- Celdas como texto (lo que escribió el agente). Máximo 12 columnas y 200 filas por tabla; si se
  pasa, se recorta y se agrega un bloque de texto que lo dice.
- Mientras llega el streaming, la app muestra el texto tal cual. Con `done`, lo reemplaza por los
  bloques.
- Una tabla se descarga en Excel desde el mensaje guardado (no desde datos que mande el cliente):
  `GET /api/assistant/messages/{message_id}/tables/{index}.xlsx`. Solo para el dueño de la
  conversación. Título en la primera fila, encabezados en negrita, números como números si se
  pueden leer como tales, columnas con ancho automático.
- Debajo de cada tabla, la app ofrece: **Ampliar** (diálogo a pantalla completa), **Descargar
  Excel**, y preguntas rápidas que se envían como un mensaje más de la conversación: «¿Por qué
  salen estos números?» y «¿Qué recomiendas para otro día?».

### 3. API del historial (sesión)

| Método y ruta | Respuesta |
|---|---|
| `GET /api/assistant/conversations?limit=30&before=<iso>` | `[{id, title, channel, updated_at, preview}]`, de la más reciente a la más vieja |
| `GET /api/assistant/conversations/{id}` | `{id, title, channel, messages: [{id, role, text, blocks, suggestions, created_at}]}` |
| `DELETE /api/assistant/conversations/{id}` | 204 (archiva: ya no se lista) |
| `POST /api/assistant/messages/stream` | igual que hoy; `done` trae además `message_id` y `blocks` |
| `POST /api/assistant/messages` | igual que hoy; la respuesta trae además `message_id` y `blocks` |

En el panel del asistente: botón **Historial** (lista de conversaciones, con borrar) y botón
**Nueva conversación**.

### 4. Telegram y WhatsApp

Telegram solo admite un webhook por bot y la app de Meta uno por número, así que el asistente se
agrega a los workflows que ya existen: `05_telegram_aris` y `06_whatsapp_aris`. Un Excel o CSV
sigue yendo a ARIS: lo puede mandar quien tenga el chat vinculado a una cuenta con un rol de `ARIS_CHANNEL_ROLES` (supervisor general por defecto; la carga queda a su nombre) o un chat de la lista de n8n de siempre. El texto y las fotos van al asistente.

**Vincular la cuenta.** En la app (panel del asistente → «Usar en Telegram o WhatsApp»), la
persona pide un código de 6 caracteres que vale 10 minutos y lo envía al bot: `vincular ABC123`
(también `/vincular ABC123` o `/start ABC123`). El backend guarda la vinculación en
`np_assistant_channel_links` (`channel`, `sender` = id de chat o número sin «+», `username`,
`created_at`; único por `channel`+`sender`). Desactivar la cuenta o restablecer su contraseña
borra sus vinculaciones. Sin vinculación, el bot solo explica cómo vincularse.

**Endpoints internos** (n8n, cabecera `X-Api-Token`, como `/api/internal/aris`):

| Método y ruta | Hace |
|---|---|
| `POST /api/internal/channel/message` `{channel, sender, text}` | Vincula (`vincular CÓDIGO`), confirma o descarta un borrador pendiente (`sí` / `no`), empieza una conversación (`nueva` o `/nueva`) o le pregunta al asistente **como la persona vinculada**, con los mismos permisos, límites y guardrails que en la app. |
| `POST /api/internal/channel/photo` `{channel, sender, extraction}` | Recibe lo que el modelo leyó de una foto y arma un borrador (ver abajo). |
| `GET /api/internal/channel/context?channel=&sender=` | Para el paso de visión: `{linked, name, can_project, can_stock, today, dates: [...], products: [{id, name, category, unit}]}` |
| `GET /api/internal/channel/files/{token}` | Descarga un Excel generado para el canal. Token firmado de un solo archivo que vence en 15 minutos. |

Respuesta de `message` y de `photo` (lo que n8n reenvía):

```json
{"text": "texto para el chat (tablas en monoespaciado, sin Markdown que el canal no muestre)",
 "files": [{"name": "proyeccion-27-11.xlsx", "url": "/api/internal/channel/files/<token>"}],
 "suggestions": ["…"]}
```

- Las tablas se muestran como texto alineado en un bloque monoespaciado. Además, si la respuesta
  tiene tablas, se adjunta cada una en Excel.
- La conversación del canal es una por persona y canal (`channel` = `telegram` \| `whatsapp`). La
  retoma hasta que pase `ASSISTANT_CHANNEL_IDLE_HOURS` (12) sin mensajes, o hasta que escriba
  `nueva`. Aparece en el historial de la app con su canal.
- Las sugerencias se muestran como una lista numerada. Si la persona responde solo con el número,
  se envía esa pregunta.

**Foto de la proyección o del stock.**

1. n8n descarga la foto (Telegram: `getFile`; WhatsApp: enlace de la Graph API).
2. n8n pide el contexto (`GET …/channel/context`) y le manda la imagen a Claude con salida
   estructurada (JSON Schema):
   `{kind: "projection" | "stock" | "unknown", date: "YYYY-MM-DD" | null, rows: [{product: "texto
   leído", units: int | null, kg: number | null, lot_date: "YYYY-MM-DD" | null}], notes: str}`.
3. n8n envía esa extracción a `POST …/channel/photo`. El backend nunca confía en el modelo: busca
   cada producto en el catálogo (nombre exacto, sin tildes ni mayúsculas, alias del catálogo y,
   por último, el más parecido con una similitud de al menos 0,8). Valida la fecha con la ventana
   de registro o las fechas del stock, y los permisos de la persona.
4. El backend guarda un **borrador** en `np_assistant_drafts` (`id`, `username`, `channel`,
   `kind`, `payload` JSON, `created_at`, `expires_at` = 30 minutos, `status` = `pending` \|
   `confirmed` \| `discarded` \| `expired`). Hay un solo borrador pendiente por persona: uno nuevo
   reemplaza al anterior. Responde con la tabla de lo que va a registrar, lo que no reconoció y
   «Responde *sí* para registrarlo o *no* para descartarlo».
5. Con `sí`, el backend registra con los casos de uso de siempre (`SubmitProjection` como la
   persona, `RegisterStock` si tiene `MANAGE_STOCK`). Aplican las mismas reglas de la app: hora de
   corte, ventana, permisos, historial de cambios y avisos.

### 5. Velocidad del agente

- El nodo Anthropic Chat Model pasa a la versión 1.6 con **Stream Responses** activado. Sin esa opción, n8n recibía la respuesta entera del modelo y recién al final la mandaba en partes: la primera palabra llegaba casi junto con la última.
- Caché del prompt de 5 minutos. Lo que cambia por persona y por día va al final de las instrucciones, para que el resto se pueda reutilizar.
- Se mantiene el pensamiento adaptativo con esfuerzo medio. En un conjunto fijo de 11 preguntas por rol, el esfuerzo bajo y sin pensamiento no fueron más rápidos de forma pareja, y el bajo interpretó mal las fechas de la saca.

## Consecuencias

- Las preguntas y respuestas quedan guardadas (`ASSISTANT_HISTORY_DAYS`). En la copia de Supabase
  también.
- Telegram y WhatsApp necesitan sus credenciales en n8n (ver `n8n/workflows/README.md`). WhatsApp
  solo responde dentro de las 24 horas del último mensaje de la persona, que aquí siempre se
  cumple.
- Las fotos pasan por la API de Anthropic, igual que las preguntas.
- Variables nuevas: `ASSISTANT_HISTORY_DAYS`, `ASSISTANT_CHANNEL_IDLE_HOURS`.
