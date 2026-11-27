# 0003 · Auditar y rediseñar la interfaz del frontend

- **Área:** frontend · diseño
- **Prioridad:** alta
- **Creada:** 2026-11-16
- **Depende de:** [0002](0002-instalar-skills-de-buenas-practicas.md)

## Contexto

El diseño actual no convence: se ve raro y **se nota de lejos que lo hizo una IA** (estética genérica). El objetivo es una interfaz con identidad propia, sobria y cómoda para el uso diario de supervisores y vendedores.

## Qué hay que hacer

### Investigación

- [x] Buscar en la web referentes de diseño para aplicaciones de este tipo: dashboards operativos, planificación y pronóstico de demanda, herramientas internas B2B y apps de ventas en campo.
- [x] Recopilar los detalles que separan un diseño cuidado de uno «hecho por IA»:
  - Tipografía con carácter y una escala coherente.
  - Paleta propia, no el violeta o azul por defecto.
  - Sin degradados ni *glassmorphism* gratuitos, ni emojis o iconos decorativos en exceso.
  - Sin tarjetas dentro de tarjetas, sombras y bordes redondeados genéricos ni textos de relleno.
  - Densidad adecuada de la información, jerarquía visual clara, alineación y espaciado consistentes, y estados vacíos, de carga y de error bien resueltos.
- [x] Documentar los hallazgos con capturas o enlaces en `docs/diseno/referencias.md`.

### Auditoría

- [x] Pasar las skills de diseño instaladas (taste, impeccable y web design guidelines de Vercel) sobre cada pantalla.
- [x] Revisar accesibilidad: contraste, foco visible, navegación por teclado y textos alternativos.
- [x] Revisar el responsive: los vendedores usan el celular.
- [x] Revisar el modo oscuro.
- [x] Listar los problemas por pantalla y por prioridad.

### Rediseño

- [x] Definir una dirección visual (tokens de color, tipografía, espaciado, radios y sombras) y **validarla con el usuario antes de aplicarla** a todo.
- [x] Aplicar los tokens en `frontend/src/shared/ui/styles` y en los componentes base de `shared/ui/components`.
- [x] Rediseñar las pantallas feature por feature, sin romper la lógica.

## Criterios de aceptación

- El usuario aprueba la nueva dirección visual.
- No quedan hallazgos de prioridad alta de la auditoría.
- Pasan los tests, el lint y el build. Hay capturas de antes y después de las pantallas principales.

## Notas

- El estilo se define en una sola fuente (los tokens). No se escriben colores ni tamaños sueltos en cada componente.

## Resultado (2026-11-16)

El usuario eligió la **dirección A** (sobria, IBM Plex, gris cálido, bordes finos) para celular y escritorio, y la **B** como **alto contraste** opcional. La decisión está en el [ADR 0018](../../adr/0018-sistema-visual-y-temas.md) y la guía de uso en [docs/diseno/sistema.md](../../diseno/sistema.md).

- **Tokens en una sola fuente** (`frontend/src/shared/ui/styles/globals.css`): A claro, A oscuro, B alto contraste y B oscuro, en Noraves y Rocío (la marca solo cambia el acento). La escala tipográfica, los pesos, los radios y los bordes también son tokens: en B crecen solos, sin tocar las pantallas. Ninguna pantalla escribe hex, `rgb()`, `text-[Npx]`, `rounded-[..]` ni sombras.
- **Modo oscuro real** y **alto contraste**: en **Perfil → Apariencia** (Tema: Sistema, Claro u Oscuro; interruptor «Alto contraste»). Siguen a `prefers-color-scheme` y `prefers-contrast: more` si no hay elección. Se guardan como la marca (`nv_theme`, `nv_contrast`) y se aplican antes del primer pintado con `public/appearance-boot.js`. Pruebas con propiedades en `shared/unit-tests/appearance.test.ts` (también ejecutan el script real).
- **Fuentes propias** (`@fontsource`, subconjunto latino y pesos usados), precargadas por el service worker. Se quitó Google Fonts de `index.html` y de la CSP de Vercel.
- **Todas las pantallas rediseñadas**: login, carga, estructura (menú lateral a todo el alto, con grupos y sin iconos; barra superior y barra inferior en celular), Inicio de vendedor y supervisor, Registrar, Mis proyecciones, día, solicitudes, historial, dashboards, productos, notificaciones, perfil y subpáginas, usuarios, habilitaciones, stock, saca, producción, pronóstico, versiones y conexión. Fuera: cuadritos de icono de colores, sombras difusas, degradados, tarjetas flotantes, pastillas de estado, números que cuentan, confeti y saludos genéricos.
- **Revisión independiente**: un revisor de diseño miró las capturas contra las maquetas. Se corrigieron sus hallazgos altos (ceros falsos mientras carga, tablas cortadas en celular, «−0» en Saca, «Cerrar sesión» oculto en alto contraste, estado solo por color en B) y la mayoría de los medios.

Contraste medido sobre los tokens (texto ≥ 4,5:1; gráficos y bordes de campos ≥ 3:1). Los 288 pares revisados pasan:

| Tema | `foreground`/`background` | `muted-foreground`/`surface` | `faint`/`surface` | `primary-foreground`/`primary` | `primary`/`surface` | `warn-foreground`/`warn-soft` | `warn`/`surface` | `ok`/`surface` | `bad`/`surface` | `control-line`/`surface` | Mín. texto |
|---|---|---|---|---|---|---|---|---|---|---|---|
| A claro · Noraves | 14.5 | 5.8 | 5.3 | 6.7 | 6.7 | 8.6 | 5.4 | 5.6 | 6.6 | 3.3 | 4.88 |
| A claro · Rocío | 14.5 | 5.8 | 5.3 | 5.9 | 5.9 | 8.6 | 5.4 | 5.6 | 6.6 | 3.3 | 4.88 |
| A oscuro · Noraves | 15.1 | 6.8 | 5.5 | 7.7 | 7.3 | 12.0 | 8.5 | 8.4 | 7.6 | 3.8 | 5.50 |
| A oscuro · Rocío | 15.1 | 6.8 | 5.5 | 7.8 | 7.2 | 12.0 | 8.5 | 8.4 | 7.6 | 3.8 | 5.50 |
| B claro · Noraves | 18.5 | 8.0 | 6.2 | 6.1 | 6.1 | 16.7 | 18.5 | 6.7 | 7.9 | 18.5 | 5.81 |
| B claro · Rocío | 18.5 | 8.0 | 6.2 | 7.0 | 7.0 | 16.7 | 18.5 | 6.7 | 7.9 | 18.5 | 5.81 |
| B oscuro · Noraves | 21.0 | 13.1 | 10.4 | 11.6 | 10.7 | 13.4 | 13.8 | 12.4 | 10.0 | 19.5 | 8.49 |
| B oscuro · Rocío | 21.0 | 13.1 | 10.4 | 10.4 | 9.7 | 13.4 | 13.8 | 12.4 | 10.0 | 19.5 | 8.49 |

Capturas: antes en `docs/diseno/capturas/antes/`, después en `docs/diseno/capturas/despues/` (las mismas pantallas, más oscuro, alto contraste y alto contraste oscuro).

Pendiente:
- El formato de números sigue en es-PE («11,045», «153.0»), igual que las exportaciones. La maqueta usaba «1 874» y «3 452,6»: cambiarlo es una decisión aparte.
- Los días futuros sin registrar salen «Pendiente» en Mis proyecciones y Estado por día, y «sin registrar» en Inicio. Unificar el criterio toca la lógica de estados.
- Los campos nativos de fecha y hora se muestran en el formato del navegador.
