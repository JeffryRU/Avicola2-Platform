# 0001 · Renombrar el proyecto a AviPlanner (solo en código)

- **Área:** backend · frontend · mobile · n8n · deploy · docs
- **Prioridad:** alta (conviene hacerla antes que las demás, para no renombrar dos veces)
- **Creada:** 2026-11-16

## Contexto

El producto pasa a llamarse **AviPlanner**. Se renombra en el código y la documentación, pero **no el repositorio de GitHub** (`JeffryRU/Avicola2-Platform`).

**Ojo:** Avícola 2 sigue siendo **el cliente**. Las menciones a la empresa no cambian, por ejemplo: «tabla maestra de Avícola 2», «pedido del supervisor de Avícola 2» o la integración con ARIS. Solo cambia el nombre del **producto**.

Hoy el nombre aparece en unos 85 archivos. La mayoría están en `mobile/shared` (49). El resto, en `backend/app`, `backend/config`, `n8n/workflows`, `frontend` (`package.json`, `public/`, `vercel.json`, `src/`), `deploy/`, `docker-compose.yml`, `README.md` y `docs/`.

## Qué hay que hacer

- [ ] Listar todas las apariciones (`avicola2`, `Avicola2`, `avícola 2`, `AVICOLA2_*`…) y clasificarlas en **producto** (se renombra) o **cliente** (se queda).
- [ ] Frontend: `package.json` (`avicola2-frontend` → `aviplanner-frontend`), `<title>`, manifest/PWA, textos de UI y claves de `localStorage` (con migración o limpieza de las claves viejas).
- [ ] Backend: `pyproject.toml`, título de la API (OpenAPI), nombre del logger y variables de entorno con prefijo (manteniendo compatibilidad con las viejas durante la transición, si existen).
- [ ] Mobile (KMP): nombre visible de la app, `settings.gradle.kts` y `gradle.properties`. **Decidir aparte** si se cambia el paquete `pe.avicola2.app` y el `applicationId`: en Android, cambiar el `applicationId` crea **otra app** (las instalaciones actuales no se actualizan).
- [ ] n8n: nombres de los workflows. Los IDs (`avicola2IngestaExcel01`, `avicola2Recordatorio02`) están publicados en el n8n desplegado. Si se cambian, hay que actualizar también los comandos del README y reimportar.
- [ ] Deploy: `compose.prod.yml`, `production.env.example` y `bootstrap-vps.sh`. **No** renombrar los proyectos de Coolify, los esquemas de Supabase (`app`, `n8n`) ni los volúmenes sin un plan de migración.
- [ ] Docs: `README.md`, `architecture.md`, `deploy.md`, `assumptions.md` y los ADR (solo donde se nombra el producto).
- [ ] Registrar el cambio de nombre en un ADR corto.

## Criterios de aceptación

- `grep -riE 'avicola ?2|avícola ?2'` solo devuelve menciones al cliente o identificadores que se decidió mantener (y están listados en el ADR).
- Pasan los tests, el lint y el build de backend, frontend y mobile.
- El despliegue de `develop` en Coolify sigue funcionando.

## Notas

- Usar `git mv` para renombrar archivos y así conservar el historial.
