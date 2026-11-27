# ADR 0011 — Modelo de llegada por rango: suavizado exponencial

- **Estado:** aceptado
- **Fecha:** 2026-11-11

## Contexto

- A granja se pide por tipo (brasa chica, mediana, grande) y casi todo en un rango: B2, B5/B6 y B7/B8. Las aves llegan repartidas entre los diez rangos (B0–B9).
- El total diario casi siempre cuadra (0,5 % de diferencia). Lo que no cuadra es el rango: suponer que llega lo pedido da 79,9 % de error por rango.
- El vendedor necesita saber cuánta Brasa 3 o Brasa 8 habrá de verdad, no cuánto se pidió.
- Datos: hoja `DB_CALIDA_B` del Excel del negocio, 239 días útiles del 28/12/2025 al 02/11/2026. El Excel no va al repositorio.

## Cómo se comparó

- **Tarea:** para el día *t* se conoce lo pedido por tipo y toda la historia anterior; se estiman las aves producidas por rango.
- **Validación hacia adelante:** cada día se predice solo con días anteriores. Los primeros 60 días son solo historia; se evalúan 179.
- **Métrica:** WAPE por rango y día (suma de errores absolutos entre suma de lo producido).
- **Script:** `scripts/compare_production_models.py <excel> [salida.json]` (requiere pandas, openpyxl y scikit-learn; no son dependencias del backend).

## Resultados

| Modelo | Error por rango | Por tipo |
|---|---|---|
| Híbrido: suavizado + gradient boosting sobre el error, con peso de la parvada | 27,9 % | 17,1 % |
| Random forest + peso de la parvada | 28,2 % | 16,6 % |
| **Suavizado exponencial, vida media 7 días (elegido)** | **28,8 %** | 17,7 % |
| Histórico, últimos 7 días | 29,2 % | 17,9 % |
| Gradient boosting + peso de la parvada | 29,6 % | 18,3 % |
| Suavizado exponencial, vida media 14 días | 29,7 % | 17,9 % |
| Histórico, últimos 14 días | 30,1 % | 18,5 % |
| Random forest | 30,4 % | 17,9 % |
| Extra trees | 30,6 % | 18,5 % |
| Mediana diaria, últimos 28 días | 30,7 % | 19,3 % |
| Histórico, últimos 28 días | 30,8 % | 19,1 % |
| Suavizado exponencial, vida media 28 días | 31,3 % | 18,6 % |
| Gradient boosting | 31,4 % | 18,9 % |
| Histórico, últimos 56 días | 31,8 % | 19,2 % |
| Vecinos cercanos (k = 10) | 32,2 % | 16,4 % |
| Árbol de decisión | 32,5 % | 18,6 % |
| Mismo día de la semana (8 semanas) | 32,7 % | 19,9 % |
| Regresión Ridge | 34,7 % | 23,5 % |
| Histórico, toda la historia | 37,4 % | 20,8 % |
| Sin modelo: llega lo pedido | 79,9 % | 20,6 % |

## Decisión

Se implementa el **suavizado exponencial con vida media de 7 días** (`domain/production.py`, `estimate_arrival`), aunque dos modelos de ML lo superan por menos de un punto:

- **La ventaja no es distinguible del ruido.** Remuestreo por días (4 000 repeticiones): el híbrido mejora 0,9 puntos, con intervalo de confianza al 95 % de −2,0 a +0,2; el random forest, 0,5 puntos (−1,7 a +0,6). Los dos intervalos incluyen el cero. Ganan el 55 % de los días.
- **Depende de un dato que el sistema no recoge.** Toda la ventaja viene del peso promedio de la parvada. El mismo híbrido sin ese dato da 29,2 %, peor que el suavizado.
- **Con menos historia son peores.** En la primera mitad del período el híbrido da 32,7 % contra 32,1 % del suavizado; en la segunda, 24,3 % contra 26,3 %. Mejora cuando hay más datos.
- **Costo.** El suavizado no tiene pesos que guardar ni reentrenar: se recalcula con los últimos 60 días registrados. Un modelo de árboles exigiría scikit-learn en el backend, un archivo de modelo y un proceso de reentrenamiento.
- **Estabilidad.** Con vida media de 2 a 7 días el error va de 28,5 % a 28,8 %: el parámetro no está ajustado a un valor casual.

El modelo implementado, validado sobre los datos importados con el mismo procedimiento, reproduce el 28,8 %.

## Cuándo revisarla

- Si el formulario de producción empieza a registrar el **peso promedio de la parvada** por tipo (y ese dato se conoce antes de pedir), repetir la comparación: es la única vía por la que un modelo de ML mejoró.
- Con un año o más de producción registrada, repetirla: la segunda mitad del período sugiere que los modelos de ML mejoran con más datos.
- El caso de uso depende de `estimate_arrival`, una función pura: cambiarla no toca la API ni las pantallas.

## Alcance

No predice la demanda de los clientes. Eso depende de los pedidos de ARIS y de la equivalencia entre sus materiales y el catálogo.

> Actualización: el [ADR 0013](0013-modelo-de-llegada-que-se-ajusta-solo.md) reemplaza la vida media fija por un modelo que se elige solo y registra el peso de la parvada.
