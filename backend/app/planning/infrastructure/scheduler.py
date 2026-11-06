"""Tareas periódicas dentro de la API: avisar quién no registró cuando pasa la hora de corte.

Corre en el proceso de la API (sin depender de n8n). Con varios workers cada uno revisa, pero
los avisos llevan clave de deduplicación por día, así que el resultado es el mismo.
"""

import asyncio
import contextlib
import logging
from collections.abc import AsyncIterator, Callable

from app.core.config import Settings
from app.planning.bootstrap import build_use_cases
from app.shared.infrastructure.database.session import SessionLocal

logger = logging.getLogger(__name__)


def check_missed_projections(settings: Settings) -> int:
    with SessionLocal() as session:
        return build_use_cases(session, settings).notify_missed_projections()


async def _every(seconds: int, job: Callable[[], int]) -> None:
    while True:
        await asyncio.sleep(seconds)
        try:
            await asyncio.to_thread(job)
        except Exception:
            # Un fallo (p. ej., la base no responde) no detiene la tarea: se reintenta luego.
            logger.exception("Falló la revisión de proyecciones sin registrar")


@contextlib.asynccontextmanager
async def periodic_tasks(settings: Settings) -> AsyncIterator[None]:
    """Arranca las tareas al iniciar la API y las detiene al apagarla."""
    seconds = settings.planning_scheduler_seconds
    task = None
    if seconds > 0:
        task = asyncio.create_task(_every(seconds, lambda: check_missed_projections(settings)))
        logger.info("Revisión de cortes cada %d s", seconds)
    try:
        yield
    finally:
        if task:
            task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await task
