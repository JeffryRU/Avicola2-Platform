"""Entorno de Alembic: URL de DATABASE_URL y esquema/nombres de config/tables.yaml.

Funciona con cualquier motor soportado por app/shared/infrastructure/database/engine.py: el
esquema lógico de las tablas se traduce al físico del motor (o se omite si no usa esquemas).
"""

from logging.config import fileConfig

from alembic import context

import app.db.models  # registra las tablas ORM en la metadata
import app.planning.infrastructure.persistence.tables  # noqa: F401  (tablas de planificación)
from app.core.config import get_settings
from app.shared.infrastructure.database.engine import build_engine, ensure_schema, physical_schema
from app.shared.infrastructure.database.metadata import APP_SCHEMA, metadata

settings = get_settings()
config = context.config
config.set_main_option("sqlalchemy.url", settings.database_url.replace("%", "%%"))
SCHEMA = physical_schema(settings.database_url, APP_SCHEMA, settings.db_schema)

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = metadata


def _only_app_schema(name, type_, _parent_names) -> bool:
    """Autogenerate solo mira el esquema de la app (ignora n8n, auth, storage de Supabase...)."""
    if type_ == "schema":
        return name == SCHEMA
    return True


def run_migrations_offline() -> None:
    """Genera el SQL sin conectarse a la base."""
    context.configure(
        url=settings.database_url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
        include_schemas=True,
        version_table_schema=SCHEMA,
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Aplica las migraciones contra la base."""
    engine = build_engine(settings.database_url, APP_SCHEMA, settings.db_schema, pool_size=1)
    with engine.connect() as connection:
        ensure_schema(connection, settings.database_url, SCHEMA)
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            compare_type=True,
            include_schemas=SCHEMA is not None,
            include_name=_only_app_schema,
            version_table_schema=SCHEMA,
            render_as_batch=connection.dialect.name == "sqlite",
        )
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
