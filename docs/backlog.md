# Product backlog — Avícola 2

Backlog derivado del storyboard (paneles 01–08) y del tablero del equipo. Cada épica lleva prioridad, ciclo e historia de usuario; cada HU, prioridad, dificultad y criterio de aceptación en formato *Dado / cuando / entonces*. Estado y responsable los asigna el equipo.

**Notas**
- La "HU 1: Crear Formulario de Autenticación" se mueve de *Registro de Proyecciones* a *Ingreso de usuario con clave*.
- Solo "Ciclo 1 · Núcleo" existe en el tablero; los nombres de los ciclos 2 y 3 son una propuesta.
- B1, B2, B3 = productos/presentaciones. PA, PB, PC = tipos de producción con su propio rendimiento en kg/ave. P1…P4 = lotes de pollo vivo recibidos.

| Ciclo | Enfoque | Paneles del storyboard |
|---|---|---|
| Ciclo 1 · Núcleo | Captura de datos | 01, 02 |
| Ciclo 2 · Planificación de saca | Consolidar, calcular y validar la saca | 03, 04, 06 |
| Ciclo 3 · Producción y cierre | Producción real, resultados y cierre del día | 05, 07, 08 |

---

## Ciclo 1 · Núcleo — Captura de datos

### E1. Ingreso de usuario con clave
**Prioridad:** Alta · **Ciclo:** 1
**Historia:** Como usuario (vendedor, Comercial o Producción), quiero ingresar con usuario y clave para ver solo la información de mi rol.

| HU | Prioridad | Dificultad | Criterio de aceptación |
|---|---|---|---|
| HU 1: Crear formulario de autenticación | Alta | Media | Dado que tengo una cuenta activa, cuando ingreso usuario y clave válidos, entonces entro a la pantalla de inicio de mi rol. |
| HU 2: Mensaje de credenciales inválidas | Alta | Baja | Dado que estoy en el login, cuando ingreso una clave incorrecta, entonces veo "Usuario o clave incorrectos" y no ingreso. |
| HU 3: Acceso filtrado por rol y canal | Alta | Media | Dado que soy vendedor del canal Horeca, cuando ingreso, entonces solo veo clientes y proyecciones de Horeca. |
| HU 4: Cerrar sesión | Baja | Baja | Dado que tengo la sesión iniciada, cuando pulso "Cerrar sesión", entonces vuelvo al login y no puedo regresar con "atrás". |

### E2. Pantalla de inicio con las opciones de clientes, proyección, historial y notificaciones
**Prioridad:** Media · **Ciclo:** 1
**Historia:** Como vendedor, quiero un menú simple en el móvil para llegar rápido a registrar mi proyección.

| HU | Prioridad | Dificultad | Criterio de aceptación |
|---|---|---|---|
| HU 1: Menú con las 4 opciones | Media | Baja | Dado que inicié sesión, cuando cargo el inicio, entonces veo accesos a Clientes, Proyección, Historial y Notificaciones. |
| HU 2: Diseño adaptado a móvil | Alta | Media | Dado que entro desde el celular, cuando abro cualquier pantalla, entonces se ve completa sin scroll horizontal. |
| HU 3: Aviso de proyección pendiente | Media | Baja | Dado que no he enviado la proyección de mañana, cuando entro al inicio, entonces veo el aviso "Proyección pendiente". |

### E3. Registro de Proyecciones
**Prioridad:** Alta · **Ciclo:** 1
**Historia:** Como vendedor, quiero registrar mi proyección por cliente y producto (B1, B2, B3…) desde el móvil, para no depender de WhatsApp.

| HU | Prioridad | Dificultad | Criterio de aceptación |
|---|---|---|---|
| HU 1: Formulario de proyección por cliente y producto | Alta | Media | Dado que estoy en Proyección, cuando elijo fecha y cliente, entonces puedo ingresar la cantidad de cada producto (B1, B2, B3). |
| HU 2: Validación de campos | Alta | Baja | Dado que lleno el formulario, cuando dejo el cliente vacío o pongo una cantidad negativa, entonces no puedo enviar y veo qué campo corregir. |
| HU 3: Envío con confirmación | Alta | Baja | Dado que el formulario es válido, cuando pulso "Enviar", entonces veo "¡Enviado!" y la proyección queda registrada con fecha, hora y vendedor. |
| HU 4: Editar antes de la hora de cierre | Media | Media | Dado que envié una proyección, cuando la edito antes de la hora límite configurada, entonces se guarda el cambio; pasada esa hora queda bloqueada. |
| HU 5: Copiar la proyección anterior | Baja | Baja | Dado que registro la proyección de un cliente, cuando pulso "Copiar la del día anterior", entonces el formulario se llena con esas cantidades para ajustarlas. |

### E4. Historial de proyecciones
**Prioridad:** Media · **Ciclo:** 1
**Historia:** Como vendedor, quiero ver mis proyecciones pasadas para tener trazabilidad de lo que pedí.

| HU | Prioridad | Dificultad | Criterio de aceptación |
|---|---|---|---|
| HU 1: Listado de mis proyecciones | Media | Baja | Dado que tengo proyecciones enviadas, cuando entro a Historial, entonces veo fecha, cliente, cantidades y estado de cada una. |
| HU 2: Filtro por fecha y cliente | Baja | Baja | Dado que estoy en Historial, cuando filtro por rango de fechas o cliente, entonces solo veo las que coinciden. |

### E5. Obtener información histórica de Aris
**Prioridad:** Media · **Ciclo:** 1
**Historia:** Como Comercial, quiero cargar los pedidos reales exportados de Aris para compararlos con las proyecciones.

| HU | Prioridad | Dificultad | Criterio de aceptación |
|---|---|---|---|
| HU 1: Carga del Excel de Aris | Alta | Media | Dado que tengo el Excel exportado de Aris, cuando lo subo (o lo dejo en la carpeta vigilada), entonces los pedidos quedan registrados por fecha, cliente, canal y producto. |
| HU 2: Validación y mapeo de columnas | Alta | Media | Dado que el Excel trae columnas con otros nombres, cuando se procesa, entonces el sistema las mapea o me pide confirmar el mapeo antes de guardar. |
| HU 3: Confirmación "Recibido y revisado" | Media | Baja | Dado que la carga terminó, cuando se procesó sin errores, entonces recibo una notificación con el número de filas cargadas; si hubo errores, veo cuáles. |
| HU 4: Carga del histórico inicial | Media | Media | Dado que existen meses de pedidos anteriores, cuando se cargan por única vez, entonces quedan disponibles para el modelo de predicción. |

---

## Ciclo 2 · Planificación de saca

### E6. Consolidación de pedidos y proyecciones
**Prioridad:** Alta · **Ciclo:** 2
**Historia:** Como Comercial, quiero ver las proyecciones de todos los vendedores consolidadas automáticamente y cruzadas con los pedidos de Aris.

| HU | Prioridad | Dificultad | Criterio de aceptación |
|---|---|---|---|
| HU 1: Consolidado por canal y producto | Alta | Media | Dado que los vendedores enviaron sus proyecciones, cuando abro el consolidado del día, entonces veo el total en kg por canal (tienda, Horeca, supermercado) y producto. |
| HU 2: Comparación proyección vs pedido real | Alta | Media | Dado que hay pedidos de Aris para esa fecha, cuando veo el consolidado, entonces aparece la desviación % entre lo proyectado y lo pedido. |
| HU 3: Alerta de proyecciones faltantes | Media | Baja | Dado que se acerca la hora de cierre, cuando un vendedor no ha enviado su proyección, entonces Comercial lo ve marcado como pendiente. |

### E7. Cálculo de la saca sugerida
**Prioridad:** Alta · **Ciclo:** 2
**Historia:** Como Comercial, quiero que el sistema calcule la saca a partir de pedidos, proyecciones e inventario final, para decidir con datos.

| HU | Prioridad | Dificultad | Criterio de aceptación |
|---|---|---|---|
| HU 1: Configurar los factores | Alta | Media | Dado que tengo permisos de Comercial, cuando edito el % de calidad B, el margen de desviación, el stock de seguridad y los kg/ave de PA, PB y PC, entonces se guardan y se usan en el siguiente cálculo. |
| HU 2: Calcular la saca en kg y aves | Alta | Alta | Dado que existen el consolidado y el inventario final, cuando pido el cálculo, entonces veo la saca sugerida en kg y en número de aves, con el desglose de cada factor. |
| HU 3: Ajuste manual con justificación | Media | Media | Dado que veo la saca sugerida, cuando cambio la cantidad, entonces el sistema me pide un motivo y guarda la sugerida y la final. |
| HU 4: Validar la saca con Comercial | Alta | Media | Dado que la saca está en borrador, cuando Comercial la valida, entonces pasa a "Validada", queda bloqueada y Producción la ve. |

### E7b. Presaca por rango, calidad y lote
**Prioridad:** Alta · **Ciclo:** 2
**Historia:** Como Producción, quiero una presaca calculada por rango (B0–B10 y Carne), calidad (A/B) y lote, que pueda editar hasta obtener la saca final.
*Viene de la reunión del 12/11/2026. Reglas y dudas abiertas en [assumptions.md](assumptions.md) (sección "Saca por calibre, calidad y lote"). La fórmula `stock − pedidos de mañana + proyección de pasado mañana + plus` se trabaja aparte.*

| HU | Prioridad | Dificultad | Criterio de aceptación |
|---|---|---|---|
| HU 1: Brasa 0 en el catálogo, sin proyección | Alta | Baja | Dado que soy vendedor, cuando abro el formulario, entonces veo Brasa 1–10 y no Brasa 0; dado que soy Producción, cuando veo la saca, entonces aparece Brasa 0. |
| HU 2: Rangos agrupados por tipo | Alta | Baja | Dado que el catálogo define B0–B4 como chica, B5–B6 como mediana, B7–B10 como grande y Carne aparte, cuando veo la presaca, entonces puedo ver el detalle por rango y el subtotal por tipo. |
| HU 3: Pedidos enteros y trozados | Alta | Media | Dado que un cliente pide pollo entero o trozado, cuando registro o cargo el pedido, entonces queda con su forma (entero / trozado) y la presaca los suma por separado. |
| HU 4: Stock por lote y calidad | Alta | Media | Dado que registro o cargo el stock, cuando lo guardo, entonces queda por fecha de lote, rango (calidad A) o tipo (calidad B), y la presaca usa los lotes de hoy, ayer y antes de ayer, del más antiguo al más nuevo. |
| HU 5: Asignación escalonada del trozado | Alta | Alta | Dado que hay pedido de trozado, cuando se calcula la presaca, entonces se cubre en este orden: Carne s/m B, Carne s/m A (máx. 1000), Brasa grande B, Brasa mediana B (máx. 500), nunca con Brasa chica B, y veo cuánto salió de cada fuente. |
| HU 6: Plus por tipo configurable | Media | Baja | Dado que tengo permisos de Producción, cuando edito el plus de Carne, Brasa chica, mediana o grande, entonces el siguiente cálculo lo usa. |
| HU 7: Editar la presaca y aprobar la saca | Alta | Media | Dado que veo la presaca, cuando cambio una cantidad, entonces se guardan la sugerida y la editada con usuario y hora; cuando la apruebo, queda como saca final y bloqueada. |
| HU 8: Pedido a granja por tipo y reparto por rango | Media | Media | Dado que la saca está aprobada, cuando la paso a pedido de granja, entonces veo las unidades por tipo con su rango de peso vivo y el reparto por rango según los % configurados. |
| HU 9: Descontar ahogados | Baja | Baja | Dado que hay un % histórico de ahogados por tipo, cuando se calcula el pedido a granja, entonces se suman las unidades necesarias para compensarlos. |

### E8. Predicción de demanda
**Prioridad:** Media · **Ciclo:** 2
**Historia:** Como Comercial, quiero una predicción de demanda por canal y producto para anticiparme cuando las proyecciones no alcanzan.

| HU | Prioridad | Dificultad | Criterio de aceptación |
|---|---|---|---|
| HU 1: Predicción diaria por canal y producto | Media | Alta | Dado que existe el histórico de Aris, cuando corre el entrenamiento programado, entonces hay una predicción para los próximos días por canal y producto. |
| HU 2: Ver la predicción junto al consolidado | Media | Media | Dado que abro el consolidado, cuando hay predicción para esa fecha, entonces la veo al lado de lo proyectado y lo pedido. |
| HU 3: Comparar contra el baseline | Media | Media | Dado que se entrenó un modelo, cuando reviso sus métricas, entonces veo su WAPE frente al baseline naive estacional. |

---

## Ciclo 3 · Producción y cierre

### E9. Recepción de pollo vivo y predicción de producción
**Prioridad:** Alta · **Ciclo:** 3
**Historia:** Como Producción, quiero registrar la recepción de pollo vivo y que el sistema prediga la producción real, para validar y ajustar la desviación.

| HU | Prioridad | Dificultad | Criterio de aceptación |
|---|---|---|---|
| HU 1: Registrar la recepción | Alta | Media | Dado que llega el pollo vivo, cuando registro fecha, lote (P1…P4), número de aves y kg vivos, entonces se calcula el kg/ave de cada lote. |
| HU 2: Predicción de producción real | Alta | Alta | Dado que registré la recepción, cuando se aplican los rendimientos configurados, entonces veo la producción estimada en kg por tipo (PA, PB, PC). |
| HU 3: Validar y ajustar la desviación | Media | Media | Dado que veo la producción estimada frente a la saca validada, cuando la diferencia supera el rango configurado, entonces se marca en alerta y puedo registrar la decisión tomada. |

### E10. Dashboard de resultados
**Prioridad:** Media · **Ciclo:** 3
**Historia:** Como Comercial o Producción, quiero ver de inmediato la desviación, el stock, el cumplimiento y la calidad B.

| HU | Prioridad | Dificultad | Criterio de aceptación |
|---|---|---|---|
| HU 1: Gráfico de desviación | Media | Media | Dado que hay datos de los últimos días, cuando abro el dashboard, entonces veo un gráfico de la desviación entre proyectado y real. |
| HU 2: Cumplimiento % por canal | Media | Media | Dado que hay despachos registrados, cuando veo el dashboard, entonces aparece el % de cumplimiento de tienda, Horeca y supermercado. |
| HU 3: Indicadores de stock y % calidad B | Media | Baja | Dado que se registró la producción, cuando veo el dashboard, entonces aparecen el stock actual y el % de calidad B del día. |
| HU 4: Pedido vs. producción por rango | Media | Media | Dado que hay producción registrada por rango y calidad, cuando abro el dashboard, entonces veo pedido vs. producción por rango y el % de calidad B por tipo (como las hojas de DESVIACION Y AHOGADOS). |

### E11. Cierre: inventario final y despacho
**Prioridad:** Media · **Ciclo:** 3
**Historia:** Como Producción, quiero registrar el inventario final y el despacho para cerrar el día y alimentar la saca siguiente.

| HU | Prioridad | Dificultad | Criterio de aceptación |
|---|---|---|---|
| HU 1: Registrar el despacho por canal | Media | Media | Dado que la saca está validada, cuando registro lo despachado por canal, entonces se actualizan el cumplimiento y el stock. |
| HU 2: Registrar el inventario final | Alta | Baja | Dado que terminó el despacho, cuando registro el inventario final, entonces queda como dato de entrada para la saca del día siguiente. |
| HU 3: Cerrar el día | Baja | Baja | Dado que se registraron despacho e inventario, cuando cierro el día, entonces sus datos quedan bloqueados y se notifica a Comercial. |

### E12. Notificaciones
**Prioridad:** Baja · **Ciclo:** 3
**Historia:** Como usuario, quiero recibir avisos de los eventos clave sin tener que revisar la app.

| HU | Prioridad | Dificultad | Criterio de aceptación |
|---|---|---|---|
| HU 1: Recordatorio de proyección | Baja | Media | Dado que no envié mi proyección, cuando falta 1 hora para el cierre, entonces recibo un recordatorio (app o Telegram). |
| HU 2: Aviso de saca validada | Baja | Baja | Dado que Comercial validó la saca, cuando cambia su estado, entonces Producción recibe la notificación. |

### E13. Consultas en lenguaje natural (IA generativa) — *sugerida*
**Prioridad:** Media · **Ciclo:** 3
**Historia:** Como Comercial, quiero preguntar en lenguaje natural por los datos de pedidos y saca, para obtener respuestas sin armar reportes.
*No aparece en el storyboard, pero la IA generativa es un requisito obligatorio del proyecto.*

| HU | Prioridad | Dificultad | Criterio de aceptación |
|---|---|---|---|
| HU 1: Pregunta y respuesta en tabla | Media | Alta | Dado que estoy en Consultas, cuando escribo "¿Cuánto pidió Horeca la semana pasada?", entonces veo la respuesta en una tabla con la consulta usada. |
| HU 2: Solo lectura y límite de filas | Alta | Media | Dado que hago una pregunta, cuando el sistema genera la consulta, entonces solo puede leer tablas permitidas y devuelve como máximo el límite de filas configurado. |
