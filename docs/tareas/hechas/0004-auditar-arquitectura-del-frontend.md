# 0004 · Auditar a fondo la arquitectura del frontend (features, shared, clean code, screaming)

- **Área:** frontend
- **Prioridad:** alta
- **Creada:** 2026-11-16
- **Relacionada:** [ADR 0008 — Frontend por features](../../adr/0008-frontend-por-features.md)

## Contexto

El frontend **debe** organizarse por features ([ADR 0008](../../adr/0008-frontend-por-features.md)). Lo que se repite entre features va a `shared/`. Además, el código debe seguir **clean code** y una **screaming architecture**: al ver las carpetas, debe entenderse de qué trata el negocio (proyecciones, saca, stock, producción…), no qué framework se usa.

Estructura actual:

- `src/features/`: `accounts`, `auth`, `catalog`, `connection`, `dashboards`, `editing`, `history`, `home`, `notifications`, `production`, `profile`, `projections`, `saca`, `stock`, `versions`.
- `src/shared/`: `application`, `domain`, `infrastructure`, `types`, `ui`, `unit-tests`.

## Qué hay que hacer

### Organización por features y shared

- [x] Verificar que ninguna feature importe archivos internos de otra feature. Si dos features necesitan lo mismo, ese código va a `shared/`. Definir y hacer cumplir la regla con ESLint (`no-restricted-imports` o `eslint-plugin-boundaries`).
- [x] Buscar código duplicado entre features (componentes, hooks, formateadores, esquemas zod, query keys, constantes y textos) y moverlo a `shared/`.
- [x] Revisar que `shared/` no tenga lógica de una sola feature (en ese caso, devolverla a su feature).
- [x] Revisar que cada feature tenga una estructura interna consistente (por ejemplo, `domain`, `application`, `infrastructure` y `ui`, igual que `shared`) y un punto de entrada público (`index.ts`).
- [x] Revisar si los nombres de las features «gritan» el dominio. Por ejemplo: ¿`editing`, `versions`, `connection` y `home` son features de negocio o deberían ser parte de otra o de `shared`/`app`?

### Clean code

- [x] Componentes largos o con varias responsabilidades: dividirlos.
- [x] Nombres claros y en un mismo idioma (definir la convención: español para el dominio, inglés para lo técnico, o la que se decida).
- [x] Números y strings mágicos: pasarlos a constantes con nombre, con **una sola fuente de la verdad** (rutas, etiquetas, roles, estados y query keys).
- [x] Código muerto, `any`, `eslint-disable` y `TODO` olvidados.
- [x] Aplicar las reglas de las skills de React + Vite y de Vercel (re-renders innecesarios, memoización, carga diferida por ruta y tamaño del bundle).

### Resultado

- [x] Escribir el informe de la auditoría con cada hallazgo (archivo, problema y propuesta) y aplicar las correcciones en commits pequeños. (Los commits los arma quien revisa.)
- [x] Actualizar el ADR 0008 si cambian las reglas.

## Criterios de aceptación

- El lint falla si una feature importa internos de otra.
- No queda duplicación relevante entre features.
- Pasan los tests, el lint y el build. El comportamiento de la app no cambia.

## Notas

- Seguir las pruebas adversariales: una revisión independiente de los cambios y tests que cubran lo movido.

## Resultado (2026-11-16)

- Informe: [docs/frontend/auditoria-arquitectura.md](../../frontend/auditoria-arquitectura.md). ADR 0008 actualizado.
- **Fronteras:** 149 imports a archivos internos de otras features (y 3 ciclos) pasan a 0. Cada feature tiene `index.ts`; ESLint (`FEATURE_DEPS` en `eslint.config.js`) falla si una feature importa internos de otra, si depende de una no declarada, si `shared/` importa features o `app/`, o si el dominio usa en ejecución algo de otra feature. Lo prueba `src/app/unit-tests/architecture.test.ts`.
- **A `shared/`:** sesión y roles, productos y unidades, fechas de registro (`isRecentDay`), lectura de dígitos, textos comunes y del registro diario, `SummaryRow`. Feature nueva `sellers`. `editing`, `versions`, `connection` y `home` se mantienen (justificado en el informe).
- **Clean code:** `AccountsPage`, `StockPage` y `versions.tsx` divididos; rutas, claves y tiempos con nombre; sin avisos de `react-refresh` ni `eslint-disable`.
- **Pruebas:** propiedades con fast-check para la lógica común movida.
- **Pendiente:** marco común de Stock/Producción, `useCachedQuery`, dividir `NewProjectionPage` y otras pantallas largas (con la tarea de diseño), y los casos dudosos listados en el informe.
