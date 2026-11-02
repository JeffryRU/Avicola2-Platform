"""MetaData compartida por todas las tablas de la app (ORM y Core)."""

from sqlalchemy import MetaData
from sqlalchemy.orm import DeclarativeBase

from app.shared.infrastructure.database.tables import get_table_names

TABLES = get_table_names()
APP_SCHEMA = TABLES.schema_

# Convención de nombres para que Alembic genere nombres de restricciones estables.
metadata = MetaData(
    schema=APP_SCHEMA,
    naming_convention={
        "ix": "ix_%(column_0_label)s",
        "uq": "uq_%(table_name)s_%(column_0_name)s",
        "ck": "ck_%(table_name)s_%(constraint_name)s",
        "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
        "pk": "pk_%(table_name)s",
    },
)


class Base(DeclarativeBase):
    """Base declarativa de los modelos ORM."""

    metadata = metadata
