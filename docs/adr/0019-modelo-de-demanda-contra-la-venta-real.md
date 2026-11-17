# ADR 0019: el modelo de demanda medido contra la venta real

## Contexto

El ADR 0012 eligió la mediana del mismo día de la semana (4 semanas) midiendo contra lo **pedido**, por vendedor, producto y día. Con la historia de ARIS en los dashboards se pidió «un modelo mucho mejor». Se repitió la comparación midiendo contra lo **despachado** (la venta real) y en tres niveles: el detalle (vendedor×producto×día), lo de cada vendedor en el día y el total del equipo en el día, que es lo que usa la saca.

## Comparación

`scripts/train_demand_model.py` con los CSV de DESPACHO (2026-01-02 a 2026-09-07, 9 vendedores con al menos 100 días). La validación es hacia adelante: cada uno de los últimos 120 días se predice solo con lo conocido hasta 2 días antes (la proyección se hace el día anterior). El error es la suma de las diferencias absolutas sobre lo despachado (WAPE). El sesgo es la suma de lo predicho menos lo despachado, sobre lo despachado.

| Modelo | Vendedor×producto×día | Vendedor×día | Equipo×día | Sesgo |
|---|---|---|---|---|
| Mediana mismo día, 4 sem. (actual) | 56,0 % | 36,2 % | 22,8 % | −1,0 % |
| Mediana mismo día, 4 sem., sobre lo vendido | 55,5 % | 36,4 % | 23,0 % | −7,0 % |
| Promedio mismo día, 4 sem. | 58,5 % | 36,7 % | 23,6 % | +0,8 % |
| Suavizado exponencial mismo día (vida media 3 sem.) | 56,9 % | 34,9 % | 22,4 % | −1,0 % |
| Jerárquico: total del vendedor × mezcla de productos | 61,2 % | 35,6 % | 22,8 % | +0,3 % |
| Por cliente: si suele pedir ese día, su cantidad típica (4 sem.) | 58,0 % | 36,3 % | 21,9 % | +1,1 % |
| Combinado: por cliente + suavizado | 55,7 % | 34,8 % | 22,3 % | −6,0 % |
| Gradient boosting Poisson global (rezagos, mezcla, calendario, feriados) | 58,0 % | 37,7 % | 25,6 % | −9,4 % |
| Combinado: boosting + suavizado + mediana | 55,1 % | 35,1 % | 23,0 % | −5,8 % |

Una primera corrida mostró un combinado con 17 % en equipo×día: era una **fuga de datos** (el boosting quedaba entrenado con días del período de prueba). Se corrigió: el modelo se reentrena cada 28 días y nunca con días posteriores al que predice.

### Modelos preentrenados (sin entrenar, con nuestra historia como contexto)

`scripts/compare_foundation_models.py`, en el mismo backtest:

| Modelo | Vendedor×producto×día | Vendedor×día | Equipo×día | Sesgo |
|---|---|---|---|---|
| Chronos-Bolt small, por detalle | 62,3 % | 45,7 % | 31,8 % | −20,2 % |
| Chronos-Bolt small, total del vendedor × mezcla | 65,5 % | 41,0 % | 24,0 % | −2,7 % |
| Chronos-Bolt base, total del vendedor × mezcla | 63,5 % | 38,8 % | 23,0 % | −4,2 % |

Ninguno supera a la mediana: con 8 meses de historia diaria, un modelo genérico no tiene de dónde aprender más.

### Otros niveles

| Modelo | Equipo×semana | Tamaño×día (chica/mediana/grande, lo de la saca) |
|---|---|---|
| Mediana mismo día, 4 sem. (actual) | 15,3 % | 29,9 % |
| Por cliente (4 sem.) | 13,6 % | 29,9 % |
| Combinado: por cliente + suavizado | 14,3 % | 28,4 % |

## Hallazgos

- **Ningún modelo es «mucho mejor» con estos datos.** Las diferencias son de 1 a 2 puntos. El error del equipo por día ronda el 22 % y el de cada vendedor el 35 %.
- **Por qué el error no baja.** El 91 % de los pedidos se registra el mismo día de la entrega, así que no hay pedidos adelantados que aprovechar. El 65 % de las unidades viene de clientes regulares, pero el resto es irregular. Además, la Brasa que se despacha depende de lo que llega de granja (el rango), no solo de lo que se pidió.
- **La comparación de los dashboards.** La «proyección» histórica de ARIS es lo **pedido** (columna K), es decir, el pedido confirmado y no un pronóstico hecho antes. Por eso queda tan cerca de la venta real, y ningún modelo que prediga con días de anticipación puede igualarla.

## Decisión

Se mantiene la mediana del mismo día de la semana (ADR 0012): es igual de buena que las alternativas, se explica sola y no se entrena. Para mejorar de verdad hacen falta **datos nuevos**, no otro algoritmo:

- **Historia más larga:** no existe (antes todo era a mano), así que se acumula desde ahora en la app.
- **Pedidos adelantados de los clientes:** por ejemplo, el reporte de pedidos de tiendas («Proyección tiendas») ya trae los pedidos de mañana y pasado.
- **Demanda censurada:** los días en que faltó pollo, para no aprender ventas recortadas.

- **Las proyecciones de los vendedores guardadas en la app** (antes no se registraban): en unas semanas se podrá medir su error y combinarlas con el modelo, lo que suele mejorar a ambos.

Los scripts quedan para repetir la comparación cuando haya más datos.
