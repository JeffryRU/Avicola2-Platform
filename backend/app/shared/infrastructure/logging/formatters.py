"""Formatos de salida: texto legible (local) o una línea JSON por evento (nube)."""

import json
import logging
from datetime import UTC, datetime

TEXT_FORMAT = "%(asctime)s %(levelname)-8s [%(request_id)s] %(name)s: %(message)s"
# Atributos estándar de LogRecord; el resto son campos pasados con `extra=`.
_STANDARD = set(vars(logging.makeLogRecord({}))) | {
    "message",
    "asctime",
    "request_id",
    "color_message",  # uvicorn: copia del mensaje con colores ANSI
}


def _extra(record: logging.LogRecord) -> dict[str, object]:
    return {k: v for k, v in vars(record).items() if k not in _STANDARD}


class TextFormatter(logging.Formatter):
    def __init__(self) -> None:
        super().__init__(TEXT_FORMAT)

    def format(self, record: logging.LogRecord) -> str:
        line = super().format(record)
        extra = _extra(record)
        if not extra:
            return line
        first, *rest = line.split("\n", 1)
        fields = " ".join(f"{k}={v}" for k, v in extra.items())
        return "\n".join([f"{first} | {fields}", *rest])


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        entry: dict[str, object] = {
            "time": datetime.fromtimestamp(record.created, UTC).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "request_id": getattr(record, "request_id", "-"),
            "message": record.getMessage(),
            **_extra(record),
        }
        if record.exc_info:
            entry["exception"] = self.formatException(record.exc_info)
        return json.dumps(entry, ensure_ascii=False, default=str)


FORMATTERS: dict[str, type[logging.Formatter]] = {"text": TextFormatter, "json": JsonFormatter}
