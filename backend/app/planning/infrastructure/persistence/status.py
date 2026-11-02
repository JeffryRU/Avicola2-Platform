"""Estado de la conexión: motor, base, esquema y si existen las tablas de la planificación."""

from pathlib import Path
from typing import Any

from sqlalchemy import inspect, text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.planning.infrastructure.persistence.tables import (
    products,
    projection_lines,
    projections,
    sellers,
)

PLANNING_TABLES = (sellers, products, projections, projection_lines)


class SqlStatusProbe:
    def __init__(self, session: Session, schema: str | None) -> None:
        self.session, self.schema = session, schema

    def status(self) -> dict[str, Any]:
        bind = self.session.get_bind()
        info: dict[str, Any] = {
            "database": False,
            "tables": False,
            "dialect": bind.dialect.name,
            # En SQLite solo el nombre del archivo: no se expone la ruta del servidor.
            "database_name": Path(bind.url.database or "memoria").name
            if bind.dialect.name == "sqlite"
            else bind.url.database,
            "schema": self.schema,
        }
        try:
            self.session.execute(text("SELECT 1"))
            info["database"] = True
            inspector = inspect(self.session.connection())
            info["tables"] = all(
                inspector.has_table(t.name, schema=self.schema) for t in PLANNING_TABLES
            )
        except SQLAlchemyError as exc:
            info["error"] = str(exc.__cause__ or exc).splitlines()[0]
        return info
