# ADR 0008 — Frontend por features (screaming) y vocabulario en una sola fuente

- **Estado:** aceptado (reemplaza la estructura de carpetas del frontend de la [0004](0004-arquitectura-hexagonal-y-base-de-datos-intercambiable.md); sus reglas de capas siguen vigentes)
- **Fecha:** 2026-11-03

## Contexto

- Casi todo el frontend de la app de vendedores vivía en un módulo, `modules/planning`: catálogo, registro de proyecciones, dashboards, inicio, perfil y conexión.
- Al agregar los tamaños de brasa (chica, mediana y grande), cada pantalla armaba por su cuenta el nombre de la categoría. Por eso la confirmación decía «BRASA» mientras Registrar decía «Brasa chica». Lo mismo pasaba con «día/días», «unid.», «kg (aprox.)», «kg/unidad» y los nombres de estados y roles.
- Se pidió una estructura que muestre el negocio («screaming»), con carpetas de pruebas unitarias y de tipos en cada feature, y una carpeta para lo compartido.

## Decisión

```
frontend/src/
├── app/                raíz de composición (container.ts), rutas y estructura
├── features/           una carpeta por parte del negocio
│   ├── auth/           inicio de sesión, sesión y cambio de contraseña
│   ├── accounts/       administración de cuentas (supervisor)
│   ├── catalog/        productos, categorías y tamaños (pantalla Productos)
│   ├── projections/    Registrar, confirmar, Mis proyecciones, detalle del día, cola offline
│   ├── dashboards/     resumen semanal, proyección vs. venta real, estado por día
│   ├── home/           Inicio
│   ├── profile/        Perfil
│   ├── connection/     estado de la base de datos
│   └── notifications/
│       ├── domain/          TypeScript puro: reglas y contratos (zod)
│       ├── application/     puertos y casos de uso
│       ├── infrastructure/  adaptadores (HTTP, almacenamiento)
│       ├── ui/              pages, components y hooks
│       ├── types/           vocabulario: tipos, nombres y textos de la feature
│       └── unit-tests/      pruebas unitarias (Vitest)
└── shared/             lo común a varias features (antes core/ y ui/)
    ├── domain/         fechas, formatos, contratos comunes, exportación de tablas
    ├── application/    puertos comunes (HTTP, almacenamiento, exportador) y ErrorReporter
    ├── infrastructure/ cliente HTTP, almacenamiento del navegador, exportador
    ├── ui/             shadcn/ui, layout, gráficos, marca, Segmented, ExportMenu
    ├── types/          textos comunes: estados, «día/días», «unid.», kg
    └── unit-tests/
```

- **Capas hexagonales dentro de cada feature**, igual que en la 0004. ESLint las impone (`eslint.config.js`): `types/` no importa React ni otras capas, el dominio no importa React y la UI no importa adaptadores.
- **Un puerto por feature:** `CatalogGateway`, `ProjectionsGateway` (proyecciones, venta real, sugerencias y envío), `SellersGateway` y `StatusGateway` reemplazan al antiguo `PlanningGateway`. Solo `app/container.ts` los une con sus adaptadores.
- **Dependencias entre features en una sola dirección:** `projections` usa `catalog`; `dashboards` y `home` usan `projections` y `catalog`. `catalog` no depende de ninguna. Lo que necesitan varias va a `shared/`.
- **Vocabulario en una sola fuente:**
  - La selección de productos (`ProductSelection`: categoría + tamaño) y sus nombres están en `features/catalog/types/catalog.ts`. `Catalog` los expone: `label`, `detailedLabel`, `dayLabel`, `selected`, `pick` y `others`. Ninguna pantalla arma nombres de categoría ni filtra unidades por su cuenta.
  - Los textos comunes (estados, «día/días», «unid.», kg) están en `shared/types/labels.ts`. Los roles están en `features/auth/types/roles.ts` y los estados de cuenta en `features/accounts/types/accounts.ts`.
- **Pruebas:** se sigue con **Vitest**. Tiene la misma API que Jest (`describe`, `it`, `expect`) y ya está integrado con Vite (alias `@/`, ESM). Cada feature con lógica propia tiene su `unit-tests/`. `home` y `profile` son solo pantallas y por ahora no tienen.

## Alternativas consideradas

- **Mantener `modules/planning` y solo renombrar carpetas:** no resuelve que una feature mezcle seis pantallas ni que los nombres se repitan.
- **Jest:** obliga a configurar Babel o ts-jest para ESM y los alias de Vite, y no aporta nada sobre Vitest.
- **Carpetas por tipo de archivo (`components/`, `pages/`, `hooks/` en la raíz):** es lo opuesto a «screaming», porque no se ve el negocio.
- **Textos con i18n (por ejemplo, i18next):** la interfaz es solo en español. Un módulo de textos tipado basta y no agrega dependencias.

## Consecuencias

- Las rutas de import cambian (`@/modules/...`, `@/core/...` y `@/ui/...` pasan a `@/features/...` y `@/shared/...`). Se movieron con `git mv`, así que el historial se conserva.
- Para un nombre nuevo (un estado, una categoría con otra forma de agruparse), se agrega en el `types/` que corresponda y las pantallas lo consumen desde ahí.
- `components.json` (shadcn) y `.prettierignore` apuntan a `src/shared/ui/...`.
