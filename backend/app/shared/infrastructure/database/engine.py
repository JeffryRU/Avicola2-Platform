"""Engine de SQLAlchemy independiente del motor: el motor sale de DATABASE_URL.

Cada motor soportado tiene un perfil con sus diferencias (argumentos de conexión, soporte de
esquemas, cómo crear un esquema). Para sumar un motor basta con agregar un perfil.
"""

from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Any

from sqlalchemy import Connection, Engine, create_engine, make_url, text
from sqlalchemy.pool import StaticPool


@dataclass(frozen=True)
class DialectProfile:
    connect_args: dict[str, Any] = field(default_factory=dict)
    supports_schemas: bool = True
    create_schema_sql: Callable[[str], str] | None = None


PROFILES: dict[str, DialectProfile] = {
    # Supabase / Postgres
    "postgresql+psycopg": DialectProfile(
        connect_args={"connect_timeout": 10},
        create_schema_sql=lambda s: f'CREATE SCHEMA IF NOT EXISTS "{s}"',
    ),
    # Azure SQL / SQL Server
    "mssql+pymssql": DialectProfile(
        connect_args={"login_timeout": 15, "timeout": 30},
        create_schema_sql=lambda s: f"IF SCHEMA_ID(N'{s}') IS NULL EXEC('CREATE SCHEMA [{s}]')",
    ),
    "mssql+pyodbc": DialectProfile(
        connect_args={"timeout": 15},
        create_schema_sql=lambda s: f"IF SCHEMA_ID(N'{s}') IS NULL EXEC('CREATE SCHEMA [{s}]')",
    ),
    # En MySQL un esquema es otra base: las tablas van a la base de la URL.
    "mysql+pymysql": DialectProfile(connect_args={"connect_timeout": 10}, supports_schemas=False),
    # Pruebas y modo demo (sqlite:// = en memoria)
    "sqlite": DialectProfile(connect_args={"check_same_thread": False}, supports_schemas=False),
}


def profile_for(url: str) -> DialectProfile:
    """Perfil del motor de la URL (por driver exacto o, si no, por motor)."""
    u = make_url(url)
    return PROFILES.get(u.drivername) or PROFILES.get(u.get_backend_name()) or DialectProfile()


def physical_schema(url: str, logical: str, override: str | None) -> str | None:
    """Esquema real donde viven las tablas (None si el motor no usa esquemas)."""
    if not profile_for(url).supports_schemas:
        return None
    return override or logical


def build_engine(
    url: str, logical_schema: str, schema_override: str | None, pool_size: int
) -> Engine:
    """Crea el engine y traduce el esquema lógico de las tablas al físico del motor."""
    profile = profile_for(url)
    u = make_url(url)
    kwargs: dict[str, Any] = {"pool_pre_ping": True, "connect_args": profile.connect_args}
    if u.get_backend_name() == "sqlite":
        if u.database in (None, "", ":memory:"):
            kwargs["poolclass"] = StaticPool  # una sola base en memoria para toda la app
    else:
        kwargs |= {"pool_size": pool_size, "max_overflow": 2}
    engine = create_engine(url, **kwargs)
    target = physical_schema(url, logical_schema, schema_override)
    if target != logical_schema:
        engine = engine.execution_options(schema_translate_map={logical_schema: target})
    return engine


def ensure_schema(connection: Connection, url: str, schema: str | None) -> None:
    """Crea el esquema si el motor lo necesita (lo usa Alembic antes de migrar)."""
    profile = profile_for(url)
    if schema and profile.create_schema_sql:
        connection.execute(text(profile.create_schema_sql(schema)))
        connection.commit()
