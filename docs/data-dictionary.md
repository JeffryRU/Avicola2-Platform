# Diccionario de datos — Avícola 2

Describe los datos reales de la empresa y las tablas de la plataforma, para mapearlos sin tener que volver a abrir los Excel. Cuando un campo o significado se **deduce** y nadie lo confirmó, lleva la marca *(inferido)*. Las dudas abiertas están en [assumptions.md](assumptions.md).

> Los Excel reales **no se suben al repositorio**. Aquí solo se documenta su estructura; los ejemplos usan valores genéricos y no traen nombres de clientes.

---

## 1. Glosario de dominio

| Término | Significado |
|---|---|
| **Saca** | Pollos vivos que se sacan de la granja para beneficiarlos al día siguiente. Se pide a la granja por tipo de brasa, en unidades. |
| **Presaca** | Saca que propone el sistema. Producción la edita y de ahí sale la saca final. |
| **Rango** | Calibre del pollo beneficiado: `B0`…`B10` y `CARNE`. |
| **Tipo de brasa** | Grupo de rangos: **Brasa chica** = B0–B4, **Brasa mediana** = B5–B6, **Brasa grande** = B7–B9 (B10 aparece en el stock como grande), **Carne** = aparte, sin rangos. |
| **Calidad A / B** | A = aceptado. B = descarte, aprovechable para trozado (salvo Brasa chica B). |
| **Entero / trozado** | Formas en que se pide el pollo. El trozado se cubre con calidad B en un orden escalonado. |
| **Con / sin menudencia (c/m, s/m)** | Si el pollo entero lleva o no las vísceras comestibles. "Carne s/m" = carne sin menudencia. |
| **Lote** | En el stock, la **fecha de producción**. En la recepción de pollo vivo (backlog E9) se usa "lote" para otra cosa (P1…P4): hay que darles nombres distintos. |
| **Plus** | Unidades extra que se suman a la presaca por tipo (Carne 4000, chica 4000, mediana 1500, grande 1500). |
| **Ahogados** | Pollos muertos durante la saca o el transporte. Se registran por tipo (carne / brasa). |
| **Peso vivo (PV)** | Peso del ave viva. El pedido a granja lleva un rango de PV por tipo (p. ej. chica 1.55–1.70 kg). |
| **Granja / galpón** | Origen del pollo vivo. Una saca puede venir de varios galpones. |

---

## 2. Fuentes reales

### 2.1 `DESPACHO - VENTA1.xlsx` · hoja `DESPACHO`
Pedidos a clientes y lo que se les despachó, por línea de material. Del 02/01/2026 al 07/09/2026, unas 353 mil filas, 311 clientes y 277 combinaciones de material y rango de peso. **Grano:** una fila por pedido + material.

| Columna | Tipo | Descripción | Destino en la plataforma |
|---|---|---|---|
| `PedidoCliente` | texto | Razón social del cliente (a veces con la sede entre paréntesis). | `orders.customer` |
| `NumeroPedido` | entero | Número de pedido. | Clave natural junto con el material |
| `PedidoDetalleMaterialCodigo` | texto | Código del material (ver §2.4). | `orders.product` (vía catálogo) |
| `PedidoDetalleMaterial` | texto | Descripción del material con el rango de peso entre paréntesis, p. ej. `POLLO ENTERO BRASA GRANDE (1.70-1.79)`. `(-)` o `(0.00-0.00)` = sin rango. | Rango de peso *(inferido: peso beneficiado)* |
| `PedidoDetalleKilos` | decimal | Kg pedidos. | `orders.qty_kg` |
| `PesoDespachado` | decimal | Kg despachados. | `orders.delivered_kg` |
| `PedidoDetalleCantidad` | decimal | Unidades pedidas (0 si se pidió en kg). | Unidades pedidas |
| `CantidadDespachada` | decimal | Unidades despachadas. | Unidades despachadas |
| `PedidoZona` | texto | Zona o ciudad (Piura, Trujillo, Chiclayo, La Libertad, Chimbote, Cajamarca, San Martín, Tumbes…). Hay valores `NULL`. | `channel` o atributo de zona *(por definir)* |
| `FechaRegistro` | fecha | Fecha en que se registró el pedido. | — |
| `FechaEntrega` | fecha | Fecha de entrega. | `orders.date` |
| `Vendedor` | texto | Usuario del vendedor. **Vacío (`NULL`) en ~86 % de las filas.** | `orders.responsible` |

**Notas**
- Lo pedido y lo despachado vienen en la misma fila, así que se puede medir la **demanda censurada** (pedido > despachado).
- Hay materiales que no son pollo (huevo, accesorios); se filtran por prefijo de código.

### 2.2 `DESPACHO - VENTA1.xlsx` · hoja `VENTAS`
Ventas de las tiendas propias (POS de Odoo, replicadas a SAP). Unas 369 mil filas, 20 tiendas y 56 materiales. **Grano:** una fila por línea de comprobante.

| Columna | Tipo | Descripción |
|---|---|---|
| `PedidoOdooID`, `PedidoOdooID_DET`, `VentaId` | entero | Id del pedido o venta en Odoo (cabecera). |
| `PedidoOdooDetalleID`, `VentaDetalleOdooId` | entero | Id de la línea. |
| `FechaPedido` | fecha | Fecha de la venta. → `date` |
| `TiendaId`, `TiendaId_DET`, `TiendaCodigo`, `Tienda`, `codigoAlmacen`, `AlmacenCodigo` | entero / texto | Tienda y almacén (p. ej. `T001`). → `customer`, con `channel = Tiendas` |
| `TipoDocumentoEmitido`, `TipoDocumentoEmitidoDescripcion`, `TipoAgrupacion` | entero / texto | Factura o boleta (genérica / no genérica). |
| `CodigoDocumentoEmitido` | texto | Serie y número del comprobante. |
| `NumeroDocumentoCliente`, `RazonSocialCliente` | texto | Cliente final (`CLIENTES VARIOS` si es anónimo). **Dato personal:** no se lleva a silver. |
| `CodigoCliente`, `DestinatarioMercancias` | entero | Código SAP del cliente / destinatario (coincide con la tienda). |
| `MaterialCodigoSAP` | texto | Código del material (mismo formato que en DESPACHO, §2.4). → `product` |
| `MaterialCodigo`, `MaterialDescripcion` | texto | Código interno y descripción (p. ej. `PB BRASA`, `PB CARNE C/M`). |
| `Cantidad` | decimal | Cantidad vendida. → `qty_kg` si la unidad es `KGS` |
| `UnidadMedidaCodigo_DET`, `UnidadMedidaId_DET` | texto | `KGS` o `UND`. |
| `PrecioUnitario`, `PrecioUnitarioSinIgv`, `Impuesto`, `MontoTotal` | decimal | Precio, impuesto y total del comprobante (PEN). |
| `Lote` | entero | Lote contable *(inferido; no es el lote de producción)*. |
| `NumeroDocumentoComercial`, `ResponseReplicaEntrega`, `ResponseReplicaFactura`, `MensajeRespuestaApiSAP` | — | Datos de la réplica a SAP. No se usan. |
| `CentroBeneficioCodigo`, `CentroCodigo`, `CentroID`, `EmpresaID`, `TipoMonedaID`, `MonedaCodigo`, `TipoPosicionDocumentoComercial`, `Estado`, `EstadoDetalle`, `IsDeletedDetalle` | — | Constantes o técnicos. No se usan (filtrar `IsDeletedDetalle = 0`). |

### 2.3 `DESVIACION Y AHOGADOS VIRU 2026.xlsx`
Control de producción de la planta: calidad, pedido vs. producción y ahogados.

**`DB_CALIDA_B`** (base de la que salen las demás). **Grano:** fecha + rango. Las columnas de granja a densidad solo vienen en la primera fila de cada tipo.

| Columna | Tipo | Descripción |
|---|---|---|
| `FECHA` | fecha | Día de producción (= lote). |
| `TIPO DE BRASA` | texto | Brasa Chica / Mediana / Grande / Carne. La fila `TOTAL CALIDAD B %` es un subtotal: se descarta. |
| `GRANJA`, `GALPON` | texto | Origen. Puede listar varios: `"11 Y 9"`. |
| `UNIDADES POR PROMEDIO`, `PESO PROMEDIO` | texto | Unidades y peso vivo promedio por galpón, separados por `" Y "`. |
| `CANTIDAD TOTAL` | entero | Aves recibidas del tipo. |
| `DENSIDAD` | entero | Aves por jaba *(inferido)*. |
| `PEDIDO` | decimal | Unidades pedidas para ese rango (reparto por %). |
| `RANGO` | texto | `B0`…`B9`, `CARNE`. |
| `PRODUCCION` | entero | Unidades producidas en el rango. |
| `CALIDAD A`, `CALIDAD B` | entero | Producción separada por calidad (A + B = PRODUCCION). |
| `Total Calidad A`, `Total Calidad B`, `CALIDAD B (%)`, `%CALIDAD B TOTAL` | — | Subtotales del tipo y del día. Se recalculan; no se cargan. |

**Otras hojas**

| Hoja | Contenido | Uso |
|---|---|---|
| `AHOGADOS` | `FECHA`, `SACA` (aves), ahogados de `CARNE` y `BRASA`, y sus %. Datos desde 2019. | Factor de merma de la saca. |
| `RECLASIFICACION` | `FECHA`, `TIPO DE BRASA` (B0–B4), `CALIDAD B`, `PRODUCCION`, `%INCIDENCIA CALIDAD B`. Desde 2019. | Histórico de calidad B de brasa chica. |
| `GRÁFICO_PEDIDO_VS_PRODUCCIÓN BC / BM / BG` | Pedido vs. producción por rango y % de participación. Incluye la tabla del pedido a granja: tipo, **rango de PV**, pedido PV, rango y pollo beneficiado. | Reparto por rango y dashboard. |
| `GRÁFICO_DE_CALIDAD`, `GRÁFICO_DE_CALIDAD (2)` | % de calidad B diario por tipo (tablas dinámicas). | Dashboard (se recalcula). |
| `DESVIACION` | Peso mínimo por tipo y fecha (chica 1.65, mediana 2.25, grande 2.50, carne 2.10). | Parámetro de calidad. |
| `CONSOLIDADO`, `PRODUCCION (UND)` | Tablas dinámicas vacías o con `#DIV/0!`. | No se usan. |
| `Hoja1` | Borrador: `RANGO`, `STOCK INICIAL`, `Producido`, `Despachado` (incluye "Descarte Mediano"). | Muestra el balance de stock que se espera por rango. |

### 2.4 Familias de códigos de material *(inferido de las descripciones)*

| Prefijo | Familia | Ejemplos |
|---|---|---|
| `SEPE` | Pollo entero (brasa y carne s/m), A y "TIPO B" | `SEPE-000003` Brasa grande, `SEPE-000005` Brasa grande tipo B, `SEPE-000001` Carne s/m, `SEPE-000002` Carne s/m tipo B, `SEPE-000004` / `-000006` Brasa chico / chico tipo B, `SEPE-000007` / `-000008` Brasa mediano / mediano tipo B |
| `PTPE` | Pollo entero con menudencia | `PTPE-000003` c/menudencia, `PTPE-000002` c/menudencia tipo B |
| `PTTR` | Trozado | 8 piezas c/menudencia, broaster 8 y 10 piezas |
| `PTMR` | Marinados y macerados | Brasa marinado, brasa macerado |
| `SEDH` | Deshuesados | Filete, filetillo, lomito |
| `SEME` | Menudencia suelta | Corazón, molleja |
| `SELG` | Línea light | Pollo, pechuga y pierna light |
| `SETR` | Piezas | Pierna especial |
| `PTEP` | Empanizados | Nuggets, chicharrón |
| `PTPO` | Pollo vivo | Pollo vivo hembra |

En la saca solo entran `SEPE`, `PTPE` y `PTTR`; las demás familias son derivados.

### 2.5 Reporte de stock por lote (captura del 10/11/2026)
Tabla dinámica de inventario en **unidades**. Filtros: fecha de stock, ubicación y tipo. **Grano:** artículo + lote.

| Campo | Descripción |
|---|---|
| `LINEA` | `PB Enteros c/menudencia`, `PB Enteros s/menudencia` (calidad B por tipo y carne s/m), `PB Enteros s/menudencia 2` (calidad A por rango B0–B10). |
| `ARTICULO` | P. ej. `Pollo Entero Brasa Chico B` (B por tipo) o `Pollo Entero Brasa Mediano B5` (A por rango). |
| `LOTE` | Fecha de producción (columnas). No hay lote de domingo. |
| Valor | Unidades en stock. |

### 2.6 Reporte de producción por rango (captura del 30/10/2026)
`FECHA`, `TIPO DE BRASA`, `PEDIDO`, `RANGO`, `PRODUCCION`, `CALIDAD A`, `CALIDAD B`. Es la misma estructura que `DB_CALIDA_B`, sin los datos de granja.

---

## 3. Tablas de la plataforma

### 3.1 Postgres (Supabase, esquema `app`)
Todo cambio, por migración de Alembic. Modelos en `backend/app/db/models.py` y `backend/app/demand/adapters/sqlalchemy/tables.py`.

| Tabla | Grano | Columnas principales | Para qué |
|---|---|---|---|
| `users` | usuario | `name`, `email`, `role`, `channel`, `password_hash`, `is_active` | Acceso por rol; `canal` filtra por `channel`. |
| `saca_plans` | día | `date`, `suggested_kg`, `suggested_birds`, `planned_kg`, `status` (`draft → proposed → approved/rejected`), `created_by`, `approved_by`, `notes` | Plan de saca. **Todavía no va por rango, calidad ni tipo** (backlog E7b). |
| `saca_plan_comments` | comentario | `plan_id`, `author_id`, `body` | Conversación sobre un plan. |
| `ingestion_log` | archivo cargado | `file_name`, `source`, `rows_ok`, `rows_error`, `errors_json`, `status`, `bronze_path`, `source_signature`, `tables_json` | Linaje de la ingesta. |
| `column_mappings` | firma de columnas | `source_signature`, `source_columns`, `mapping_json`, `missing_fields`, `status`, `proposed_by` (`alias`/`llm`/`user`) | Mapeo de columnas confirmado. |
| `alerts` | alerta | `date`, `type`, `message`, `severity`, `acknowledged_by` | Avisos. |
| `demand_sellers` | vendedor | `username`, `name`, `zone`, `password_hash`, `active` | App de vendedores. |
| `demand_products` | producto | `id` (B1…B10, R1…R6), `category` (BRASA / BROASTER), `name`, `kg_per_unit`, `sort_order`, `active` | Catálogo de la app de vendedores. **Falta B0** (no proyectable). |
| `demand_projections` | vendedor + día + categoría | `submission_id`, `seller_id`, `date`, `category`, `status`, `total_units`, `total_kg`, `submitted_at` | Proyección de un vendedor. |
| `demand_projection_lines` | proyección + producto | `projection_id`, `product_id`, `units`, `kg` | Detalle por producto. |

### 3.2 Lakehouse (Delta, silver)
Definidas en `backend/config/schemas.yaml`; ese archivo manda sobre esta tabla.

| Tabla | Clave (`merge_keys`) | Columnas |
|---|---|---|
| `orders` | date, channel, customer, product | `qty_kg`, `delivered_kg`, `responsible` |
| `projections` | date, channel, customer, product | `qty_kg`, `source`, `responsible` |
| `saca` | date | `planned_birds`, `planned_kg`, `actual_kg` |
| `surplus_events` | date, product, destination | `qty_kg`, `destination` (`recategorize`/`next_day`/`discard`) |

---

## 4. Brechas entre las fuentes y el modelo actual

| Concepto real | Dónde aparece | Estado en la plataforma |
|---|---|---|
| Rango B0–B10 y tipo de brasa | Producción, stock, pedido a granja | Solo B1–B10 en `demand_products`, sin tipo. |
| Calidad A/B | Producción, stock, materiales "TIPO B" | No existe. |
| Entero vs. trozado | Materiales `SEPE`/`PTPE` vs. `PTTR` | No existe. |
| Lote (fecha de producción) | Stock | No existe. |
| Unidades además de kg | Despacho, stock, producción | Silver solo guarda kg. |
| Pedido vs. despachado | DESPACHO | `orders.qty_kg` / `delivered_kg` (sin unidades). |
| Zona | DESPACHO | Sin columna; ¿equivale a `channel`? |
| Granja, galpón y peso vivo | DB_CALIDA_B | No existe (backlog E9). |
| Ahogados | AHOGADOS | No existe. |
