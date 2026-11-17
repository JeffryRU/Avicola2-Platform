# ADR 0020: un modelo de demanda por uso, entrenado en la app

## Contexto

El ADR 0019 mostró que, con unos 8 meses de historia de ARIS, ningún modelo único es el mejor en todo. `notebooks/modelo_demanda.ipynb` lo amplió con las prácticas recomendadas para pocos datos:

- División temporal 70/15/15.
- Métodos para demanda intermitente (SBA, TSB).
- Boosting global con pérdida Poisson.
- Aumento de datos (masking y Moving Block Bootstrap).
- Modelo por cliente.
- Reconciliación jerárquica MinT.
- Combinación robusta.
- Maestro → alumno: destilación y apilado.

Se midió en validación + prueba (63 días que el modelo no vio). Ningún modelo ganó en todos los niveles.

## Decisión

Un modelo por uso, elegido con validación + prueba:

| Uso | Nivel | Modelo | Error | Antes (mediana) |
|---|---|---|---|---|
| Sugerencia de «Nueva proyección» y línea «Modelo» | vendedor × día | Combinación robusta (promedio de mediana, suavizado, TSB, SBA, boosting y por cliente) | 32,6 % | 35,0 % |
| Saca por tamaño | tamaño × día | Alumno destilado (los 9 vendedores principales aprenden de un maestro con las 16 series de ARIS) | 24,9 % | 27,3 % |
| Planificación semanal | equipo × semana | Alumno apilado (la predicción del maestro es una variable más) | 8,7 % | 13,0 % |

- **Dónde está:** el código está en `backend/app/planning/infrastructure/demand_model/` y es el mismo del notebook.
- **Entrenamiento:** lo hace `cli entrenar`, o el programador una vez por día desde `MODEL_TRAIN_HOUR` (02:00). Corre en su hilo, **nunca dentro de una petición HTTP**. Toma unos 11 segundos con la historia completa.
- **Por qué no `ml-train`:** el contenedor que preveía la arquitectura no existe todavía, y un entrenamiento de segundos no lo justifica.
- **Qué se guarda:** solo la última corrida (`np_model_runs`): la división, el error de cada modelo por nivel y lo predicho frente a lo real por día. También sus predicciones (`np_model_predictions`), las de los días evaluados y las de los 2 días siguientes al último dato.
- **Uso en la app:** la sugerencia usa el modelo cuando ya pronosticó esos días; si no, la mediana de 4 semanas (ADR 0012). La pantalla «Modelo de demanda», solo para supervisión, muestra las métricas, la división y el gráfico.

## Consecuencias

- **Las mejoras son de 1 a 4 puntos**, salvo en el nivel semanal (13,0 % → 8,7 %). Con más semanas de historia, las proyecciones de los vendedores guardadas en la app y los pedidos adelantados de tiendas, el reentrenamiento diario las irá mejorando solo.
- **Sin historia reciente de ARIS, el pronóstico de los próximos días no existe.** Si el último dato es de hace meses, no hay forma de pronosticar hoy, y la sugerencia sigue con la mediana.
- **Para repetir la comparación:** `notebooks/modelo_demanda.ipynb`, `scripts/train_demand_model.py` y `scripts/tune_demand_model.py`.
