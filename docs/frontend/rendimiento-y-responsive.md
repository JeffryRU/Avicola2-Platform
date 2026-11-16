# Rendimiento y responsive

Revisión del 2026-11-16 con el build de producción servido por el backend.

**Condiciones de la medición:**
- Celular de 390 px.
- Red 4G lenta: 150 ms de latencia y 1,6 Mbps.
- CPU 4 veces más lenta, el mismo perfil que usa Lighthouse para móvil.

## Qué se cambió

| Cambio | Por qué |
|---|---|
| El backend comprime con gzip el texto del build (JS, CSS, HTML) y cachea `assets/` por un año (`immutable`). La API no se comprime. | El chunk de entrada viajaba en 415 kB y ahora viaja en 135 kB. Los archivos de `assets/` tienen hash en el nombre: si cambian, cambia el nombre. La API queda sin comprimir para evitar BREACH: no se mezclan secretos con texto que manda el usuario. |
| La app con sesión (`app/AuthenticatedApp.tsx`: estructura, rutas, cola offline y tiempo real) se carga a demanda. Se descarga en segundo plano mientras la persona escribe su clave. | El login no la necesita para pintarse. |
| El splash dura 0,7 s al abrir (antes 2,35 s) y 0,5 s tras el login (antes 1,55 s). | Era una espera fija, no una carga real. |
| `SyncStatus` muestra la carga como una barra fina fija arriba que no ocupa lugar. El aviso de error sigue dentro de la página. | La fila «Cargando datos…» aparecía y desaparecía en cada refresco, y empujaba la pantalla. |
| El inicio del vendedor espera la ventana de edición y sus días antes de dibujar el aviso y la semana. | Mostraba por un instante «Falta tu proyección» aunque ya estuviera confirmada, y movía la página. |
| Toda grilla con columnas por breakpoint lleva `grid-cols-1` como base. | Sin esa base, la columna crece al ancho de su contenido, por ejemplo una tabla ancha. |
| Todo contenedor con `overflow-x-auto` lleva `relative`. | Los textos `sr-only` dentro de una tabla tienen posición absoluta: sin `relative`, escapan del recorte y ensanchan la página. Pasaba en el detalle del día a 1024 px (+82 px). |

## Resultados

- **Saltos de diseño (CLS):**
  - Inicio del vendedor: de 0,21 a 0.
  - Proyección vs venta: de 0,18 a 0,04.
  - Saca: de 0,08 a 0.
  - El límite recomendado es 0,1.
- **Con la app en caché** (el caso diario: la PWA guarda los archivos), cada pantalla con sesión queda lista en unos 2 a 2,8 s en esas condiciones. Ese tiempo incluye el splash y la consulta de datos.
- **Primera visita al login:** el chunk de entrada pesa unos 136 kB comprimidos. Lo ocupan sobre todo react-dom, el router, TanStack Query, axios, zod y la raíz de composición de los gateways. Bajarlo más exigiría cambiar axios o zod, y por ahora no compensa.
- **Responsive:** se revisaron 224 combinaciones: todas las pantallas de los tres roles y el login, en 8 anchos (320, 360, 390, 412, 768, 1024, 1280 y 1920 px).
  - Ninguna tiene scroll horizontal ni elementos fuera de la pantalla. Las tablas anchas se desplazan dentro de su propio contenedor.
  - Todos los objetivos táctiles miden al menos 24 px (WCAG 2.2 AA), y los controles principales, 44 px.

## Reglas

- Las grillas con columnas por breakpoint usan `grid grid-cols-1 … @Xl/main:grid-cols-[…]`.
- Las tablas anchas van en `relative overflow-x-auto`.
- Un indicador de carga no ocupa lugar en la página. Si hace falta esperar datos para no mostrar algo falso, no se dibuja hasta tenerlos.
- No se agregan esperas fijas: ni animaciones que bloqueen ni splash más largos.
