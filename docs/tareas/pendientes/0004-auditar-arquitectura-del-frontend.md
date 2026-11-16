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

- [ ] Verificar que ninguna feature importe archivos internos de otra feature. Si dos features necesitan lo mismo, ese código va a `shared/`. Definir y hacer cumplir la regla con ESLint (`no-restricted-imports` o `eslint-plugin-boundaries`).
- [ ] Buscar código duplicado entre features (componentes, hooks, formateadores, esquemas zod, query keys, constantes y textos) y moverlo a `shared/`.
- [ ] Revisar que `shared/` no tenga lógica de una sola feature (en ese caso, devolverla a su feature).
- [ ] Revisar que cada feature tenga una estructura interna consistente (por ejemplo, `domain`, `application`, `infrastructure` y `ui`, igual que `shared`) y un punto de entrada público (`index.ts`).
- [ ] Revisar si los nombres de las features «gritan» el dominio. Por ejemplo: ¿`editing`, `versions`, `connection` y `home` son features de negocio o deberían ser parte de otra o de `shared`/`app`?

### Clean code

- [ ] Componentes largos o con varias responsabilidades: dividirlos.
- [ ] Nombres claros y en un mismo idioma (definir la convención: español para el dominio, inglés para lo técnico, o la que se decida).
- [ ] Números y strings mágicos: pasarlos a constantes con nombre, con **una sola fuente de la verdad** (rutas, etiquetas, roles, estados y query keys).
- [ ] Código muerto, `any`, `eslint-disable` y `TODO` olvidados.
- [ ] Aplicar las reglas de las skills de React + Vite y de Vercel (re-renders innecesarios, memoización, carga diferida por ruta y tamaño del bundle).

### Resultado

- [ ] Escribir el informe de la auditoría con cada hallazgo (archivo, problema y propuesta) y aplicar las correcciones en commits pequeños.
- [ ] Actualizar el ADR 0008 si cambian las reglas.

## Criterios de aceptación

- El lint falla si una feature importa internos de otra.
- No queda duplicación relevante entre features.
- Pasan los tests, el lint y el build. El comportamiento de la app no cambia.

## Notas

- Seguir las pruebas adversariales: una revisión independiente de los cambios y tests que cubran lo movido.
