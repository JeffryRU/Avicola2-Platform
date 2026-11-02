"""Compatibilidad: el engine vive en app.shared.infrastructure.database.session."""

from app.shared.infrastructure.database.session import SessionLocal, engine, get_session

__all__ = ["SessionLocal", "engine", "get_session"]
