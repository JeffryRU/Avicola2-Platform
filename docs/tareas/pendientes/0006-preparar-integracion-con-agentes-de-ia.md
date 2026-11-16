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

- [ ] Evaluar las opciones y elegir una en un ADR:
  - **Agente en n8n** (nodo AI Agent con *tools* que llaman a la API, memoria y canal Telegram o WhatsApp).
  - **Servidor MCP** del backend, que expone los casos de uso como herramientas para Claude u otros clientes MCP. n8n también puede consumir MCP.
  - **Chat embebido** en el frontend.
- [ ] Decidir el modelo de LLM, el costo estimado y dónde vive la clave.

### Backend listo para agentes

- [ ] Exponer los casos de uso de **solo lectura** que un agente necesite (proyecciones, saca sugerida, stock, producción y estado de cargas) con un contrato estable, documentado en OpenAPI y con descripciones claras (los agentes leen esas descripciones).
- [ ] Autenticación y permisos para el agente: un token o usuario de servicio con rol propio ([ADR 0010](../../adr/0010-roles-y-permisos.md)). Un agente **nunca** debe ver más de lo que vería el usuario que le pregunta.
- [ ] Las acciones de escritura, si se permiten, requieren confirmación explícita del usuario.
- [ ] Límites de uso (*rate limit*) y registro de auditoría de lo que consulta cada agente.

### n8n / chatbot

- [ ] Workflow `03_agente_chatbot` versionado en `n8n/workflows/` y documentado en su README.
- [ ] Canal elegido (Telegram, WhatsApp o widget web), con sus credenciales fuera del repositorio.
- [ ] Respuestas en español, con datos reales de la API y sin inventar cifras: si no hay datos, el agente lo dice.

## Criterios de aceptación

- Un ADR documenta la decisión.
- El agente responde al menos 3 preguntas de negocio con datos reales en el entorno `develop`.
- Hay tests de los endpoints expuestos, incluidos los de permisos: un vendedor no ve datos de otro.

## Notas

- Mantener la arquitectura hexagonal: el agente o MCP es **otro adaptador de entrada** que llama a los mismos casos de uso, sin lógica propia.
