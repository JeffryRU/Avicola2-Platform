# 0002 · Instalar skills de buenas prácticas (Vercel, React + Vite, diseño)

- **Área:** frontend · tooling
- **Prioridad:** alta (las tareas 0003 y 0004 dependen de esta)
- **Creada:** 2026-11-16

## Contexto

Antes de auditar y rediseñar el frontend, conviene que Claude Code tenga skills con criterios de calidad y de diseño, en lugar de depender solo de su criterio por defecto. El frontend se despliega en Vercel ([ADR 0007](../../adr/0007-frontend-en-vercel-con-proxy-api.md)) y usa React 19, Vite, Tailwind 4, Radix y TanStack Query.

## Qué hay que hacer

- [x] Buscar y verificar la fuente oficial de cada skill antes de instalarla (repositorio, autor y qué instrucciones o scripts trae):
  - Buenas prácticas de **Vercel**: `vercel-labs/agent-skills` (React best practices y web design guidelines).
  - Buenas prácticas de **React + Vite** (rendimiento, hooks, code splitting, React 19).
  - **Diseño:** *taste* (frontend taste) e **impeccable** (auditoría, crítica y pulido de UI).
- [x] Decidir dónde se instalan: en el usuario (`~/.claude/skills`) o en el proyecto (`.claude/skills`). Hoy `.claude/` está en `.gitignore` como configuración solo local.
- [x] Revisar el contenido de cada skill: no ejecutar scripts sin leerlos.
- [x] Anotar en esta tarea qué skills quedaron instaladas, con su versión o commit.

## Criterios de aceptación

- Las skills aparecen disponibles en Claude Code y se probó al menos una invocación de cada una sobre el frontend.

## Notas

- Las skills que se instalen y su versión quedan registradas aquí.

## Resultado (2026-11-16)

Se instalaron en el usuario (`~/.claude/skills`), porque `.claude/` del proyecto está en `.gitignore`. Antes de instalarlas se leyeron sus instrucciones y se revisaron sus scripts: no hay telemetría ni envío de datos. Impeccable descarga su motor de las releases oficiales de GitHub y lo verifica con sha256.

| Skill | Fuente | Versión / commit |
|---|---|---|
| `vercel-react-best-practices` | [vercel-labs/agent-skills](https://github.com/vercel-labs/agent-skills) `skills/react-best-practices` | 1.0.0 · `1a2c79d4e6c4` |
| `web-design-guidelines` | [vercel-labs/agent-skills](https://github.com/vercel-labs/agent-skills) `skills/web-design-guidelines` | 1.0.0 · `1a2c79d4e6c4` (descarga las guías de `vercel-labs/web-interface-guidelines` en cada uso) |
| `react-vite-best-practices` | [asyrafhussin/agent-skills](https://github.com/asyrafhussin/agent-skills) `skills/react-vite-best-practices` | 2.0.0 · `1aa0ff717c10` |
| `impeccable` | [pbakaus/impeccable](https://github.com/pbakaus/impeccable) `.claude/skills/impeccable` | 4.9.2 · `d41d9860b009` |
| `design-taste-frontend` | [Leonxlnx/taste-skill](https://github.com/Leonxlnx/taste-skill) `skills/taste-skill` | 2.5.1 · `f6b76575f949` |

- La skill de Vercel para React está pensada sobre todo para Next.js. En este proyecto se aplican solo las reglas de React y del bundle.
- `design-taste-frontend` está orientada a sitios y landing pages. En AviPlanner sirve para la pasada «anti-IA», no como guía de layout.
- Las reglas de las skills se usaron en las tareas 0004 (rendimiento de React y Vite) y 0003 (auditoría y crítica de diseño). Las skills ya aparecen disponibles en Claude Code.
