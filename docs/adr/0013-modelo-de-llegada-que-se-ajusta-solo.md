# ADR 0013: el modelo de llegada se elige y se ajusta solo

## Contexto

El ADR 0011 dejó un suavizado exponencial con vida media fija de 7 días. Los modelos que usaban el peso promedio de la parvada quedaron apenas por delante, sin diferencia distinguible, y el formulario no capturaba ese peso. El negocio pidió registrar el peso promedio de la brasa chica, mediana y grande, usar el modelo que mejor funcione con ese dato y que el modelo mejore solo a medida que se llenan los datos.

## Decisión

1. **Se registra el peso.** El formulario de producción tiene un campo opcional por tipo: peso vivo promedio de la parvada (kg). Se guarda en `np_production_weights`. `cli historia` y `cli produccion` lo cargan de la columna «PESO PROMEDIO» del Excel (239 de 252 días lo traen).
2. **Los modelos compiten con cada dato nuevo** (`AdaptiveArrivalModel`). Cada vez que cambia la historia de producción se repite una validación hacia adelante sobre los últimos 28 días con registro (cada día se estima solo con los anteriores) y se usa el que menos falló:
   - suavizado exponencial con vida media 3, 7 y 14 días: así se ajusta solo ese parámetro;
   - híbrido con peso de la parvada: el suavizado más una corrección aprendida con árboles (gradient boosting) a partir del reparto reciente, el día de la semana y el peso de cada tipo. Compite cuando hay al menos 45 días con peso anotado y se reentrena con cada dato nuevo.
3. **No se guarda un modelo entrenado.** Con unos cientos de días el ajuste tarda unos 2 segundos; el resultado se recuerda en memoria mientras la historia no cambie.
4. **La app muestra cuál está en uso** y el error reciente de cada candidato (páginas «Pronóstico» y «Cálculo de saca»).

## Resultado con los datos reales (252 días, al 2 de noviembre)

Error por rango en los últimos 28 días:

| Modelo | Error |
|---|---|
| Suavizado, vida media 3 días (en uso) | 25,5 % |
| Híbrido con peso de la parvada | 25,7 % |
| Suavizado, vida media 7 días | 26,2 % |
| Suavizado, vida media 14 días | 27,4 % |

Repitiendo la elección en fechas anteriores, el ganador cambia: vida media 14 en mayo, 3 en julio y agosto, 14 a inicios de octubre, 3 en noviembre. El híbrido nunca ganó en esos cortes; quedó a 0,2 puntos en el último y a 1 punto en agosto. Hoy, entonces, anotar el peso todavía no cambia el pronóstico: el modelo con peso pasará a usarse cuando gane en la comprobación reciente.

## Consecuencias y límites

- El peso que se usa para estimar es el que se escriba en «Pronóstico» o, si no, el último anotado. Solo ayuda si se conoce antes de pedir a granja.
- La comprobación que se muestra es la misma con la que se eligió el modelo, así que su error queda algo optimista.
- Con 28 días, diferencias de décimas son ruido: el modelo en uso puede alternar entre candidatos casi iguales sin que el pronóstico cambie mucho.
- El backend ahora depende de scikit-learn.
- La calidad B sigue saliendo del suavizado exponencial en todos los casos.
