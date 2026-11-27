# ADR 0018: sistema visual propio, modo oscuro y alto contraste

- **Estado:** aceptado
- **Fecha:** 2026-11-16

## Contexto

- El usuario dijo que la interfaz «se ve rara y se nota de lejos que la hizo una IA». La [tarea 0003](../tareas/pendientes/0003-redisenar-el-frontend.md) pidió una dirección propia y validarla antes de aplicarla.
- La investigación ([referencias](../diseno/referencias.md)) encontró las señales típicas en la app: Plus Jakarta Sans en todo, la paleta por defecto (azul y celestes), tarjetas redondeadas con sombra difusa, cuadritos de icono de colores, pastillas de estado, degradados y tarjetas flotantes en el login.
- Había colores y tamaños sueltos en los componentes: unos 300 `text-[Npx]`, 150 medidas `[..px]`, radios de 8 a 20 px y hex escritos a mano.
- No existía modo oscuro: la app ignoraba `prefers-color-scheme`. Las fuentes venían de Google Fonts, así que sin conexión la PWA perdía la tipografía.
- Se mostraron dos direcciones en maquetas: **A** (sobria, IBM Plex, gris cálido, bordes finos) y **B** (alto contraste, Public Sans, reglas gruesas, amarillo). El usuario eligió **A para celular y escritorio, y B como opción de alto contraste** que cada persona puede activar.

## Decisión

### Una sola fuente de estilo

- Todos los colores, la escala tipográfica, los pesos, los radios, los bordes y la sombra de los menús son variables CSS en `frontend/src/shared/ui/styles/globals.css`. `@theme inline` las expone como clases de Tailwind (`bg-surface`, `text-muted-foreground`, `border-rule`, `text-sm`, `rounded-md`…).
- Los componentes no escriben hex, `rgb()`, `text-[Npx]`, `rounded-[..]` ni sombras. Usan las clases de tokens y la escala de espaciado de Tailwind.
- La guía de uso está en [docs/diseno/sistema.md](../diseno/sistema.md).

### Tres atributos en `<html>`

| Atributo | Valores | Qué cambia |
|---|---|---|
| `data-theme` | `light`, `dark` | Superficies, texto, bordes y estados |
| `data-contrast` | `normal`, `high` | Dirección B: tipografía, tamaños, pesos, reglas, radios en 0, botones de 48 px |
| `data-brand` | `noraves`, `rocio` | Solo el acento (acciones y selección) y el color de la barra de marca |

- Los bloques van de menos a más específicos y cada uno pisa solo lo que cambia. Las variantes `dark:` y `hc:` de Tailwind siguen a esos atributos, no a la media query.
- La escala tipográfica crece un paso en alto contraste sin tocar los componentes: `text-sm` vale 13 px en A y 14 px en B. Lo mismo con los pesos (`font-bold` es 600 en A y 700 en B) y los radios (6 px en A y 0 en B).

### Modo oscuro real

- Paleta oscura propia (no una inversión): fondos gris carbón, texto casi blanco y el acento aclarado. En oscuro el botón principal lleva texto oscuro sobre azul claro, para que el mismo token `primary` sirva de fondo y de texto con contraste suficiente.
- Por defecto sigue al sistema (`prefers-color-scheme`). En **Perfil → Apariencia** se elige Sistema, Claro u Oscuro.

### Alto contraste, también en oscuro

- Alto contraste es un interruptor en **Perfil → Apariencia**. Si el sistema pide más contraste (`prefers-contrast: more`), se activa solo; si la persona lo apaga o lo enciende a mano, se guarda su elección.
- **Tiene variante oscura** (fondo negro, texto blanco, reglas blancas, amarillo para lo pendiente). Era barato con los tokens y es lo que muchas personas con baja visión usan. No se fuerza el claro.

### Sin parpadeo y sin conexión

- La preferencia se guarda con el puerto de preferencias (`KeyValueStore`), como la marca: claves `nv_theme` y `nv_contrast`.
- `public/appearance-boot.js` aplica tema, contraste y marca antes del primer pintado. Es un archivo aparte, no un script en línea, porque la CSP solo permite scripts propios (`script-src 'self'`). Repite la regla de `shared/domain/appearance.ts`; una prueba con propiedades ejecuta el archivo real y compara su resultado con `resolveAppearance` y `themeColor`.
- Las fuentes se sirven desde la app (`@fontsource/ibm-plex-sans`, `ibm-plex-mono` y `public-sans`, solo el subconjunto latino y los pesos usados) y el service worker las precarga (`woff2`). Se quitó Google Fonts de `index.html` y de la CSP de Vercel.

## Alternativas consideradas

- **Mantener shadcn con otra paleta:** cambia el color pero no las señales (radios, sombras, pastillas), que son lo que delata la estética genérica.
- **Usar B para todos:** es la más legible, pero el usuario la prefirió como opción y no por defecto.
- **Alto contraste solo en claro:** más simple de revisar, pero deja sin opción a quien necesita contraste alto y fondo oscuro.
- **Script en línea con hash en la CSP:** obliga a recalcular el hash en dos CSP (backend y Vercel) cada vez que cambia el script. El archivo aparte no.
- **Clase `.dark` de shadcn:** no cubre el alto contraste ni la marca; los atributos de datos sí, y se combinan.

## Consecuencias

- Un color o tamaño nuevo se agrega como token en `globals.css` (y en los cuatro temas si cambia entre ellos), no en el componente.
- `docs/diseno/sistema.md` lista las reglas «no hacer». La revisión de diseño se hace con capturas de los tres temas (`docs/diseno/capturas/despues/`).
- Los contrastes de los pares de tokens principales se midieron en los ocho casos (A/B, claro/oscuro, dos marcas): todos pasan 4,5:1 en texto y 3:1 en gráficos y bordes de controles.
- Las fuentes suman unos 170 KB en `woff2` (precargados por el service worker); quedan en caché tras la primera visita.
