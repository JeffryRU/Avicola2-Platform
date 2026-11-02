"""Id de la petición en curso, para unir todas las líneas de log de una misma petición."""

import logging
from contextvars import ContextVar

NO_REQUEST = "-"
request_id: ContextVar[str] = ContextVar("request_id", default=NO_REQUEST)


class RequestIdFilter(logging.Filter):
    """Agrega `record.request_id` a cada línea (o "-" fuera de una petición)."""

    def filter(self, record: logging.LogRecord) -> bool:
        record.request_id = request_id.get()
        return True
