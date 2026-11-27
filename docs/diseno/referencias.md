# Referencias de diseño

Investigación para la [tarea 0003](../tareas/pendientes/0003-redisenar-el-frontend.md) (2026-11-16). Sirve como base para la dirección visual de AviPlanner.

## Qué hace que una interfaz parezca «hecha por IA»

Las fuentes coinciden en que el problema son **los valores por defecto**, no la IA. Los modelos repiten los patrones más comunes. Las señales más citadas:

- **Tipografía por defecto** (Inter o la fuente del sistema en todo), sin una escala propia.
- **Paleta por defecto de Tailwind/shadcn**: azul o violeta, fondos celestes y grises azulados.
- **Tarjetas redondeadas con sombra suave** para todo, y cuadrículas de tarjetas idénticas.
- **Cuadritos de color con un icono** al lado de cada cifra o de cada opción del menú.
- **Tarjetas con un borde de color grueso a un lado.** Hoy es la señal más reconocible.
- **Degradados en el *hero*, glassmorphism, emojis** y elementos decorativos que flotan.
- Textos de relleno y saludos genéricos.

Qué recomiendan:

- **Definir un sistema propio** (tokens de color, tipografía, espaciado y radios) y aplicarlo en todos lados. Sin sistema, el modelo adivina.
- **Nombrar lo que se quiere evitar** y hacer una **pasada de crítica** sobre capturas reales buscando esas señales.
- **No sacrificar la accesibilidad**: muchos valores por defecto no cumplen el contraste.

Fuentes: [saasui.design](https://www.saasui.design/blog/saas-ui-looks-ai-generated), [noqta.tn](https://noqta.tn/en/blog/ai-design-slop-overused-ui-patterns-fix-2026), [925studios](https://www.925studios.co/blog/ai-slop-web-design-guide), [superdesign.dev](https://superdesign.dev/blog/how-to-make-ai-ui-look-less-generic), [venngage](https://venngage.com/blog/ai-slop-in-design/), [instagit / hallmark](https://instagit.com/Nutlope/hallmark/how-to-prevent-ai-generated-ui-from-looking-generic.md).

## Tableros operativos y herramientas internas

- Un tablero operativo **existe para provocar una acción**: muestra el dato vivo para que el equipo responda ([Seahawk](https://seahawkmedia.com/?p=363098)). Pocas métricas, adaptadas a quién lo usa y para qué ([Xenia](https://www.xenia.team/articles/operational-dashboard-best-practices)). El detalle aparece cuando se pide ([Setproduct](https://setproduct.com/blog/dashboard-ui-design)).
- Referentes citados: **Linear**, por la jerarquía visual (primero el estado); **Stripe**, por la densidad (tablas compactas y ordenables como interfaz principal) ([AdminLTE](https://adminlte.io/blog/25-best-dashboard-design-examples-for-2026-real-products-principles/)). Hay quien defiende el espacio en blanco sobre la densidad para el uso diario ([925Studios](https://925studios.co/blog/saas-dashboard-design-examples-2026)): se decide por pantalla.
- **No copiar el estilo de otro producto**: su menú y su tipografía responden a su propio contenido ([Codercops](https://blog.codercops.com/blog/designing-for-developers)).
- Valores de partida habituales: texto de 13 a 14 px en la interfaz, **números tabulares** en columnas de cifras y una rejilla de espaciado de 4 px.

## Planificación y pronóstico de demanda

Las herramientas del rubro (Anaplan, Kinaxis, o9) muestran el pronóstico como **barras por semana con la línea base y la ajustada**, y debajo una **tabla con los ajustes manuales** ([Anaplan](https://www.anaplan.com/solutions/demand-planning-software/)). Trabajan con alertas y excepciones ([Kinaxis](https://www.sourceforge.net/software/product/Blue-Yonder-Supply-Chain-Planning)). Las reseñas critican interfaces anticuadas ([o9](https://www.gartner.com/reviews/market/supply-chain-planning-solutions/compare/blue-yonder-one-network-enterprises-vs-o9-solutions)). En AviPlanner aplica a Pronóstico y a Proyección vs. venta real: primero la excepción (quién falta, qué día se desvió), después el detalle.

## Apps de ventas en campo

- **El estado de conexión siempre visible**: el vendedor debe saber si está en línea o no ([Dynamics Mobile](https://www.dynamicsmobile.com/insights/offline-mobile-apps-for-business-central-best-practices-for-field-operations)).
- **Registrar sin señal es el caso normal**, y lo pendiente se sincroniza solo ([Orderwerks](https://www.orderwerks.com/ios-app), [Skynamo](https://skynamo.com/blog/5-benefits-of-field-sales-apps-with-offline-capability)).
- **El flujo sigue la forma de trabajar del vendedor**, con formularios guiados y errores claros ([Dynamics Mobile](https://www.dynamicsmobile.com/insights/mobile-order-entry-best-practices-for-dynamics-365-field-sales-reps), [Cleverence](https://www.cleverence.com/amp/articles/for-business/sales-taking-order-4827/)).
- **Diseñar para el celular desde el inicio**, con objetivos táctiles grandes, y centrarse en los pocos flujos principales ([GeekyAnts](https://customer-experience.geekyants.com/book/it_services/chapter_21.md)).

## Qué se lleva a AviPlanner

1. Tokens propios en una sola fuente (`shared/ui/styles`), sin colores sueltos en los componentes.
2. Una tipografía con carácter y **cifras tabulares** en todas las tablas.
3. Superficies planas con borde de 1 px, sin sombra difusa y con radios pequeños. Fuera los cuadritos de icono de colores y los degradados.
4. Los estados con texto y punto, no pastillas de colores. El color se reserva para lo que pide acción (pendiente, error).
5. Cada pantalla empieza por la excepción: quién falta, cuánto pedir, qué día se desvió.
6. En el celular: botones de 44 px o más, la acción principal arriba y el estado de conexión visible.
7. Modo oscuro real. Hoy no existe: la app ignora `prefers-color-scheme`.

Capturas del estado anterior: `docs/diseno/capturas/antes/`.
