"""Ayudas para escribir migraciones de Alembic que sirvan en cualquier motor.

El esquema físico lo decide env.py (None en motores sin esquemas, como SQLite): las migraciones
usan `app_schema()` y `ref()` en lugar de escribir "app" a mano.
"""

from alembic import op


def app_schema() -> str | None:
    """Esquema físico de las tablas de la app en esta migración."""
    return op.get_context().version_table_schema


def ref(table: str, column: str = "id") -> str:
    """Columna referenciada por una ForeignKey, con esquema si el motor lo usa."""
    schema = app_schema()
    return f"{schema}.{table}.{column}" if schema else f"{table}.{column}"
