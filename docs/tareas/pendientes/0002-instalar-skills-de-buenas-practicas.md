# 0002 · Instalar skills de buenas prácticas (Vercel, React + Vite, diseño)

- **Área:** frontend · tooling
- **Prioridad:** alta (las tareas 0003 y 0004 dependen de esta)
- **Creada:** 2026-11-16

## Contexto

Antes de auditar y rediseñar el frontend, conviene que Claude Code tenga skills con criterios de calidad y de diseño, en lugar de depender solo de su criterio por defecto. El frontend se despliega en Vercel ([ADR 0007](../../adr/0007-frontend-en-vercel-con-proxy-api.md)) y usa React 19, Vite, Tailwind 4, Radix y TanStack Query.

## Qué hay que hacer

- [ ] Buscar y verificar la fuente oficial de cada skill antes de instalarla (repositorio, autor y qué instrucciones o scripts trae):
  - Buenas prácticas de **Vercel**: `vercel-labs/agent-skills` (React best practices y web design guidelines).
  - Buenas prácticas de **React + Vite** (rendimiento, hooks, code splitting, React 19).
  - **Diseño:** *taste* (frontend taste) e **impeccable** (auditoría, crítica y pulido de UI).
- [ ] Decidir dónde se instalan: en el usuario (`~/.claude/skills`) o en el proyecto (`.claude/skills`). Hoy `.claude/` está en `.gitignore` como configuración solo local.
- [ ] Revisar el contenido de cada skill: no ejecutar scripts sin leerlos.
- [ ] Anotar en esta tarea qué skills quedaron instaladas, con su versión o commit.

## Criterios de aceptación

- Las skills aparecen disponibles en Claude Code y se probó al menos una invocación de cada una sobre el frontend.

## Notas

- Las skills que se instalen y su versión quedan registradas aquí.
