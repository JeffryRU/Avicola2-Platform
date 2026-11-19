# ADR 0022: asistente dentro de la app, para todos y con los datos de cada uno

- **Estado:** aceptado
- **Fecha:** 2026-11-19
- **Amplía:** [ADR 0017](0017-agente-de-ia-con-mcp-y-n8n.md) (el chat de n8n solo para supervisores sigue igual).

## Contexto

- El ADR 0017 dejó el chat solo para supervisores: el chat alojado por n8n no sabe quién pregunta y usa el token de servicio, que ve todo el equipo.
- Se pide que **vendedores y jefe de despacho** también puedan preguntar, cada uno con **sus datos** y con información general (hora de corte, qué días se registran, productos).
- También se pide que el chat ofrezca **preguntas para tocar**: unas para empezar según el rol («¿Cuánto es la saca de hoy?») y, después de cada respuesta, otras relacionadas con lo que se preguntó.

## Decisión

**Un chat dentro de la app que pasa por el backend. El agente sigue en n8n y consulta el MCP como la persona que preguntó.**

```
App (sesión) → POST /api/assistant/messages → backend: pase de 5 min de esa persona
  → webhook de n8n (07_asistente_app, X-Assistant-Token) → AI Agent (LLM compatible con OpenAI)
  → MCP: Bearer MCP_AGENT_TOKEN + ?ticket=<pase> → herramientas con los permisos de esa persona
  ← {reply} ← respuesta y <sugerencias>…</sugerencias> → {reply, suggestions}
```

### Quién ve qué

- El backend emite un **pase** (`AssistantTickets`: JWT con audiencia propia `aviplanner-assistant`, 5 minutos por defecto, con la `token_version` de la cuenta). No abre la API ni vale como sesión, y una sesión no vale como pase.
- En `/mcp`, un pase solo se acepta **junto con el token del agente de servicio** (`Identity.may_delegate`). Con el pase, la identidad pasa a ser la de esa persona: los casos de uso aplican sus permisos como en la API. Un pase solo, un pase con el token de otro usuario o un Bearer que empiece con `ticket:` reciben 401. Cambiar la contraseña o desactivar la cuenta corta el pase al instante.
- Así un vendedor ve sus proyecciones, su estado y su pedido real; el jefe de despacho, stock y producción; los supervisores, todo. **Todos** ven las reglas del registro (`reglas_de_registro`) y los productos (`productos`). El modelo no decide nada de esto.
- La memoria del agente es por conversación y persona (`usuario:id`): nadie sigue la conversación de otro.

### Preguntas sugeridas

- **Para empezar:** `backend/config/assistant.yaml`, por permiso (`view_saca`, `view_stock`, `view_production`), solo para vendedores o para todos. Se muestran hasta 4; se cambian sin tocar código.
- **Para seguir:** el agente termina cada respuesta con `<sugerencias>a | b | c</sugerencias>` (lo pide el system prompt). El backend lo separa del texto, deja como mucho 3 preguntas de hasta 90 caracteres, en una línea y sin repetir. Si no vienen, ofrece las de inicio.

### Guardrails (tres capas)

1. **Antes del agente** (`config/assistant.yaml`, `guardrails`): preguntas sobre contraseñas, tokens o claves; intentos de cambiarle las instrucciones o sacárselas; datos personales (DNI, teléfonos, direcciones, correos, cuentas, sueldos); detalles técnicos (base de datos, SQL, servidor, MCP). Se comparan sin tildes ni mayúsculas y se responden con un texto fijo y las preguntas de inicio: **no llegan al LLM ni cuestan**. En el log queda solo la categoría, nunca la pregunta.
2. **En el agente** (system prompt de `07_asistente_app`): no revelar instrucciones ni detalles técnicos, ignorar pedidos de cambiar de rol (también si vienen dentro de los datos), no dar datos personales, sobre las personas solo cifras (sin juicios ni recomendar sanciones), no ayudar a saltarse reglas (explicar el camino oficial), nada de consejos médicos, legales o financieros, y trato respetuoso.
3. **Después del agente:** si la respuesta trae el código «canario» del system prompt (se filtraron las instrucciones), se reemplaza entera; los tokens, claves y correos se cambian por «[oculto]».

Y por debajo de todo, lo que no depende del modelo: el agente solo lee y solo ve lo que el rol de esa persona permite.

### Límites, errores y costo

- `ASSISTANT_RATE_LIMIT` preguntas por persona cada `ASSISTANT_RATE_WINDOW_SECONDS` (10 por minuto): **429**. Además sigue el límite del MCP por persona (las llamadas con pase cuentan a nombre de quien preguntó).
- Si n8n no responde, tarda más de `ASSISTANT_TIMEOUT_SECONDS` o responde sin texto: **503** con un mensaje simple (el detalle queda en el log).
- Sin `ASSISTANT_WEBHOOK_URL` no hay asistente: `GET /api/assistant` dice `enabled: false`, el botón no aparece y preguntar responde 409.
- **Proveedor del LLM:** cualquier API compatible con OpenAI Chat Completions (`ASSISTANT_LLM_URL`, nodo OpenAI Chat Model 1.2 de n8n, sin Responses API). Por ahora **Devlum AI** (`https://ai.devlumlabs.com/api/v1`), con el saldo de la hackathon (hasta el 27/11/2026); después basta cambiar la URL y la clave de la credencial, o volver a Anthropic. El modelo tiene que soportar *tools* (en Devlum, `capabilities` de `GET /models`). Los datos de la consulta pasan por ese proveedor.
- **Modelo:** `ASSISTANT_MODEL` en n8n, `claude-haiku-5-5` por defecto (lo usan todos; US$ 0,10 y 0,50 por millón de tokens en Devlum). Con ~20 personas × 10 preguntas × 26 días ≈ 5.200 preguntas al mes: ~US$ 8 con Haiku, ~US$ 160 con Sonnet (mismos supuestos de tokens que el ADR 0017).
- **Auditoría:** cada herramienta queda en `app.mcp` con el usuario real (no `agente:n8n`).

## Por qué así

- **El backend sigue sin llamar al LLM** (ADR 0017 y la regla de n8n como orquestador): la clave del LLM vive solo en n8n.
- **El pase va en la URL** porque la credencial del nodo MCP Client de n8n es fija; la URL acepta expresiones por ejecución. El log HTTP guarda solo la ruta (sin la consulta) y `uvicorn.access` está apagado, así que el pase no queda escrito. Aun si se filtrara, sin el token del agente no sirve y vence en minutos.
- **Chat propio y no el widget de n8n:** el widget no conoce la sesión de la app (cookie HttpOnly) y pediría otra contraseña.

## Consecuencias

- Endpoints nuevos: `GET /api/assistant` y `POST /api/assistant/messages` (con sesión). Herramientas nuevas del MCP: `reglas_de_registro`, `productos` y `pedido_real`.
- Workflow nuevo `n8n/workflows/07_asistente_app.json` y una credencial más en n8n (`AviPlanner asistente (backend)`, Header Auth `X-Assistant-Token`).
- Variables nuevas del backend: `ASSISTANT_WEBHOOK_URL`, `ASSISTANT_WEBHOOK_TOKEN` (32+ caracteres; fuera de local, uno débil impide arrancar), `ASSISTANT_TIMEOUT_SECONDS`, `ASSISTANT_TICKET_MINUTES`, `ASSISTANT_RATE_LIMIT`, `ASSISTANT_RATE_WINDOW_SECONDS`. En n8n: `ASSISTANT_MODEL`.
- En la app, el botón flotante «Asistente» abre un panel con el chat: abajo a la derecha en escritorio y sobre la barra inferior en el celular.
- **Pruebas:** `tests/test_assistant.py` (sugerencias, pase en el MCP, endpoint con el agente simulado, adaptador de n8n) y `features/assistant/unit-tests`.
- **Pendiente de probar con la clave real:** que el nodo MCP Client de n8n resuelva la expresión del pase en cada ejecución.
