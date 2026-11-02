"""Configura el logger raíz: consola + archivos rotativos en la carpeta de logs.

- `app.log`:    todo desde LOG_LEVEL (peticiones, cargas, avisos, errores).
- `errors.log`: solo ERROR y CRITICAL, con su traza; lo primero que revisar ante una falla.
- `frontend.log`: errores que reporta la PWA desde el navegador (POST /api/client-logs).

app.log y errors.log son solo del backend; lo del navegador va aparte en frontend.log.
"""

import logging
import sys
from logging.handlers import RotatingFileHandler
from pathlib import Path

from app.core.config import Settings
from app.shared.infrastructure.logging.context import RequestIdFilter
from app.shared.infrastructure.logging.formatters import FORMATTERS

APP_LOG = "app.log"
ERROR_LOG = "errors.log"
FRONTEND_LOG = "frontend.log"
# Logger de los reportes del navegador (ver client.py).
CLIENT_LOGGER = "app.client"
# Uvicorn trae sus propios handlers: se quitan para que pase todo por los de aquí.
UVICORN_LOGGERS = ("uvicorn", "uvicorn.error")
# El middleware ya registra cada petición (con id y duración); el access log se duplicaría.
SILENCED = ("uvicorn.access",)
# Librerías muy verbosas en INFO.
QUIET = ("httpx", "httpcore", "urllib3", "botocore", "google", "numba", "alembic.runtime")


# Handlers creados aquí: al reconfigurar se reemplazan en vez de duplicarse.
_installed: list[logging.Handler] = []


class _Exclude(logging.Filter):
    """Lo contrario de logging.Filter(name): deja pasar todo menos `name` y sus hijos."""

    def filter(self, record: logging.LogRecord) -> bool:
        return not super().filter(record)


def _handler(
    handler: logging.Handler, fmt: str, level: int, only: logging.Filter | None = None
) -> logging.Handler:
    handler.setLevel(level)
    if only is not None:
        handler.addFilter(only)
    handler.setFormatter(FORMATTERS[fmt]())
    handler.addFilter(RequestIdFilter())
    return handler


def _file_handlers(log_dir: Path, fmt: str, max_mb: int, backups: int) -> list[logging.Handler]:
    log_dir.mkdir(parents=True, exist_ok=True)
    size = max_mb * 1024 * 1024
    files = (
        (APP_LOG, logging.NOTSET, _Exclude(CLIENT_LOGGER)),
        (ERROR_LOG, logging.ERROR, _Exclude(CLIENT_LOGGER)),
        (FRONTEND_LOG, logging.NOTSET, logging.Filter(CLIENT_LOGGER)),
    )
    return [
        _handler(
            RotatingFileHandler(
                log_dir / name, maxBytes=size, backupCount=backups, encoding="utf-8"
            ),
            fmt,
            level,
            only,
        )
        for name, level, only in files
    ]


def configure_logging(
    level: str = "INFO",
    fmt: str = "text",
    log_dir: Path | None = None,
    max_mb: int = 10,
    backups: int = 5,
) -> None:
    """Configura los logs. Sin `log_dir` solo escribe en consola (tests, contenedores efímeros)."""
    if fmt not in FORMATTERS:
        raise ValueError(f"LOG_FORMAT debe ser uno de {sorted(FORMATTERS)}: {fmt!r}")
    root = logging.getLogger()
    root.setLevel(level.upper())
    for old in _installed:
        root.removeHandler(old)
        old.close()
    _installed.clear()

    handlers = [_handler(logging.StreamHandler(sys.stderr), fmt, logging.NOTSET)]
    file_error: OSError | None = None
    if log_dir is not None:
        try:
            handlers += _file_handlers(log_dir, fmt, max_mb, backups)
        except OSError as exc:
            # Sin permiso o sin disco: la API sigue funcionando y registra en consola.
            file_error = exc
    for handler in handlers:
        root.addHandler(handler)
    _installed.extend(handlers)
    if file_error is not None:
        logging.getLogger(__name__).warning(
            "No se pudo escribir en la carpeta de logs %s (%s); solo consola.", log_dir, file_error
        )

    for name in UVICORN_LOGGERS:
        logger = logging.getLogger(name)
        logger.handlers.clear()
        logger.propagate = True
    for name in SILENCED:
        logging.getLogger(name).disabled = True
    for name in QUIET:
        logging.getLogger(name).setLevel(logging.WARNING)


def configure_from_settings(settings: Settings) -> None:
    """Configura los logs con los valores de `.env` (LOG_*)."""
    configure_logging(
        settings.log_level,
        settings.log_format,
        settings.log_dir if settings.log_to_files else None,
        settings.log_max_mb,
        settings.log_backups,
    )
