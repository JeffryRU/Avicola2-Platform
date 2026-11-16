# Tareas

Una tarea es un archivo `.md`. La carpeta en que está indica su estado:

| Carpeta | Estado |
|---|---|
| [`pendientes/`](pendientes/) | Por hacer |
| [`en-progreso/`](en-progreso/) | En curso |
| [`hechas/`](hechas/) | Terminadas |

Para cambiar el estado de una tarea, se mueve el archivo de carpeta (`git mv`).

## Cómo crear una tarea

1. Copia [`plantilla.md`](plantilla.md) en `pendientes/`.
2. Nómbrala `NNNN-titulo-corto.md`, donde `NNNN` es el siguiente número libre (por ejemplo, `0001-exportar-reporte-de-saca.md`). El número no cambia al mover el archivo.
3. Llena los campos. Si la tarea toma una decisión de arquitectura, regístrala también en un [ADR](../adr/).
