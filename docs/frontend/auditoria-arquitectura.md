# Auditoría de arquitectura del frontend

- **Fecha:** 2026-11-16
- **Tarea:** [0004 — Auditar a fondo la arquitectura del frontend](../tareas/pendientes/0004-auditar-arquitectura-del-frontend.md)
- **Reglas que cambian:** [ADR 0008 — Frontend por features](../adr/0008-frontend-por-features.md)
- **Alcance:** `frontend/src` (`app/`, `features/*`, `shared/*`), `frontend/eslint.config.js`. El comportamiento de la app no cambia y los estilos no se tocaron.

## Resumen

- **Antes:** 149 imports de una feature a archivos internos de otra, en 56 archivos y 37 pares de features. Había tres ciclos: `dashboards ↔ editing`, `dashboards ↔ projections` y `production ↔ saca`. Ninguna feature tenía `index.ts` y ESLint no lo revisaba.
- **Después:** 0 imports internos. Las 16 features tienen `index.ts`. Quedan 85 imports entre features, todos por `@/features/<x>`, en 33 pares sin ciclos. ESLint falla si se rompe la regla (ver [Regla de fronteras](#regla-de-fronteras)).
- `shared/` ya no importaba features ni `app/`. Ahora el lint también lo impide.
- Se centralizaron 18 duplicaciones (ver [Duplicación](#duplicación)).
- Los 4 avisos de `react-refresh/only-export-components` y los 2 `eslint-disable` desaparecieron. No hay `any` ni `TODO`.
- Pruebas: de 28 archivos y 129 pruebas a 35 archivos y 168 pruebas, varias de propiedades con **fast-check**.

## Regla de fronteras

Está en `frontend/eslint.config.js` (`FEATURE_DEPS` y `featureRules`). Se arma con `no-restricted-imports` (y `no-restricted-syntax` para `import()`), sin plugins nuevos: una sola configuración por carpeta que junta la regla de la capa y la de las fronteras. Así ninguna pisa a la otra.

| Regla | Qué falla |
|---|---|
| Solo el punto de entrada | `@/features/<x>/...` desde otra feature, también con `import()`; cualquier ruta con «..» (`../`, `./../`, `@/features/x/../y`) |
| Sin auto-import | una feature importando su propio `index.ts` (riesgo de ciclos) |
| Dependencias declaradas | importar una feature que no está en `FEATURE_DEPS[<feature>]` |
| Sin ciclos | una dependencia que va después en la lista (el lint no arranca) |
| Features declaradas | una carpeta de `src/features` que no está en `FEATURE_DEPS`, o una feature declarada que ya no existe (el lint no arranca) |
| Dominio puro | en `domain/`, `types/`, `application/` o `infrastructure/`, usar de otra feature algo que no sea un tipo (`import type`) |
| `shared/` es común | `shared/` importando `@/features/*` o `@/app/*`, también con rutas relativas o `import()` |
| `app/` es la raíz | una feature importando de `app/` algo que no sea `di`, `routes` o `install` |

`src/app/unit-tests/architecture.test.ts` corre ESLint con la configuración real sobre código de ejemplo y comprueba cada regla.

## Hallazgos

Estado: **aplicado** (corregido en esta tarea) o **pendiente** (propuesta para otra tarea).

### Fronteras entre features y `shared/`

| Archivo | Problema | Propuesta | Estado |
|---|---|---|---|
| `features/auth/domain/session.ts`, `features/auth/types/roles.ts` | Sesión, roles y permisos los usaban 12 features por sus archivos internos. | Pasan a `shared/domain/session.ts` y `shared/types/roles.ts`. `auth` se queda con login, contraseña y `useSession`. El formulario de perfil pasa a `profile/domain/profile.ts`. | aplicado |
| `features/catalog/domain/schemas.ts`, `bySubcategory`, `sumUnits`, `addUnits` | Producto y unidades son el idioma de 7 features y su dominio los importaba en ejecución. | `shared/domain/products.ts` (más `productType`). `Catalog` sigue en `catalog`. | aplicado |
| `features/dashboards/ui/hooks.ts` (`useSellers`), `dashboards/application/ports.ts` | `editing`, `history` y `projections` usaban un hook de `dashboards`: dos ciclos. | Feature nueva `sellers` (puerto, adaptador y `useSellers`/`useTeamSellers`). | aplicado |
| `features/saca/types/saca.ts` (`modelLabel`) | `production` dependía de `saca` y `saca` de `production`. | `modelLabel` es del pronóstico: pasa a `production/types/forecast.ts`. | aplicado |
| `features/stock/domain/stock.ts` (`parseUnits`, `editableDays`, `isEditableDay`) | `production` usaba el dominio de `stock` para reglas que también son suyas. | `parseUnits` a `shared/domain/format.ts`. La regla «hoy y N días atrás» a `shared/domain/dates.ts` (`isRecentDay`, `recentDays`, `recentDayStrip`), igual que `check_recent_day` del backend. Cada feature tiene su `STOCK_BACK_DAYS` / `PRODUCTION_BACK_DAYS`. | aplicado |
| `features/editing/domain/editing.ts` (`dateOf`, `timeOf`) | 5 pantallas de otras features lo usaban como helper de fechas. | `shared/domain/dates.ts`. | aplicado |
| `features/projections/domain/schemas.ts` (`CONFIRMED`) | El dominio de `dashboards` lo importaba en ejecución. | `shared/types/labels.ts`, junto a `STATUS_LABEL`. | aplicado |
| `features/projections/ui/components/review-dialog.tsx` (`SummaryRow`) | `connection` importaba un componente interno de `projections`. | `shared/ui/components/summary-row.tsx`. | aplicado |
| `features/catalog/domain/defaults.ts` | Tenía respaldos que solo usa el stock (calidad B, ubicaciones, días de lote). | `stock/domain/defaults.ts`. | aplicado |
| `features/home/ui/pages/SupervisorHomePage.tsx` | Importaba una página interna de `dashboards`. | `TeamDayView` se exporta en `dashboards/index.ts`. | aplicado |
| `shared/` | Revisado: no tiene lógica de una sola feature. | — | sin cambios |

### Estructura interna y nombres

| Archivo | Problema | Propuesta | Estado |
|---|---|---|---|
| `accounts/ui/AccountsPage.tsx`, `auth/ui/*.tsx`, `notifications/ui/NotificationsPage.tsx`, `versions/ui/versions.tsx` | Pantallas sueltas en `ui/`, distinto del resto. | `ui/pages/` (PascalCase), `ui/components/` (kebab-case) y `ui/hooks.ts`. `auth/ui/use-session.ts` se une a `hooks.ts`. | aplicado |
| `features/*/index.ts` | No existían. | Uno por feature: exporta solo lo que usan otras features y los puertos (tipos) que une `app/container.ts`. Las pantallas no se exportan para no romper la carga diferida. | aplicado |
| `editing` | ¿Es negocio? | Sí: horario de corte y habilitaciones. La usan `projections`, `dashboards` y `accounts`. Se mantiene. Un nombre más claro sería `edit-window`, pero no compensa el cambio. | sin cambios |
| `versions` | ¿Es negocio? | No: es el selector de versiones del producto. Tiene su puerto, adaptador y pruebas, así que se queda como feature y no va a `app/`. Ninguna feature de negocio depende de ella, solo `profile`. | sin cambios |
| `connection` | ¿Es negocio? | Es técnica (estado del servidor y de la cola), pero es una pantalla completa con su puerto. Se mantiene. | sin cambios |
| `home` | ¿Es negocio? | Es la pantalla que junta varias features. Se mantiene arriba de todo: nadie depende de ella. | sin cambios |
| Idioma | Sin convención escrita. | Código en inglés (igual que backend y API), términos sin traducción en español (`saca`), textos, URL y comentarios en español. Queda en el ADR 0008. | aplicado |

### Duplicación

| Archivo | Problema | Propuesta | Estado |
|---|---|---|---|
| `stock/types/stock.ts`, `production/types/production.ts` | 13 textos iguales (Hoy, Ayer, Guardar corrección, Sin registro, Últimos registros, `HISTORY_DAYS`…). El «7» y el «30» estaban escritos dentro del texto. | `shared/types/daily-record.ts`. Las features los reexportan. El aviso de solo lectura se arma con `readOnlyDayLabel(STOCK_BACK_DAYS)` / `readOnlyDayLabel(PRODUCTION_BACK_DAYS)` en cada pantalla. | aplicado |
| `StockPage.tsx`, `ProductionPage.tsx` | La tira de días, su leyenda (Hoy/Ayer) y el título del día estaban copiados. El título usaba `dShort(day).split(' ')[1]`. | `recentDayStrip`, `relativeDay` y `dDowLongDM` en `shared/domain/dates.ts`. | aplicado |
| `shared/domain/format.ts` (`parseCell`), `stock/domain/stock.ts` (`parseUnits`) y 3 `onChange` | El mismo lector de dígitos, con límites distintos, y `replace(/\D/g, '').slice(0, 7)` repetido. | `keepDigits` y `parseDigits` comunes. `parseCell` (4 dígitos) y `parseUnits` (7 dígitos, tope 1 000 000) los usan con constantes con nombre. | aplicado |
| `round2` en 3 archivos | Copiado. | `shared/domain/format.ts`. | aplicado |
| `toggleIn` y 3 copias en línea | Marcar o desmarcar en una lista, copiado. | `toggleIn` genérico en `shared/domain/format.ts`. | aplicado |
| `subcategory ?? category` en 4 lugares | El «tipo» de un producto, copiado. | `productType` en `shared/domain/products.ts`. | aplicado |
| `(useSellers().data ?? []).filter((s) => !isSupervisor(s))` ×4 | Copiado. | `sellersOnly` (dominio) y `useTeamSellers` (hook). | aplicado |
| «Cancelar», «Guardar», «Reintentar», «Cerrar sesión», «Todos los vendedores» | Escritos en 3 `types/` y en 8 pantallas. | `shared/types/labels.ts`. | aplicado |
| «Confirmada», «Sincronizada», «Por sincronizar» en exportaciones y leyendas | Repetían `STATUS_LABEL`. | Usan `STATUS_LABEL`. | aplicado |
| `${nf1(x)} kg`, `${nf0(x)} unid.`, `<CountUp /> unid.` en 10 pantallas | Repetían `kgAmount`, `unitsCount` y `UNITS_SHORT`. | Usan los de `shared/types/labels.ts`. | aplicado |
| `formatTime(hhmm(x))` en 7 pantallas | Copiado. | `clockTime` en `shared/domain/dates.ts`. | aplicado |
| `charts.tsx` (`fmt0`, número de `CountUp`) | Repetían `nf0` y `nf1`. | Usan `nf0` y `nf1`. | aplicado |
| `profileSchema`, `unlockRequestSchema` | La misma limpieza de espacios. | `collapseSpaces` en `shared/domain/format.ts`. | aplicado |
| `staleTime: 10 * 60_000` ×3, `86_400_000` en `install.tsx` | Números mágicos repetidos. | `REFERENCE_DATA_STALE_MS` (`query-keys.ts`) y `DAY_MS` (`dates.ts`). | aplicado |
| `versions/ui/hooks.ts` | Claves de consulta escritas a mano. | `queryKeys.versions` en `shared/application/query-keys.ts`. | aplicado |
| `App.tsx`, `AppShell.tsx`, `StockPage.tsx` | Rutas escritas a mano (`/dashboards/dia/:date`, `/proyecciones/:date`, `startsWith('/dashboards')`, `back='/'`). | `routePatterns` y `paths.dashboards` en `app/routes.ts`. `paths` arma las URL con las mismas bases. | aplicado |
| `AppShell.tsx` | Los nombres del menú repetían los títulos de 6 pantallas. | Usa `STOCK_TITLE`, `PRODUCTION_TITLE`, `FORECAST_NAV_LABEL`, `SACA_TITLE`, `UNLOCKS_TITLE` y `MY_REQUESTS_*` del `index.ts` de cada feature. | aplicado |
| `App.tsx` | `'nv_brand'` dos veces y la lista de marcas escrita a mano. | `BRAND_KEY`, `BRAND_IDS` y `DEFAULT_BRAND` (`shared/types/brands.ts`). | aplicado |
| `ProfilePage.tsx` | Repite los títulos de Habilitaciones, Saca, Stock e Historial. | Una lista de navegación común para el menú y el perfil. Hoy `profile` tendría que depender de 4 features más. | pendiente |
| `StockPage` / `ProductionPage` (`Summary`, `History`, botón guardar) | El mismo marco de pantalla con otro contenido. | Un componente `DailyRecordLayout` en `shared/ui`. Es un cambio de pantalla: conviene hacerlo con la tarea de diseño. | pendiente |
| `useCatalog`, `useStockOptions` | El mismo patrón: consulta, guardar en el equipo y respaldo. | Un hook `useCachedQuery` en `shared/ui/hooks`. | pendiente |
| `ALL = 'ALL'` (stock) y `ALL = 'all'` (dashboards) | Dos centinelas con distinto valor. El de dashboards va en la URL. | No se unen: cambiarían URL guardadas o lo guardado en el equipo. | pendiente (dudoso) |
| `accounts/domain/accounts.ts` (nombre de cuenta nueva) | Usa `trim()` y no junta espacios internos, a diferencia del perfil. | Usar `collapseSpaces`. Cambia lo que se guarda: confirmar antes con negocio. | pendiente (dudoso) |
| `isSupervisor` (por rol) y `hasTeamView` (por permiso) | Dos ideas parecidas. Filtros y pantallas usan `isSupervisor`. | Revisar caso por caso si debe ser por permiso. Cambiaría lo que ve el jefe de despacho. | pendiente (dudoso) |
| `saca/types/saca.ts` | `n.toLocaleString('es-PE')` sin redondear, distinto de `nf0`. | Usar `nf0` si los valores son siempre enteros. | pendiente |
| Hora en DayDetailPage, notificaciones y versiones | Formatos de hora distintos (24 h frente a a. m./p. m.). | Unificar con `clockTime`. Cambia lo que se ve. | pendiente |

### Clean code

| Archivo | Problema | Propuesta | Estado |
|---|---|---|---|
| `accounts/ui/AccountsPage.tsx` (511 líneas) | Seis componentes y llamadas a `useQuery`/`useMutation` en la pantalla. | 5 archivos en `ui/components/` y los hooks en `accounts/ui/hooks.ts`. La pantalla queda en 86 líneas. | aplicado |
| `stock/ui/pages/StockPage.tsx` (653 líneas) | Filtros, cuadrícula, resumen e historial en un archivo. | `ui/components/stock-{filters,grid,summary,history}.tsx`. La pantalla queda en 188 líneas. | aplicado |
| `versions/ui/versions.tsx` (444 líneas) | Proveedor, aviso y panel juntos. | `versions.tsx`, `version-panel.tsx` y `version-style.ts`. | aplicado |
| `projections/ui/pages/NewProjectionPage.tsx` | Lógica pura dentro de la pantalla (`normalize`, `withNewSheets`). | Pasa al dominio (`normalizeDraft`, `withNewSheets`) con pruebas. | aplicado |
| `NewProjectionPage.tsx` (componente de ~400 líneas), `ProductionPage.tsx`, `SacaPage.tsx`, `ForecastPage.tsx` | Siguen largos. | Dividir por pasos o secciones junto con la tarea de diseño, para no tocar dos veces las mismas pantallas. | pendiente |
| `App.tsx` | 24 `lazy(() => import().then(...))` copiados; tres árboles de rutas con las mismas 6 rutas de cuenta; tiempos del splash y de la cola sin nombre. | `page()` para la carga diferida, `TeamRoutes`/`DispatchRoutes`/`SellerRoutes` con `accountRoutes` común, y constantes con nombre. | aplicado |
| `stock/ui/pages/StockPage.tsx` | Leía y escribía `globalThis.localStorage` sin pasar por el puerto (la regla de ESLint no lo veía). | `useStockView` usa `preferences` (`KeyValueStore`), con la misma clave y el mismo formato. | aplicado |
| `ProductionPage.tsx`, `ForecastPage.tsx` | Imports en medio del archivo. | Arriba, con los demás. | aplicado |
| `connection/ui/pages/ConnectionPage.tsx` | `useQueryClient` en la pantalla. | `useReloadAll` en `connection/ui/hooks.ts`. | aplicado |
| `stock/domain/stock.ts` | El 8 (lotes) y el 3 (días por defecto) repetidos. | `MAX_LOT_AGE` y `DEFAULT_LOT_DAYS`. | aplicado |
| `react-refresh/only-export-components` (4 avisos) y 2 `eslint-disable` | Archivos de componentes que también exportaban hooks o constantes. | `useDashboardFilters` → `dashboards/ui/hooks.ts`; `tableCls` → `shared/ui/lib/table-styles.ts`; `useTooltip` → `shared/ui/hooks/use-tooltip.tsx`; `useBrand` → `shared/ui/hooks/use-brand.ts`; `BRANDS` → `shared/types/brands.ts`; `app/di.tsx` → `app/di.ts` (sin componente: `App` usa `<ContainerContext value>`). | aplicado |
| Código muerto | `EDITING_COLUMN_LABEL`, `FILTERS_TITLE` y `weekdayIndex` no se usaban. | Borrados. | aplicado |
| `any`, `TODO` | No hay. | — | sin cambios |

### Rendimiento (skills de React + Vite y Vercel)

| Regla | Situación | Estado |
|---|---|---|
| Carga diferida por ruta | Ya estaba: cada pantalla es un chunk. `index.ts` no exporta pantallas para no romperlo. | sin cambios |
| Barrel files (`bundle-barrel-imports`) | Los `index.ts` solo reexportan y no incluyen pantallas. El chunk de entrada bajó de 459,0 kB (146,5 kB gzip) a 431,2 kB (141,3 kB gzip); el total precacheado casi no cambia (1901 → 1904 KiB). Ojo: el reparto en chunks de rolldown es sensible. Probé importar directo los archivos internos desde `AppShell` y `"sideEffects"` en `package.json`, y en los dos casos el chunk de entrada subió a ~463 kB, así que se dejó con `index.ts`. Los títulos del menú (single source) cuestan ~7 kB en el chunk de entrada. | aplicado |
| Bibliotecas pesadas a demanda | `jspdf` y `write-excel-file` ya se cargan con `import()` al exportar. | sin cambios |
| Re-renders | No se encontraron problemas medibles. `useTeamSellers` filtra en cada render como antes. | sin cambios |
| Chunks vacíos de los `index.ts` | El build genera chunks de 20 bytes para algunos `index.ts` (por ejemplo `auth`, `catalog`). | pendiente: revisar con `build.rolldownOptions` si molestan |

## Revisión independiente

Otro agente revisó el cambio sin ver mi razonamiento. Comparó todos los textos, números, claves de almacenamiento, claves de consulta y rutas por rol entre `HEAD` y el árbol nuevo, y no encontró cambios de comportamiento. Lo que señaló y cómo quedó:

- Huecos en la regla: rutas `./../`, `@/features/x/../y`, `import()` dinámico y rutas relativas desde `shared/`. **Corregido** y probado en `architecture.test.ts`.
- Pruebas que comparaban un valor consigo mismo (reexportes, `roleName` contra su propia tabla, constantes del módulo como oráculo, la vista del stock reimplementada en la prueba). **Corregido**: ahora comparan con literales y la prueba del stock usa `readStockView`, la misma función que usa el hook.
- `types/` de stock y producción importaban su `domain/` para armar un texto. **Corregido**: la pantalla arma `readOnlyDayLabel(STOCK_BACK_DAYS)`.
- Las rutas por rol de `App.tsx` no tienen prueba automática (se revisaron a mano). **Pendiente**: una prueba de render por rol necesita `@testing-library/react`, que hoy no está.
- Si el rol cambia en medio de la sesión (otra cuenta en otra pestaña), `AppShell` ahora se vuelve a montar porque cada rol tiene su componente de rutas. El caché ya se vacía en ese caso; se acepta.

## Pruebas agregadas

- `app/unit-tests/architecture.test.ts`: la regla de fronteras con la configuración real de ESLint (imports internos, «..», `import()`, auto-import, dependencias no declaradas, dominio puro, `shared/` y `app/`).
- `app/unit-tests/routes.test.ts`: las URL no cambian y `routePatterns` reconoce lo que arma `paths` (propiedad con fechas al azar).
- `app/unit-tests/vocabulary.test.ts`: los textos que antes se repetían salen iguales de `shared/types`.
- `shared/unit-tests/format.test.ts`: `keepDigits`, `parseDigits`, `parseCell`, `parseUnits`, `collapseSpaces`, `round2` y `toggleIn` con propiedades. El oráculo filtra los dígitos carácter por carácter, sin usar la expresión regular del código.
- `shared/unit-tests/dates.test.ts`: `isRecentDay`, `recentDays` y `recentDayStrip` con propiedades (la regla «hoy y N días atrás» escrita desde el backend), más `dateOf`, `timeOf`, `clockTime`, `dDowLongDM` y `relativeDay`.
- `shared/unit-tests/products.test.ts`: `addUnits`/`sumUnits` (suma por producto y total) y `bySubcategory` (no pierde ni reordena) con propiedades.
- `shared/unit-tests/session.test.ts` (antes `auth/unit-tests/roles.test.ts`), más `sellersOnly` y `roleName`.
- `profile/unit-tests/profile.test.ts`, la vista del stock (`readStockView` con `BrowserStore`, misma clave `stock.view`), `PRODUCTION_BACK_DAYS` y `normalizeDraft`.

## Cómo verificar

Desde `frontend/` (Node con Docker):

```bash
docker run --rm -v "$PWD":/app -w /app node:24-slim sh -c \
  'corepack enable >/dev/null 2>&1; pnpm install --frozen-lockfile >/dev/null 2>&1; pnpm lint && pnpm test && pnpm build'
```

`pnpm build` ya corre `tsc -b`.
