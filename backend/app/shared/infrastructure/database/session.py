"""Engine único de la app y sesiones por petición."""

from collections.abc import Iterator

from sqlalchemy.orm import Session, sessionmaker

from app.core.config import get_settings
from app.shared.infrastructure.database.engine import build_engine
from app.shared.infrastructure.database.metadata import APP_SCHEMA

_settings = get_settings()
engine = build_engine(
    _settings.database_url, APP_SCHEMA, _settings.db_schema, _settings.db_pool_size
)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def get_session() -> Iterator[Session]:
    """Dependencia de FastAPI: abre una sesión por petición."""
    with SessionLocal() as session:
        yield session
