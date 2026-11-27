# ADR 0012: la sugerencia de la proyección usa los pedidos reales del vendedor

## Contexto

En «Nueva proyección», el botón «Sugerir con historial» llenaba la tabla con el promedio de las proyecciones anteriores del propio vendedor. Con la historia de pedidos de ARIS cargada en la base (`cli historia`, tabla `np_dispatch_orders`) se puede sugerir a partir de lo que de verdad le pidieron.

## Comparación

`scripts/compare_demand_models.py`, validación hacia adelante sobre los últimos 120 días de pedidos (cada día se predice solo con días anteriores), por vendedor, producto y día. Entran los 9 vendedores con al menos 100 días de pedidos. El error es la suma de las diferencias absolutas entre lo predicho y lo pedido, sobre el total pedido.

| Modelo | Error |
|---|---|
| Gradient boosting de árboles (error absoluto) | 52,1 % |
| **Mediana del mismo día de la semana, 4 semanas** | **53,1 %** |
| Mediana del mismo día, 8 semanas | 54,0 % |
| Nivel de 28 días × perfil del día de la semana | 54,6 % |
| Ridge | 54,7 % |
| Suavizado exponencial del mismo día, vida media 2 semanas | 55,1 % |
| Random forest | 55,4 % |
| Suavizado exponencial, vida media 4 semanas | 55,7 % |
| Suavizado exponencial, vida media 8 semanas | 56,5 % |
| Promedio del mismo día, 4 semanas (lo que había) | 56,9 % |
| Promedio del mismo día, 8 semanas | 56,9 % |
| Gradient boosting (error cuadrático) | 57,5 % |
| Misma semana anterior | 62,4 % |
| Promedio de los últimos 28 días | 71,7 % |

## Decisión

Se implementa la **mediana del mismo día de la semana en 4 semanas**. Queda a un punto del mejor (gradient boosting), no necesita entrenarse ni guardar un modelo, y el vendedor puede entender de dónde sale cada número. No se midió si ese punto de diferencia es significativo.

A este nivel de detalle (un vendedor, un producto, un día) todos los modelos fallan en cerca de la mitad de las unidades: la sugerencia es un punto de partida que el vendedor corrige, no un pronóstico para pedir a granja.

Cuando el vendedor no tiene pedidos cargados, la sugerencia sigue saliendo del promedio de sus proyecciones anteriores.

## Supuestos

- **Material → producto.** El negocio aún no define la equivalencia. Se toma el pollo entero para brasa (`POLLO ENTERO BRASA…`, incluido el tipo B; no los marinados ni macerados) y se asigna por el inicio del rango de peso del material: «(1.60-1.69)» es el producto de 1,6 kg (Brasa 6). Si el material no trae rango, se usa el peso promedio de lo despachado. El 21 % de las líneas no trae ni rango ni despacho y queda fuera.
- **Unidades.** Si el pedido vino solo en kilos, se divide entre el peso por unidad del producto.
- **Vendedor.** Se empareja por usuario sin distinguir mayúsculas («Rnavarro» = `rnavarro`). El 26 % de las líneas de pollo entero para brasa no trae vendedor y no se usa. Una cuenta cuyo usuario no coincide con el de ARIS no recibe esta sugerencia.
- **Atraso de la carga.** Los pedidos son un archivo cargado a mano. Se usan las últimas 4 semanas que haya en la historia, aunque sean de hace meses.
