"""Engine de SQLAlchemy independiente del motor: el motor sale de DATABASE_URL.

Cada motor soportado tiene un perfil con sus diferencias (argumentos de conexión, soporte de
esquemas, cómo crear un esquema). Para sumar un motor basta con agregar un perfil.
"""

import logging
import time
from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Any

from sqlalchemy import Connection, Engine, create_engine, event, make_url, text
from sqlalchemy.pool import StaticPool

logger = logging.getLogger(__name__)


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
    url: str,
    logical_schema: str,
    schema_override: str | None,
    pool_size: int,
    max_overflow: int = 2,
    pool_timeout: float = 30,
) -> Engine:
    """Crea el engine y traduce el esquema lógico de las tablas al físico del motor.

    Conexiones máximas = pool_size + max_overflow. Con Supabase (pooler en modo sesión) cada una
    ocupa una conexión real: el total no debe superar el "Pool Size" del pooler del proyecto.
    pool_timeout es cuánto espera una petición por una conexión libre antes de fallar.
    """
    profile = profile_for(url)
    u = make_url(url)
    kwargs: dict[str, Any] = {"pool_pre_ping": True, "connect_args": profile.connect_args}
    if u.get_backend_name() == "sqlite":
        if u.database in (None, "", ":memory:"):
            kwargs["poolclass"] = StaticPool  # una sola base en memoria para toda la app
    else:
        kwargs |= {
            "pool_size": pool_size,
            "max_overflow": max_overflow,
            "pool_timeout": pool_timeout,
        }
    engine = create_engine(url, **kwargs)
    _log_new_connections(engine)
    target = physical_schema(url, logical_schema, schema_override)
    if target != logical_schema:
        engine = engine.execution_options(schema_translate_map={logical_schema: target})
    return engine


def _log_new_connections(engine: Engine) -> None:
    """Registra cada conexión física nueva y cuánto tardó en abrirse. Con el pooler de Supabase
    abrir una conexión cuesta de 0.5 a 2 s: si aparecen muchas, el pool es chico o se recicla."""

    @event.listens_for(engine, "do_connect")
    def _start(_dialect, conn_rec, _cargs, _cparams):
        conn_rec.info["connect_started"] = time.perf_counter()

    @event.listens_for(engine, "connect")
    def _done(_dbapi_conn, conn_rec):
        started = conn_rec.info.pop("connect_started", None)
        if started is not None:
            ms = (time.perf_counter() - started) * 1000
            pool = engine.pool
            logger.info("Nueva conexión a la base en %.0f ms (pool: %s)", ms, pool.status())


def ensure_schema(connection: Connection, url: str, schema: str | None) -> None:
    """Crea el esquema si el motor lo necesita (lo usa Alembic antes de migrar)."""
    profile = profile_for(url)
    if schema and profile.create_schema_sql:
        connection.execute(text(profile.create_schema_sql(schema)))
        connection.commit()
