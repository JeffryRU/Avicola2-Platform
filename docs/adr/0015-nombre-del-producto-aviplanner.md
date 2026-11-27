# ADR 0015: el producto se llama AviPlanner

- **Estado:** aceptado
- **Fecha:** 2026-11-16

## Contexto

El producto no tenía un nombre propio. En el código se usaba el del cliente (`avicola2`, «Avícola 2») y en la app el del mockup (Noraves). Desde ahora el producto se llama **AviPlanner**. **Avícola 2 sigue siendo el cliente**, y Noraves y Grupo Rocío siguen siendo sus marcas: el selector de marca de la app las conserva.

## Decisión

Se renombra lo que nombra al **producto**:

| Dónde | Antes | Ahora |
|---|---|---|
| Web: `<title>` y manifest de la PWA | Noraves · Planificación de Demanda | AviPlanner · Planificación de Demanda |
| `frontend/package.json` | `avicola2-frontend` | `aviplanner-frontend` |
| Backend: `pyproject.toml` y título de la API (OpenAPI) | `avicola2-backend`, «Avícola 2 — Planificación de saca» | `aviplanner-backend`, «AviPlanner — Planificación de saca» |
| Plantilla de carga (hoja de ayuda) | «Plantilla de carga — Avícola 2» | «Plantilla de carga — AviPlanner» |
| Prefijo de claves en Redis | `avicola2:<APP_ENV>:` | `aviplanner:<APP_ENV>:` |
| Audiencia del JWT | `avicola2-planning` | `aviplanner-planning` (acepta también la vieja) |
| App móvil: nombre visible (Android e iOS) y `PRODUCT_NAME` de iOS | Noraves | AviPlanner |
| Mobile: `rootProject.name`, propiedades de Gradle, clase `Application` y tema | `avicola2-mobile`, `avicola.*`, `AvicolaApp`, `Theme.Avicola` | `aviplanner-mobile`, `aviplanner.*`, `AviPlannerApp`, `Theme.AviPlanner` |
| Respaldos de la base | `avicola2-AAAAMMDD-HHMM.dump` | `aviplanner-AAAAMMDD-HHMM.dump` (la limpieza borra los dos) |
| README y `architecture.md` | Avícola 2 como nombre del producto | AviPlanner |

Se **mantienen**, a propósito:

- **Menciones al cliente:** «tabla maestra de Avícola 2», `assumptions.md`, comentarios de `catalog.yaml`, `schemas.yaml` y `planning_seed.yaml`, y el generador de datos sintéticos.
- **Paquete y `applicationId` `pe.avicola2.app`** (Android) y el bundle id de iOS: si se cambian, Android lo trata como otra app y las instalaciones actuales no se actualizan.
- **Almacenamiento local de la app móvil** (`SharedPreferences` `avicola2` y `avicola2.secure`, alias del Keystore `avicola2.session`, servicio del Keychain): si se cambian, se cierran las sesiones y se pierde la cola offline.
- **IDs de los workflows de n8n** (`avicola2IngestaExcel01`, `avicola2Recordatorio02`): ya están publicados en el n8n desplegado. Sus nombres visibles (`01_ingesta_excel`, `02_recordatorio_proyeccion`) no nombraban al producto.
- **Nombre del proyecto de Compose** (`name: avicola2`): prefija los volúmenes, así que cambiarlo deja los datos en volúmenes huérfanos.
- **`/opt/avicola2`** en `bootstrap-vps.sh`, por las instalaciones que ya existen.
- **Nombres externos:** el repositorio `JeffryRU/Avicola2-Platform`, los proyectos de Vercel (`avicola2-platform*.vercel.app`) y de Coolify, los hosts `avicola*.sslip.io` y los esquemas de Supabase (`app`, `n8n`).
- **`noraves.apk`** como nombre del archivo de la release: lo enlazan la web (`releases/latest/download/noraves.apk`) y versiones ya publicadas.

## Alternativas consideradas

- **Renombrar también los identificadores persistentes** (`applicationId`, volúmenes, IDs de n8n). Se descartó: obliga a reinstalar la app, a migrar volúmenes y a reimportar workflows, sin beneficio para el usuario.
- **Cambiar la audiencia del JWT sin transición.** Se descartó porque cerraría todas las sesiones abiertas. Se aceptan las dos audiencias. La vieja se puede quitar cuando pase `AUTH_TOKEN_TTL_HOURS` desde el despliegue.

## Consecuencias

- `git grep -iE 'avicola ?2|avícola ?2'` solo devuelve menciones al cliente o identificadores listados arriba.
- Al desplegar, la caché de Redis empieza vacía con el nuevo prefijo. Las claves viejas vencen solas por TTL.
- La próxima release de la app móvil se llamará AviPlanner en el celular, sin reinstalarla.
