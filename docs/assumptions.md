# Supuestos y preguntas por validar

Mientras un punto no se confirme con el equipo o con Avícola 2, se elige la opción más simple, se deja configurable y se registra aquí o en un ADR.

## Datos
- **Columnas, formato y granularidad reales** de los Excel de cada área. Mientras tanto se usan datos sintéticos (declarado como limitación).
- **Catálogo real** de productos y canales, y la unidad de medida (kg o aves).
- **Cuánta historia real existe** y con qué granularidad.
- **Archivos sin columna `tipo`:** se tratan como pedidos, salvo que un mapeo confirmado fije `=type` (ADR 0003).
- **Archivos semanales** (como el resumen de Tiendas): quedan pendientes de mapeo hasta saber si los datos reales son diarios o semanales.
- **Qué es la "demanda real" para entrenar: pedidos, despachos o ventas.
  - Los días con **recorte** (F5) registran menos de lo que se pidió: la demanda está *censurada*.
  - Supuesto inicial: entrenar con pedidos e incluir un indicador de recorte como feature, o excluir esos días si se marcan.

## Dominio
- **`yield_factor`:** rendimiento de pollo vivo a producto beneficiado. Valor de referencia `YIELD_FACTOR=0.75`, configurable.
- **`avg_live_weight_kg`:** peso vivo promedio por ave. Valor de referencia `AVG_LIVE_WEIGHT_KG=2.6`, configurable.
- **Catálogo de canales y productos** (`backend/config/catalog.yaml`) y **niveles de los datos sintéticos** (unas 15 t/día de producto): inventados y plausibles, por validar.
- **Margen de seguridad** de la saca sugerida (qué percentil del intervalo usar).
- Si **"Distribución"** (pollo vivo a planta) y **"despacho"** (producto terminado) son áreas distintas.
- **A quién se pide la recarga** (granja o proveedor).

## Proceso
- **El flujo As-Is** ([architecture.md §1](architecture.md)) y el flujo de datos (quién registra qué y cada cuánto) son preliminares.
- **Estados del plan de saca:** se arranca con `draft → proposed → approved | rejected`, configurables.

## App de planificación de demanda (vendedores)
- **Hora de cierre:** la proyección del día se puede registrar o editar hasta las 10:00 (`DEMAND_CUTOFF_TIME`, zona `TZ`). Por confirmar con Comercial.
- **Venta real simulada:** mientras no haya integración con el ERP, la venta de los días pasados confirmados se genera en el backend (`SimulatedSalesProvider`, [ADR 0004](adr/0004-app-de-demanda-hexagonal.md)).
- **Unicidad:** una proyección por vendedor + fecha + categoría (BRASA / BROASTER); reenviarla la reemplaza. Por confirmar si hace falta una por cliente.
- **Clientes y canal** (backlog E3·HU1 y E1·HU3) no están en el mockup: por definir si la proyección se registra por cliente.
- **Catálogo de productos** (B1–B10, R1–R6), pesos por unidad y vendedores de prueba: tomados del mockup, por validar. Falta Brasa 0 (no proyectable, ver la sección siguiente).

## Saca por calibre, calidad y lote (reunión del 12/11/2026)
Fuentes: notas de la reunión, hoja manuscrita "Orden trozado / Plus", reporte de stock por lote (10/11/2026) y los Excel reales `DESPACHO - VENTA1.xlsx` y `DESVIACION Y AHOGADOS VIRU 2026.xlsx`. Estos Excel son datos reales: **no se suben al repositorio**.

**Confirmado**
- **Fórmula de la presaca:** `stock − pedidos de mañana + proyección de pasado mañana + plus`. Se implementa aparte.
- **Rangos (calibres) y tipos de brasa:** Brasa chica = B0–B4, Brasa mediana = B5–B6, Brasa grande = B7–B9 (el stock también muestra B10 como grande). **Carne** es un tipo aparte, sin rangos.
- **Proyección de vendedores:** Brasa 1–10. **Brasa 0 no se proyecta**, pero sí entra en la saca, que cubre B0–B10 más el resto de categorías (trozado, carne, etc.).
- **Calidad:** A = aceptado. B = descarte, pero se puede usar para trozado. **Brasa chica B no se troza.** La producción de cada rango se separa en A y B (en el Excel, B ronda el 15–25 % del total).
- **"Carne s/m" = carne sin menudencia.** El stock distingue *Pollo entero con menudencia*, *Carne sin menudencia* (A y B) y brasa por rango.
- **Stock de calidad B:** se lleva por tipo (Brasa chico B, mediano B, grande B, Carne s/m B), no por rango. El de calidad A, por rango (B0–B10).
- **Los clientes piden enteros y trozados.**
- **Orden de trozado (escalonado, solo con calidad B salvo que se indique):** 1) Carne s/m B, 2) Carne s/m A hasta 1000 und, 3) Brasa grande B, 4) Brasa mediana B hasta **500 und** ("500 pollos máximo de mediana se puede descontar").
- **Plus por tipo (und):** Carne 4000, Brasa chica 4000, Brasa mediana 1500, Brasa grande 1500.
- **Lote = fecha de producción.** Para la saca cuentan los lotes de hoy, ayer y antes de ayer.
- **Presaca editable:** el sistema propone la presaca, Producción la edita y de ahí sale la saca final. Por ahora se plantea como prueba.
- **El pedido a granja se hace por tipo de brasa**, en unidades y con un rango de peso vivo (p. ej. Brasa chica 1.55–1.70 kg, Brasa mediana 2.10–2.25 kg). Luego se reparte entre rangos con un % (en el Excel: Mediana B5 30 % / B6 70 %; Grande B7 40 % / B8 60 %).
- **Pesos mínimos por tipo** (hoja DESVIACION): Brasa chica 1.65, Brasa mediana 2.25, Brasa grande 2.50, Carne 2.10 kg.
- **Ahogados:** pollos muertos en la saca, registrados por tipo (carne / brasa). Rondan el 0.1–0.3 % de la saca y restan unidades.

**Supuestos (opción más simple, configurable)**
- Catálogo, rangos, grupos, topes de trozado, plus y % de reparto por rango van en YAML (`backend/config/`), no en el código.
- Brasa 0 se agrega al catálogo con `projectable: false`.
- El stock se consume del lote más antiguo al más nuevo (FIFO).
- Los topes (1000 y 500) y los plus son fijos mientras no se diga lo contrario.

**Por confirmar**
- Qué pasa con un lote de más de 3 días: el reporte de stock muestra un lote de 5 días (5/11 con stock al 10/11). ¿Se descarta, se troza o igual se vende?
- Si el trozado se pide en unidades o en kg, y cuántas piezas (8 o 10; en despacho aparecen "trozado c/menudencia 8 piezas" y "broaster 8/10 piezas").
- Cómo se calcula la cantidad de Brasa 0 en la saca, si no se proyecta (¿sale del stock, del pedido o de la producción esperada?).
- Si los % de reparto entre rangos (30/70, 40/60) son fijos o cambian cada día.
- Cuál es el tope sin límite en "Carne s/m B" y "Brasa grande B" dentro del orden de trozado.
- Relación entre los rangos de producción (B0–B10) y los rangos de peso del despacho (p. ej. "Brasa grande 1.70–1.79"): ¿es el peso beneficiado?
- **Despacho real** (`DESPACHO`, ene–sep 2026, ~353 mil filas): trae lo pedido y lo despachado (kg y unidades), así que permite medir la demanda censurada. El campo `Vendedor` viene vacío en el ~86 % de las filas.
- **Ventas de tiendas** (`VENTAS`, ~369 mil filas, POS): ¿se usan para el forecast del canal Tiendas?

## Infraestructura
- **Especificaciones de la laptop antigua**, si se usa. El perfil `lite` apunta a menos de unos 2.5 GB de RAM.
- **Proyecto, región, presupuesto y créditos de GCP** disponibles para el despliegue.
- **Proyecto de Supabase:** región (cerca de la VM de GCP) y si el plan gratuito alcanza (500 MB, pausa por inactividad).
- **Dominio para HTTPS en GCP:** dominio propio o un servicio de DNS comodín (tipo sslip.io).
- **Qué warehouse o lakehouse tiene un compañero del grupo.** Si se usa el suyo, solo cambia la capa `backend/app/lakehouse/`.
- **Si la rúbrica del curso exige** almacenamiento de objetos o lakehouse. GCS lo cubre en el despliegue ([ADR 0001](adr/0001-almacenamiento-gcs-y-despliegue-en-vm.md)).
