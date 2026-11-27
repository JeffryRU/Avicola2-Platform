# Sistema visual de AviPlanner

Guía para escribir pantallas con el estilo de la app. La decisión está en el [ADR 0018](../adr/0018-sistema-visual-y-temas.md). La investigación previa, en [referencias.md](referencias.md).

**Regla única:** los colores, tamaños, pesos, radios y bordes salen de los tokens de `frontend/src/shared/ui/styles/globals.css`. Un componente no escribe hex, `rgb()`, `text-[Npx]`, `rounded-[..]`, medidas `[..px]` ni sombras. Si falta algo, se agrega un token.

## Direcciones y temas

| Tema | Cuándo | Rasgos |
|---|---|---|
| **A claro** | Por defecto | IBM Plex Sans; cifras en IBM Plex Mono; fondo gris cálido, superficies blancas con borde de 1 px; radio de 6 px; sin sombras |
| **A oscuro** | Sistema en oscuro o elegido en Perfil | La misma estructura con fondos carbón y el acento aclarado |
| **B alto contraste** | Interruptor en Perfil, o el sistema pide más contraste | Public Sans un paso más grande, tinta casi negra, reglas de 3 px, amarillo para lo pendiente, barra superior de la marca, botones de 48 px, sin radios |
| **B oscuro** | Alto contraste con tema oscuro | Fondo negro, texto y reglas blancas, amarillo para lo pendiente |

Los tres atributos de `<html>` son `data-theme` (`light`/`dark`), `data-contrast` (`normal`/`high`) y `data-brand` (`noraves`/`rocio`). La marca **solo cambia el acento**: botones, enlaces, selección y la barra de marca.

**Alto contraste no cambia la estructura.** B aplica la tipografía, las reglas gruesas, el amarillo y la barra de la marca de la maqueta B, pero conserva el menú lateral de A en escritorio (la app tiene más de 15 pantallas: un menú horizontal no entra). Donde A usa solo un punto de color, B agrega texto (la tira «Tu semana» dice ✓, «falta» o «—») y las filas pendientes van con fondo amarillo.

### Cómo se elige el tema

1. Perfil → **Apariencia**: Tema (Sistema, Claro, Oscuro) e interruptor **Alto contraste**.
2. Se guarda en el almacén de preferencias: `nv_theme` (`system`/`light`/`dark`) y `nv_contrast` (`system`/`normal`/`high`).
3. Sin elección, se sigue al sistema: `prefers-color-scheme` y `prefers-contrast: more`. Si el sistema pide más contraste, B se activa solo. Si el interruptor queda igual a lo que pide el sistema, se vuelve a «seguir al sistema».
4. `public/appearance-boot.js` aplica todo antes del primer pintado (sin parpadeo). La regla vive en `shared/domain/appearance.ts`; `shared/unit-tests/appearance.test.ts` comprueba que el script diga lo mismo.

En el código: `useAppearance()` devuelve la preferencia, lo resuelto y lo que pide el sistema. Para estilos propios de un tema, las variantes `dark:` y `hc:` de Tailwind (`hc:font-extrabold`, `hc:border-t-heavy`).

## Color

| Token (clase) | Uso |
|---|---|
| `background` | Fondo de la página |
| `surface` (`bg-surface`, también `card`) | Bloques, tablas, diálogos |
| `side` | Menú lateral, barra superior y barra inferior en celular |
| `muted` | Relleno suave: hover, fila de total, segmentos |
| `foreground` | Texto principal |
| `ink-2` | Texto de menú y etiquetas de filas |
| `muted-foreground` | Texto secundario, cabeceras de tabla, notas |
| `faint` | Guiones de celdas vacías y datos que no aplican |
| `border` | Borde de bloques |
| `rule` | Separador entre filas |
| `rule-strong` | Bajo la cabecera y sobre el total de una tabla |
| `control-line` (`input`) | Borde de campos y del interruptor (≥ 3:1) |
| `primary`, `primary-hover`, `primary-foreground` | Acción principal y enlaces. **Solo acciones** |
| `selected`, `selected-foreground` | Elemento elegido (día, opción) |
| `nav-active` | Ítem activo del menú (en B, amarillo) |
| `head`, `head-foreground`, `head-muted`, `brand-accent` | Barra de marca, pantalla de carga, cuadro del logo |
| `ok` / `ok-soft` | Confirmado, sincronizado, variación a favor |
| `warn` / `warn-soft` / `warn-border` / `warn-foreground` | Pendiente, falta, por sincronizar |
| `bad` / `bad-soft` / `bad-border` / `bad-foreground` | Error, acción destructiva |
| `draft` | Borrador o guardado solo en el equipo |
| `chart-1`, `chart-2`, `chart-grid`, `chart-zero` | Gráficos: serie principal, segunda serie (línea discontinua), rejilla, barras en cero |

El color de la marca **no** pinta encabezados, iconos ni fondos decorativos.

## Tipografía

- Interfaz: IBM Plex Sans 400/500/600 (A) o Public Sans 400/600/700/800 (B). Se sirven desde la app (sin Google Fonts) para que funcione sin conexión.
- **Cifras:** clase `.num` (IBM Plex Mono en A, Public Sans tabular en B). Toda columna de números, KPI y total la usa. El cuerpo ya lleva números tabulares.
- Escala (A / B):

| Clase | A | B | Uso |
|---|---|---|---|
| `text-2xs` | 11 | 12 | Etiquetas de sección (`.eyebrow`) |
| `text-xs` | 12 | 13 | Cabecera de tabla, etiqueta de KPI, notas |
| `text-sm` | 13 | 14 | Texto secundario |
| `text-base` | 14 | 15 | Cuerpo en escritorio, tablas |
| `text-md` | 15 | 16 | Cuerpo en celular, títulos de bloque |
| `text-lg` | 17 | 18 | Títulos de diálogo |
| `text-xl` | 20 | 22 | Título de pantalla en celular, KPI en celular |
| `text-2xl` | 24 | 28 | Título de pantalla en escritorio, KPI |
| `text-3xl` | 28 | 32 | Pantalla de carga, versión |
| `text-4xl` | 34 | 38 | Reservado |

- Pesos: `font-medium` (500/600), `font-semibold` (600/600), `font-bold` (600/700), `font-extrabold` (600/800). En A todo lo fuerte es 600; B sube.

## Espaciado, radios y bordes

- Rejilla de 4 px: la escala de Tailwind (`p-4`, `gap-3`, `h-9.5`). Márgenes de pantalla: 16 px en celular, 36 px en escritorio.
- Radios: `rounded-sm` (4 px), `rounded-md` (6 px, el normal), `rounded-lg` (8 px, diálogos). En B todos valen 0. `rounded-full` solo para puntos de estado e interruptores.
- Bordes: 1 px. En B los bloques llevan regla de 3 px arriba y abajo (`.panel`, `border-t-heavy`) y los controles 2 px (`border-control`).
- Sombra: solo `shadow-pop` en menús desplegables, diálogos y avisos flotantes.
- Alto táctil: `h-touch`/`size-touch` (44 px; 48 en B). En escritorio, `h-control` (36 px).

## Piezas

| Pieza | Dónde | Nota |
|---|---|---|
| `PageHeader`, `PageBody` | `shared/ui/components/layout.tsx` | Título 20/24 px; en celular fijo arriba con «Volver» |
| `Section` | ídem | Bloque `.panel` con título y regla |
| `KpiStrip` + `Kpi` | ídem | Franja de cifras separadas por reglas, **sin iconos** |
| `FooterActions` | ídem | Botones fijos abajo en celular |
| `Note` | `feedback.tsx` | Aviso con borde: `info`, `warn`, `bad`, `ok` |
| `StatusBadge`, `StatusDot` | ídem | Estado = punto + texto (lleno: hecho; hueco: falta; gris: borrador; rojo: rechazado) |
| `EmptyState` | ídem | Qué pasa y qué hacer |
| `ErrorState` | ídem | Error al cargar: título en rojo, detalle técnico pequeño y «Reintentar» |
| `tableCls` | `shared/ui/lib/table-styles.ts` | Texto a la izquierda, cifras a la derecha con `.num`, total marcado |
| `Segmented`, `DayStrip` | `shared/ui/components` | Selección con `selected`/`nav-active` |
| `Button` | `shadcn/button.tsx` | `default` (acción), `outline`, `ghost`, `link`, `destructive` |

## Estados de pantalla

- **Carga:** `SyncStatus` muestra «Cargando datos…». Si una pantalla todavía no tiene datos, **no dibuja ceros** (parecerían reales: «0 de 7 confirmaron»); espera a tenerlos.
- **Error de red:** `SyncStatus` en ámbar con «Reintentar». Una lista que no cargó usa `ErrorState`.
- **Vacío:** `EmptyState` con una frase concreta («Nadie registró proyección para este día»).
- **Pendiente:** bloque `warn` con la acción principal adentro (Registrar proyección).

## Accesibilidad

- Contraste medido con un script sobre los tokens (ver la tabla del ADR y de la tarea 0003): texto ≥ 4,5:1, gráficos y bordes de campos ≥ 3:1, en los ocho casos.
- Foco visible: contorno de 2 px del color `ring` (3 px en B) en todo lo enfocable.
- Botones de solo icono con `aria-label`. Los estados nunca dependen solo del color (punto + texto; línea continua vs. discontinua en gráficos).
- `prefers-reduced-motion` anula animaciones y transiciones.

## No hacer

- Anillos de porcentaje, iconos u otros gráficos dentro de la franja de KPIs: la cifra basta.
- Tablas anchas en el celular: si no entran en 390 px, una lista con lo esencial (como «Por vendedor» en Inicio) o la primera columna fija.
- Hex, `rgb()`, `text-[Npx]`, `rounded-[..]`, `shadow-*` o medidas `[..px]` en un componente.
- Cuadritos de color con un icono al lado de una cifra o de una opción.
- Pastillas de color para estados. Bordes gruesos de color a un lado de una tarjeta.
- Tarjetas dentro de tarjetas, sombras difusas, degradados, *glassmorphism*, emojis.
- Saludos genéricos y textos de relleno («¡Buenos días!», «Proyección inteligente…»): el título dice qué hay en la pantalla.
- Números que «cuentan» al aparecer, confeti y animaciones de adorno.
- Pintar con el color de la marca algo que no es una acción ni una selección.
