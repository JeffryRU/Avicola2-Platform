# Supuestos y preguntas por validar

Mientras un punto no se confirme con el equipo o con Avícola 2, se elige la opción más simple, se deja configurable y se registra aquí o en un ADR.

## Datos
- **Columnas, formato y granularidad reales** de los Excel de cada área. Mientras tanto se usan datos sintéticos (declarado como limitación).
- **Catálogo real** de productos y canales, y la unidad de medida (kg o aves).
- **Cuánta historia real existe** y con qué granularidad.
- **Qué es la "demanda real"** para entrenar: pedidos, despachos o ventas.
  - Los días con **recorte** (F5) registran menos de lo que se pidió: la demanda está *censurada*.
  - Supuesto inicial: entrenar con pedidos e incluir un indicador de recorte como feature, o excluir esos días si se marcan.

## Dominio
- **`yield_factor`:** rendimiento de pollo vivo a producto beneficiado. Se usa un valor de referencia configurable hasta tener el real.
- **`avg_live_weight_kg`:** peso vivo promedio por ave. Configurable.
- **Margen de seguridad** de la saca sugerida (qué percentil del intervalo usar).
- Si **"Distribución"** (pollo vivo a planta) y **"despacho"** (producto terminado) son áreas distintas.
- **A quién se pide la recarga** (granja o proveedor).

## Proceso
- **El flujo As-Is** ([architecture.md §1](architecture.md)) y el flujo de datos (quién registra qué y cada cuánto) son preliminares.
- **Estados del plan de saca:** se arranca con `draft → proposed → approved | rejected`, configurables.

## Infraestructura
- **Especificaciones de la laptop antigua**, si se usa. El perfil `lite` apunta a menos de unos 2.5 GB de RAM.
- **Proyecto, región, presupuesto y créditos de GCP** disponibles para el despliegue.
- **Dominio para HTTPS en GCP:** dominio propio o un servicio de DNS comodín (tipo sslip.io).
- **Qué warehouse o lakehouse tiene un compañero del grupo.** Si se usa el suyo, solo cambia la capa `backend/app/lakehouse/`.
- **Si la rúbrica del curso exige** almacenamiento de objetos o lakehouse. GCS lo cubre en el despliegue ([ADR 0001](adr/0001-almacenamiento-gcs-y-despliegue-en-vm.md)).
