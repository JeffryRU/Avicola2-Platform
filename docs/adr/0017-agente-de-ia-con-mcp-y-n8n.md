# ADR 0017: agente de IA con un servidor MCP en el backend y un workflow de n8n

- **Estado:** aceptado
- **Fecha:** 2026-11-16

## Contexto

- La [tarea 0006](../tareas/pendientes/0006-preparar-integracion-con-agentes-de-ia.md) pide un chatbot que conteste preguntas de negocio con datos reales: «¿cuánto proyectó el vendedor X para mañana?», «¿qué saca se sugiere para el jueves?», «¿qué cargas fallaron hoy?».
- n8n ya está en el compose (2.43.6), con dos workflows. El backend es hexagonal ([ADR 0004](0004-arquitectura-hexagonal-y-base-de-datos-intercambiable.md)) y sus capas las vigila import-linter ([ADR 0016](0016-capas-con-import-linter-y-fuentes-unicas.md)).
- Los permisos viven en una sola fuente, `permissions.py` ([ADR 0010](0010-roles-y-permisos.md)). Un agente **nunca** debe ver más de lo que vería quien le pregunta.

## Opciones evaluadas

| Opción | A favor | En contra |
|---|---|---|
| **Agente en n8n con *tools* HTTP** a la API | Sin código nuevo en el backend | Cada herramienta se describe a mano en n8n (se desfasa de la API). La API pide cookie o token de 12 h: n8n tendría que hacer login. Sin auditoría ni límite por herramienta. |
| **Servidor MCP en el backend** | Las herramientas y sus descripciones viven junto a los casos de uso. Sirve para n8n, Claude Desktop o cualquier cliente MCP. Un solo lugar para permisos, límite y auditoría. | Una dependencia nueva (`mcp`) y un endpoint más que proteger. |
| **Chat embebido en el frontend** | Cada persona usa su propia sesión: alcance y auditoría por usuario | Hay que construir la interfaz, el bucle del agente y guardar la clave del LLM en el backend. Es más trabajo para una primera versión. |

## Decisión

**Servidor MCP en el backend + un workflow de n8n con AI Agent que lo usa.** El chat embebido queda como siguiente paso: el MCP ya acepta el token de cada usuario.

### El MCP es otro adaptador de entrada

- `POST /mcp`, con el SDK oficial de Python (`mcp` 2.3, `MCPServer`, Streamable HTTP). Sin estado (`stateless_http`) y con respuestas JSON: funciona igual con varios workers. `GET /mcp` responde 405.
- La plomería común (token, límite, auditoría) está en `shared/infrastructure/mcp/`. Cada módulo registra sus herramientas desde su adaptador: `planning/infrastructure/mcp/` e `ingest/infrastructure/mcp/`. `app.main` los conecta.
- Las herramientas llaman a **los mismos casos de uso** que el router HTTP. Solo cambian el formato: claves en español, nombre del producto junto al código, sin ceros, JSON compacto (cada carácter cuesta) y como mucho 200 filas por respuesta.
- import-linter: los dos adaptadores MCP pueden usar `bootstrap` (`bootstrap-solo-desde-entradas`), los adaptadores de salida no pueden importarlos (`adaptadores-de-salida`) y `mcp` está prohibido en el dominio y la aplicación (`dominio-puro`).

### Herramientas (todas de solo lectura)

| Herramienta | Caso de uso | Quién la usa |
|---|---|---|
| `listar_vendedores` | `ListSellers` | todos (el vendedor se ve solo a sí mismo) |
| `proyecciones(fecha_desde, fecha_hasta, vendedor?)` | `ListProjections` | todos (el vendedor, solo lo suyo) |
| `confirmacion_del_equipo(fecha)` | `ListSellers` + `ListProjections` (la regla de la exportación: registró quien tiene al menos una proyección ese día) | todos (el vendedor, solo su estado) |
| `saca_sugerida(fecha)` | `CalculateSaca` | `view_saca` |
| `stock(fecha_desde, fecha_hasta)` | `ListStock` | `view_stock` |
| `produccion(fecha_desde, fecha_hasta)` | `ListProduction` | `view_production` |
| `cargas_de_archivos(estado?, limite?)` | `ListIngestionLog` | `view_team` (la ingesta no conoce roles: `app.main` le pasa la regla) |

- No se expone ninguna escritura. Todas llevan `readOnlyHint`. Si algún día se expone una, tendrá que pedir confirmación explícita del usuario.
- Las descripciones están en español y explican cuándo usar cada herramienta: los agentes las leen para elegir.

### Autenticación y permisos

- Toda petición exige `Authorization: Bearer <token>`. Sin token o con uno inválido: **401** (lo responde el SDK antes de llegar a una herramienta). La cookie del navegador no sirve: sin cookie no hay CSRF posible.
- **Token de un usuario** (el de `POST /api/auth/token`, como la app móvil): el MCP actúa como esa persona, con los permisos de su rol. Cada llamada vuelve a validar el token contra la base: cambiar la contraseña, desactivar la cuenta o cambiar el rol corta el acceso al instante.
- **Token del agente de servicio** (`MCP_AGENT_TOKEN`: 32+ caracteres aleatorios, distinto de `AUTH_SECRET` y de `INGEST_API_TOKEN`; fuera de local, uno débil impide arrancar): actúa como `agente:n8n`, que no es una cuenta, con el rol **`ai_agent`** de `permissions.py`. Tiene `view_team`, `view_saca`, `view_stock` y `view_production`: ve lo mismo que un supervisor y no gestiona nada. No está en `ROLES`: nadie lo crea ni lo asigna, y no recibe avisos. Ese token solo vale en `/mcp`; la API HTTP (y sus escrituras) no lo acepta.
- Los permisos los comprueban los casos de uso, como en la API. La regla vive solo en `permissions.py`.
- Si la base no responde al verificar el token, `/mcp` contesta **503** con `Retry-After` (no 500).

### Cómo se autentica n8n y por qué

- **El workflow usa el token del agente de servicio**, guardado en la credencial de n8n «AviPlanner MCP (agente)» (Bearer).
- **Por qué no el token de quien pregunta:** el chat de n8n no conoce la sesión de AviPlanner (la web la guarda en una cookie HttpOnly que nadie puede leer) y el nodo MCP Client usa una credencial fija. Un token de usuario dura 12 h y habría que renovarlo a mano.
- **Para que el agente nunca vea más que quien pregunta:** el chat solo atiende a **supervisores identificados**. El Chat Trigger exige usuario y contraseña (Basic Auth, credencial «AviPlanner chat (supervisores)»), que solo se entrega a supervisores. El rol `ai_agent` no ve nada que un supervisor no vea. **Nunca se da acceso al chat a vendedores ni al jefe de despacho**: verían datos del equipo.
- **Por qué Basic Auth y no «n8n User Auth»:** con este, cada supervisor necesitaría una cuenta en el editor de n8n, que tiene acceso a `$env` (y con él al `INGEST_API_TOKEN`). Basic Auth no da acceso al editor.
- **Límite conocido:** la auditoría registra `agente:n8n`, no a la persona del chat. Cuando haga falta alcance y auditoría por persona, el camino es el chat embebido en la app con el token de cada usuario (el MCP ya lo soporta).

### Límite y auditoría

- **Límite por usuario:** `MCP_RATE_LIMIT` llamadas a herramientas (30 por defecto) cada `MCP_RATE_WINDOW_SECONDS` (60). Cuentan también las llamadas con argumentos inválidos. Al pasarse, la herramienta responde «Demasiadas consultas seguidas…» (el agente lo lee y lo explica).
- Usa el mismo backend que la caché ([ADR 0014](0014-cache-en-memoria-o-redis.md)): en Redis el contador es de todos los procesos (`INCR` + `EXPIRE`, prefijo `aviplanner:<APP_ENV>:ratelimit:`). Si Redis no responde, cuenta en memoria por 30 s y vuelve a probar: el límite nunca se apaga y una caída no hace esperar a cada llamada.
- **Auditoría:** cada `tools/call` deja una línea en el logger `app.mcp` (en `app.log`, y en JSON con `LOG_FORMAT=json`) con `mcp_user`, `mcp_role`, `mcp_tool`, `mcp_args` (hasta 8 claves, valores de hasta 60 caracteres), `mcp_result` (`ok`, `error`, `rate_limited`), `mcp_error`, `mcp_size` y `duration_ms`. El token nunca se registra. El nombre de la herramienta y los argumentos los manda el cliente: se recortan y se les quitan los saltos de línea, para que nadie pueda fabricar líneas falsas ni llenar el disco. Lleva el mismo `request_id` que la línea de la petición HTTP.

### Modelo, costo y clave

- **Modelo:** `claude-sonnet-5-5` por defecto, en la variable `AGENT_MODEL` del contenedor de n8n. Opción barata: `claude-haiku-5-5`, suficiente para preguntas directas.
- **La clave de Anthropic vive solo en n8n**, en la credencial «Anthropic (AviPlanner)», cifrada con `N8N_ENCRYPTION_KEY`. No está en el repositorio ni en el backend: el backend nunca llama al LLM.
- **Costo estimado** (precios de lista de Anthropic, noviembre de 2026, por millón de tokens: Sonnet 5.5, US$ 2 de entrada y US$ 10 de salida; Haiku 5.5, US$ 0,10 y US$ 0,50).

  Supuestos por pregunta: 2 o 3 llamadas al modelo (elegir herramienta, a veces buscar al vendedor, responder). Cada llamada envía el system prompt (~700 tokens), las 7 herramientas (~1.500) y la memoria (~600). Los resultados de las herramientas suman ~1.500 tokens. En total, **~10.000 tokens de entrada y ~1.000 de salida** (incluido el razonamiento del modelo). Sin caché de prompts (n8n no la configura).

  | | Por pregunta | Por mes (5 supervisores × 10 preguntas × 26 días = 1.300) |
  |---|---|---|
  | `claude-sonnet-5-5` | ~US$ 0,03 | ~US$ 39 |
  | `claude-haiku-5-5` | ~US$ 0,0015 | ~US$ 2 |

  Conviene fijar un tope de gasto mensual en la consola de Anthropic. El límite por usuario del MCP también acota cuántas veces puede iterar el agente.

## Consecuencias

- **Chat dentro de la app para todos los roles:** ver el [ADR 0022](0022-asistente-en-la-app-para-todos.md). Este chat de n8n para supervisores sigue igual.
- Hay un endpoint nuevo, `/mcp`, también visible desde el dominio público (Caddy o Traefik reenvían todo al backend). Sin token responde 401.
- `AuthSettings` del SDK pide un `issuer_url`. Como no hay OAuth ni metadatos de descubrimiento, no se publica ni se usa.
- La protección contra *DNS rebinding* del SDK está apagada: rechazaba el host real (`backend:8000` desde n8n), y sin cookies una página ajena no puede usar las credenciales de nadie.
- Los logs del SDK (`mcp`) y de `httpx2` quedan en WARNING; la auditoría propia ya cubre cada llamada.
- **Pruebas:** `tests/test_mcp.py` llama a cada herramienta con el cliente MCP oficial por el transporte real, contra la app en proceso: 401 sin token o con uno inválido, un vendedor no ve datos de otro, permisos por rol, agente de servicio, límite y auditoría. `tests/test_mcp_properties.py` prueba con Hypothesis el alcance por rol contra un oráculo escrito desde la especificación, y hace *fuzzing* de los argumentos de cada herramienta (marca `fuzz`). `tests/test_mcp_limits.py` prueba el límite en memoria, en Redis y con Redis caído. `tests/adversarial/test_adv_mcp_attacks.py` deja como regresión los ataques de una revisión adversarial independiente (ver abajo). Schemathesis no aplica: el MCP es JSON-RPC en un solo endpoint y no está en el OpenAPI.
- **Revisión adversarial** (con el código y la especificación, sin las conclusiones del autor). Encontró 4 problemas, ya corregidos:
  1. El nombre de la herramienta llegaba sin limpiar al log de texto: con un salto de línea se podían fabricar líneas de auditoría falsas.
  2. Ese nombre no tenía largo máximo en el log: 3 MB por llamada podían borrar la auditoría real al rotar los archivos.
  3. `confirmacion_del_equipo` agrupaba por nombre y zona: dos vendedores homónimos de la misma zona se contaban como uno. Ahora va por usuario y devuelve también el usuario.
  4. Una caída de la base al verificar el token respondía 500. Ahora es 503.

  También se endureció `MCP_AGENT_TOKEN` (no se aceptan espacios, repeticiones ni el valor de otro secreto). Resistieron, entre otros: trucos con la cabecera `Authorization`, cabeceras duplicadas, la cookie de sesión, 80 llamadas concurrentes de 4 usuarios sin mezclar identidades, un cambio de rol con el token viejo, lotes JSON-RPC, `tools/call` como notificación, el protocolo 2026-07-28, comodines en el filtro de vendedor y rangos enormes.
- **Límites conocidos:** el límite solo cuenta `tools/call` (listar herramientas no cuenta, pero sí exige token). Todos los que usan el chat de n8n comparten el contador de `agente:n8n`. La ventana es fija: en el borde entre dos ventanas pueden pasar hasta el doble de llamadas.
- **Pendiente para usarlo en develop:** crear las credenciales en n8n, poner `MCP_AGENT_TOKEN` en el backend e importar el workflow ([README de los workflows](../../n8n/workflows/README.md)).
