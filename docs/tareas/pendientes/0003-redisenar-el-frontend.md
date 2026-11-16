# 0003 · Auditar y rediseñar la interfaz del frontend

- **Área:** frontend · diseño
- **Prioridad:** alta
- **Creada:** 2026-11-16
- **Depende de:** [0002](0002-instalar-skills-de-buenas-practicas.md)

## Contexto

El diseño actual no convence: se ve raro y **se nota de lejos que lo hizo una IA** (estética genérica). El objetivo es una interfaz con identidad propia, sobria y cómoda para el uso diario de supervisores y vendedores.

## Qué hay que hacer

### Investigación

- [ ] Buscar en la web referentes de diseño para aplicaciones de este tipo: dashboards operativos, planificación y pronóstico de demanda, herramientas internas B2B y apps de ventas en campo.
- [ ] Recopilar los detalles que separan un diseño cuidado de uno «hecho por IA»:
  - Tipografía con carácter y una escala coherente.
  - Paleta propia, no el violeta o azul por defecto.
  - Sin degradados ni *glassmorphism* gratuitos, ni emojis o iconos decorativos en exceso.
  - Sin tarjetas dentro de tarjetas, sombras y bordes redondeados genéricos ni textos de relleno.
  - Densidad adecuada de la información, jerarquía visual clara, alineación y espaciado consistentes, y estados vacíos, de carga y de error bien resueltos.
- [ ] Documentar los hallazgos con capturas o enlaces en `docs/diseno/referencias.md`.

### Auditoría

- [ ] Pasar las skills de diseño instaladas (taste, impeccable y web design guidelines de Vercel) sobre cada pantalla.
- [ ] Revisar accesibilidad: contraste, foco visible, navegación por teclado y textos alternativos.
- [ ] Revisar el responsive: los vendedores usan el celular.
- [ ] Revisar el modo oscuro.
- [ ] Listar los problemas por pantalla y por prioridad.

### Rediseño

- [ ] Definir una dirección visual (tokens de color, tipografía, espaciado, radios y sombras) y **validarla con el usuario antes de aplicarla** a todo.
- [ ] Aplicar los tokens en `frontend/src/shared/ui/styles` y en los componentes base de `shared/ui/components`.
- [ ] Rediseñar las pantallas feature por feature, sin romper la lógica.

## Criterios de aceptación

- El usuario aprueba la nueva dirección visual.
- No quedan hallazgos de prioridad alta de la auditoría.
- Pasan los tests, el lint y el build. Hay capturas de antes y después de las pantallas principales.

## Notas

- El estilo se define en una sola fuente (los tokens). No se escriben colores ni tamaños sueltos en cada componente.
