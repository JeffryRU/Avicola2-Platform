# ADR 0021: las columnas de los archivos de carga, en `config/imports.yaml`

## Contexto

La app de planificación carga cuatro archivos del negocio:

- los exports de ARIS (DESPACHO y VENTAS), desde la app, Drive, Telegram, WhatsApp o `cli historia`;
- el reporte de pedidos en tienda (`cli tiendas`);
- el Excel de producción (hoja DB_CALIDA_B, con `cli produccion`).

Los nombres de sus columnas estaban escritos a mano en cuatro módulos distintos. Eso tenía dos problemas:

- Iba contra la regla de no fijar esquemas en el código (CLAUDE.md).
- Si a un archivo le faltaba una columna, cada fila fallaba por separado y el mensaje final era genérico: «no trae ninguna fila válida».

## Decisión

`backend/config/imports.yaml` describe cada archivo. Para cada uno indica:

- para qué módulos sirve (`used_by`);
- qué columnas lo identifican (`detect`);
- dónde se guarda;
- las columnas (título, tipo, si es obligatoria, alias, valor por defecto) y los filtros de filas (`keep_if`).

El modelo está en `planning/domain/file_specs.py`, que es Python puro. Lo leen `planning/infrastructure/file_specs.py` y `tabular.py`, y todas las cargas usan ese mismo lector.

- **Columnas:** los títulos se comparan sin tildes, mayúsculas, espacios ni signos. Si ARIS cambia un título, se agrega como alias en el YAML y no se toca el código.
- **Columna que falta:** el archivo se rechaza diciendo cuál falta y no se guarda nada.
- **Fila con un valor que no sirve:** se descarta, y la respuesta trae las primeras con su número de fila y el motivo («Fila 3: «FechaRegistro» no es una fecha: ayer»). La app y los bots de n8n lo muestran.
- **Errores de fórmula de Excel** (`#VALUE!`, `#N/A`, etc.): se tratan como celda vacía. Así lo hacía ya la carga de producción.
- **Catálogo de datos por módulo:** `cli archivos` lo imprime a partir del mismo YAML.

Las reglas de negocio siguen en el código porque no son columnas: el rango Bn → Brasa n, el material de las tiendas o el peso promedio de la parvada.

## Consecuencias

- **Resultado idéntico:** con los archivos reales, las cuatro cargas dan exactamente lo mismo que antes. Se comprobó con el export de ARIS de jul–nov, los CSV históricos, el reporte de tiendas y el Excel de producción.
- **Esquema de la base:** `tests/test_file_specs.py` verifica que los campos de los exports de ARIS sean las columnas de su tabla. Si se agrega una columna a la tabla, hay que declararla en el YAML.
- **Ingesta del lakehouse:** `schemas.yaml` es otro módulo (`ingest`) y no cambia. Los dos módulos no se importan entre sí.
