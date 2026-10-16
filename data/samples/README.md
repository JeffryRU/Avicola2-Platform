# Excel de ejemplo

Los genera `scripts/generate_synthetic.py` a partir de los últimos días del histórico sintético. Los `.xlsx` no se versionan; se regeneran con el mismo `--seed`. Cada archivo es un caso que la ingesta (paso 3) debe resolver.

| Archivo | Caso | Qué debe hacer la ingesta |
|---|---|---|
| `Horeca_comercial1_<fecha>.xlsx` | Plantilla estándar (hoja `datos`) | Ingerir directo |
| `Supermercados_comercial2_<fecha>.xlsx` | Hoja `Pedidos` con columnas `Fecha Pedido`, `Tienda`, `Item`, `Kilos` | Mapear con los alias del YAML (`fecha_pedido`, `tienda`, `item`, `kilos`) |
| `Tiendas_jefe-tiendas_<fecha>.xlsx` | Resumen semanal: título arriba, encabezado en la fila 3, solo `Semana` y `Total Kg` | Detectar el encabezado, usar granularidad semanal, `product = TOTAL` y tomar el canal del nombre del archivo |
| `Horeca_horeca-wsp_<fecha>.xlsx` | Columnas `Día`, `Local`, `Descripción`, `Peso neto (kg)`; fechas `dd/mm/aaaa` y kg como texto `1.234,5`; productos en mayúsculas | Pedir al LLM una propuesta de mapeo, que confirma una persona; normalizar fechas, números y productos |
| `Supermercados_comercial3_<fecha>.xlsx` | Plantilla con 6 filas inválidas (kg negativo, sin fecha, producto `Pavo`, canal `Supermercado`, kg `n/a`, tipo `venta`) | Cargar las filas válidas y reportar los errores por fila en `ingestion_log` |

Los clientes (`HOR-01`, `SUP-02`, …) y los responsables son códigos ficticios.
