# ADR 0008 — Frontend por features (screaming) y vocabulario en una sola fuente

- **Estado:** aceptado (reemplaza la estructura de carpetas del frontend de la [0004](0004-arquitectura-hexagonal-y-base-de-datos-intercambiable.md); sus reglas de capas siguen vigentes)
- **Fecha:** 2026-11-03 (actualizado el 2026-11-16 con la [tarea 0004](../tareas/pendientes/0004-auditar-arquitectura-del-frontend.md): fronteras con ESLint, `index.ts` por feature y más vocabulario en `shared/`)

## Contexto

- Casi todo el frontend de la app de vendedores vivía en un módulo, `modules/planning`: catálogo, registro de proyecciones, dashboards, inicio, perfil y conexión.
- Al agregar los tamaños de brasa (chica, mediana y grande), cada pantalla armaba por su cuenta el nombre de la categoría. Por eso la confirmación decía «BRASA» mientras Registrar decía «Brasa chica». Lo mismo pasaba con «día/días», «unid.», «kg (aprox.)», «kg/unidad» y los nombres de estados y roles.
- Se pidió una estructura que muestre el negocio («screaming»), con carpetas de pruebas unitarias y de tipos en cada feature, y una carpeta para lo compartido.

## Decisión

```
frontend/src/
├── app/                raíz de composición (container.ts), rutas y estructura
├── features/           una carpeta por parte del negocio
│   ├── auth/           inicio de sesión, cambio de contraseña y ciclo de la sesión (useSession)
│   ├── accounts/       administración de cuentas (supervisor)
│   ├── catalog/        catálogo: selección de productos y sus nombres (pantalla Productos)
│   ├── sellers/        vendedores visibles para la sesión (filtros, Historial, Habilitaciones)
│   ├── editing/        horario de corte y habilitaciones para editar días cerrados
│   ├── projections/    Registrar, confirmar, Mis proyecciones, detalle del día, cola offline
│   ├── dashboards/     resumen semanal, proyección vs. venta real, estado por día
│   ├── history/        historial de cambios
│   ├── stock/          stock de despacho
│   ├── production/     producción diaria y pronóstico de llegada
│   ├── saca/           cálculo de saca
│   ├── home/           Inicio
│   ├── profile/        Perfil
│   ├── connection/     estado de la conexión y de la cola offline
│   ├── versions/       selector de versiones (MVP 1, MVP 2…)
│   └── notifications/
│       ├── index.ts         punto de entrada público: lo único que importan otras features
│       ├── domain/          TypeScript puro: reglas y contratos (zod)
│       ├── application/     puertos y casos de uso
│       ├── infrastructure/  adaptadores (HTTP, almacenamiento)
│       ├── ui/              pages/ (pantallas), components/ y hooks.ts
│       ├── types/           vocabulario: tipos, nombres y textos de la feature
│       └── unit-tests/      pruebas unitarias (Vitest)
└── shared/             lo común a varias features (antes core/ y ui/)
    ├── domain/         fechas, formatos, sesión y roles, productos y unidades, exportación de tablas
    ├── application/    puertos comunes (HTTP, almacenamiento, exportador), ErrorReporter y query keys
    ├── infrastructure/ cliente HTTP, almacenamiento del navegador, exportador
    ├── ui/             shadcn/ui, layout, gráficos, marca, Segmented, ExportMenu, SummaryRow
    ├── types/          textos comunes: estados, acciones, «día/días», «unid.», kg, roles, marcas, registro diario
    └── unit-tests/
```

- **Capas hexagonales dentro de cada feature**, igual que en la 0004. ESLint las impone (`eslint.config.js`): `types/` no importa React ni otras capas, el dominio no importa React y la UI no importa adaptadores.
- **Un puerto por feature:** `CatalogGateway`, `ProjectionsGateway` (proyecciones, venta real, sugerencias y envío), `SellersGateway` y `StatusGateway` reemplazan al antiguo `PlanningGateway`. Solo `app/container.ts` los une con sus adaptadores.
- **Fronteras entre features (desde la tarea 0004), impuestas por ESLint** (`FEATURE_DEPS` en `eslint.config.js`; las prueba `src/app/unit-tests/architecture.test.ts`):
  - Otra feature se importa **solo por su punto de entrada**: `@/features/<x>` (su `index.ts`). Nunca `@/features/<x>/domain/...` ni rutas relativas hacia arriba (`../`).
  - Cada feature declara de cuáles depende. La lista está ordenada: una feature solo puede depender de las que van antes, así que no hay ciclos. Una carpeta nueva en `src/features` que no esté en `FEATURE_DEPS` hace fallar el lint.

    | Feature | Puede usar |
    |---|---|
    | `auth`, `catalog`, `sellers`, `versions` | ninguna |
    | `notifications` | `auth` |
    | `editing` | `auth`, `sellers` |
    | `projections` | `auth`, `catalog`, `editing`, `sellers` |
    | `connection` | `auth`, `projections` |
    | `dashboards` | `auth`, `catalog`, `editing`, `projections`, `sellers` |
    | `history` | `auth`, `catalog`, `sellers` |
    | `production`, `stock` | `auth`, `catalog` |
    | `saca` | `auth`, `catalog`, `production` |
    | `accounts` | `auth`, `editing` |
    | `profile` | `auth`, `versions` |
    | `home` | `auth`, `catalog`, `dashboards`, `editing`, `notifications`, `projections` |

  - En `domain/`, `types/`, `application/` e `infrastructure/`, de otra feature **solo se usan tipos** (`import type`). El `index.ts` también exporta hooks y componentes (React); lo que se ejecuta en varias features va a `shared/` para que el dominio siga siendo TypeScript puro.
  - `shared/` no importa nada de `features/` ni de `app/`.
  - De `app/`, una feature solo usa `@/app/di` (contenedor), `@/app/routes` (rutas) y `@/app/install` (instalar la PWA).
  - `app/` es la raíz de composición: puede importar adaptadores (`infrastructure/`), casos de uso (`application/`) y pantallas (`ui/pages/`, con carga diferida). El resto lo toma del `index.ts`.
  - Las pantallas no se exportan en `index.ts`: así cada una sigue en su propio chunk y el celular descarga solo lo que abre.
- **Vocabulario en una sola fuente:**
  - La selección de productos (`ProductSelection`: categoría + tamaño) y sus nombres están en `features/catalog/types/catalog.ts`. `Catalog` los expone: `label`, `detailedLabel`, `dayLabel`, `selected`, `pick` y `others`. Ninguna pantalla arma nombres de categoría ni filtra unidades por su cuenta.
  - Los textos comunes (estados, acciones como «Cancelar», «día/días», «unid.», kg, días relativos) están en `shared/types/labels.ts`. Los del registro diario (stock y producción) en `shared/types/daily-record.ts`. Los roles en `shared/types/roles.ts`, las marcas en `shared/types/brands.ts` y los estados de cuenta en `features/accounts/types/accounts.ts`. Una feature que usa un texto común lo reexporta desde su `types/`; no lo vuelve a escribir.
  - La sesión, los roles y los permisos (`Seller`, `Session`, `can`, `hasTeamView`) están en `shared/domain/session.ts`: los usan casi todas las features. `features/auth` se queda con el inicio de sesión, la contraseña y `useSession`.
  - Productos y unidades (`Product`, `Units`, `sumUnits`, `addUnits`, `bySubcategory`, `productType`) están en `shared/domain/products.ts`. `Catalog` (selección y nombres) sigue en `features/catalog`.
  - Las rutas salen de `app/routes.ts` (`paths` y `routePatterns`) y las claves de TanStack Query de `shared/application/query-keys.ts`. Nadie escribe una URL ni una clave a mano.
- **Idioma (convención):** el código (carpetas, archivos, variables, tipos) va en inglés, igual que el backend y la API (`seller`, `projection`, `stock`). Los términos del negocio sin traducción clara se quedan en español (`saca`). Lo que ve el usuario (textos y URL) y los comentarios van en español. Los textos nunca se escriben sueltos en una pantalla si se repiten: van al `types/` que corresponda.
- **Estructura de la UI de cada feature:** `ui/pages/` (pantallas, en PascalCase), `ui/components/` (piezas, en kebab-case) y `ui/hooks.ts` (consultas y mutaciones; ningún componente llama a `useQuery`/`useMutation` directo).
- **Pruebas:** se sigue con **Vitest**. Tiene la misma API que Jest (`describe`, `it`, `expect`) y ya está integrado con Vite (alias `@/`, ESM). Cada feature con lógica propia tiene su `unit-tests/`. La lógica pura común (`shared/domain`) se prueba también con propiedades (**fast-check**), con un oráculo escrito desde la regla y no desde el código. `home` es solo pantallas y por ahora no tiene.

## Alternativas consideradas

- **Mantener `modules/planning` y solo renombrar carpetas:** no resuelve que una feature mezcle seis pantallas ni que los nombres se repitan.
- **Jest:** obliga a configurar Babel o ts-jest para ESM y los alias de Vite, y no aporta nada sobre Vitest.
- **Carpetas por tipo de archivo (`components/`, `pages/`, `hooks/` en la raíz):** es lo opuesto a «screaming», porque no se ve el negocio.
- **Textos con i18n (por ejemplo, i18next):** la interfaz es solo en español. Un módulo de textos tipado basta y no agrega dependencias.

## Consecuencias

- Las rutas de import cambian (`@/modules/...`, `@/core/...` y `@/ui/...` pasan a `@/features/...` y `@/shared/...`). Se movieron con `git mv`, así que el historial se conserva.
- Para un nombre nuevo (un estado, una categoría con otra forma de agruparse), se agrega en el `types/` que corresponda y las pantallas lo consumen desde ahí.
- `components.json` (shadcn) y `.prettierignore` apuntan a `src/shared/ui/...`.
- Desde la tarea 0004, mover algo entre features o a `shared/` se hace con su `index.ts` en mente: si otra feature lo necesita, se exporta ahí; si lo necesitan varias y se ejecuta en el dominio, va a `shared/`. El detalle de la auditoría está en [docs/frontend/auditoria-arquitectura.md](../frontend/auditoria-arquitectura.md).
