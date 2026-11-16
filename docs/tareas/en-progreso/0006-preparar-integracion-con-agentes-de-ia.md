# 0006 · Dejar todo listo para conectar agentes de IA (n8n / chatbot)

- **Área:** backend · n8n · frontend
- **Prioridad:** media
- **Creada:** 2026-11-16
- **Depende de:** [0005](0005-auditar-arquitectura-hexagonal-del-backend.md), para que los puertos estén claros antes de exponerlos

## Contexto

Se quiere conectar la plataforma con agentes de IA, probablemente un chatbot. Por ejemplo: «¿cuánto proyectó el vendedor X para mañana?», «¿qué saca se sugiere para el jueves?» o «¿qué cargas fallaron hoy?».

La base ya existe:

- **n8n** está en el compose (2.43.6) con dos workflows (ingesta de Excel y recordatorio de proyección).
- El backend tiene **endpoints internos** (`/api/internal/...`) protegidos con token de servicio (`X-Api-Token`).
- Hay **notificaciones en tiempo real por SSE** ([ADR 0006](../../adr/0006-notificaciones-y-tiempo-real.md)).

## Qué hay que hacer

### Investigación y decisión

- [x] Evaluar las opciones y elegir una en un ADR:
  - **Agente en n8n** (nodo AI Agent con *tools* que llaman a la API, memoria y canal Telegram o WhatsApp).
  - **Servidor MCP** del backend, que expone los casos de uso como herramientas para Claude u otros clientes MCP. n8n también puede consumir MCP.
  - **Chat embebido** en el frontend.
- [x] Decidir el modelo de LLM, el costo estimado y dónde vive la clave.

### Backend listo para agentes

- [x] Exponer los casos de uso de **solo lectura** que un agente necesite (proyecciones, saca sugerida, stock, producción y estado de cargas) con un contrato estable, documentado en OpenAPI y con descripciones claras (los agentes leen esas descripciones).
- [x] Autenticación y permisos para el agente: un token o usuario de servicio con rol propio ([ADR 0010](../../adr/0010-roles-y-permisos.md)). Un agente **nunca** debe ver más de lo que vería el usuario que le pregunta.
- [x] Las acciones de escritura, si se permiten, requieren confirmación explícita del usuario.
- [x] Límites de uso (*rate limit*) y registro de auditoría de lo que consulta cada agente.

### n8n / chatbot

- [x] Workflow `03_agente_chatbot` versionado en `n8n/workflows/` y documentado en su README.
- [x] Canal elegido (Telegram, WhatsApp o widget web), con sus credenciales fuera del repositorio.
- [ ] Respuestas en español, con datos reales de la API y sin inventar cifras: si no hay datos, el agente lo dice.

## Criterios de aceptación

- Un ADR documenta la decisión.
- El agente responde al menos 3 preguntas de negocio con datos reales en el entorno `develop`.
- Hay tests de los endpoints expuestos, incluidos los de permisos: un vendedor no ve datos de otro.

## Notas

- Mantener la arquitectura hexagonal: el agente o MCP es **otro adaptador de entrada** que llama a los mismos casos de uso, sin lógica propia.

## Resultado (2026-11-16)

- Decisión en el [ADR 0017](../../adr/0017-agente-de-ia-con-mcp-y-n8n.md): **servidor MCP en el backend** (`POST /mcp`, SDK oficial `mcp` 2.3) **+ workflow de n8n con AI Agent** que lo usa. Incluye las opciones evaluadas, el modelo (`claude-sonnet-5-5`; `claude-haiku-5-5` como opción barata), el costo estimado con sus supuestos y dónde vive la clave (solo en una credencial de n8n).
- **Herramientas de solo lectura** (7), con descripciones en español: `listar_vendedores`, `proyecciones`, `confirmacion_del_equipo`, `saca_sugerida`, `stock`, `produccion` y `cargas_de_archivos`. Llaman a los mismos casos de uso que la API HTTP. No se expone ninguna escritura.
- **Contrato:** no está en el OpenAPI, porque MCP es JSON-RPC en un solo endpoint. El contrato son los esquemas y descripciones de cada herramienta (`tools/list`), probados en `tests/test_mcp.py`.
- **Autenticación:** `Authorization: Bearer` con el token de un usuario (actúa con los permisos de su rol) o con `MCP_AGENT_TOKEN` (rol de servicio `ai_agent`, solo lectura, ve lo que un supervisor). n8n usa el token de servicio, y el chat solo atiende a supervisores con usuario y contraseña (Basic Auth). Por qué, en el ADR.
- **Límite y auditoría:** 30 llamadas por minuto y usuario (Redis o memoria) y una línea `app.mcp` por llamada, con usuario, herramienta, argumentos resumidos y resultado.
- **n8n:** `n8n/workflows/03_agente_chatbot.json` (id `aviplannerAgente03`), con Chat Trigger, AI Agent, Claude (modelo en `AGENT_MODEL`), memoria y MCP Client. Cómo importarlo, qué credenciales crear y cómo probarlo: [README de los workflows](../../../n8n/workflows/README.md).
- **Pruebas:** `test_mcp.py` (cada herramienta por el transporte real, 401, permisos, agente, límite y auditoría), `test_mcp_properties.py` (Hypothesis: alcance por rol contra un oráculo de la especificación, y *fuzzing* de argumentos), `test_mcp_limits.py` y `adversarial/test_adv_mcp_attacks.py`. Una revisión adversarial independiente encontró 4 problemas; están corregidos y quedan como regresión (detalle en el ADR).

### Pendiente (necesita credenciales reales o el despliegue)

- [ ] **Respuestas en español con datos reales, sin inventar cifras** y el criterio **«el agente responde al menos 3 preguntas de negocio con datos reales en `develop`»**. El system prompt lo exige, pero solo se puede comprobar con el LLM real. Pasos para el usuario:
  1. En el entorno `develop`, poner `MCP_AGENT_TOKEN` (`openssl rand -hex 32`) en el backend y, si se quiere otro modelo, `AGENT_MODEL` en n8n. Redesplegar.
  2. En n8n de `develop`, crear las credenciales `Anthropic (AviPlanner)` (clave de la API de Anthropic), `AviPlanner MCP (agente)` (Bearer con el mismo `MCP_AGENT_TOKEN`) y `AviPlanner chat (supervisores)` (Basic Auth).
  3. Importar y publicar `03_agente_chatbot`, elegir las credenciales en los tres nodos y abrir la Chat URL.
  4. Hacer las tres preguntas del README (proyección de un vendedor para mañana, saca de hoy, cargas fallidas de hoy) y una sin datos. Comparar con la app y revisar las líneas `app.mcp` en `logs/app.log`.
  5. Fijar un tope de gasto mensual en la consola de Anthropic.
