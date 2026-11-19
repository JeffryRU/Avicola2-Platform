"""Tareas periódicas dentro de la API: avisar antes del corte a quien aún no registró y, cuando
pasa la hora de corte, quién no registró. También deja calculado el modelo de llegada (la saca
y el pronóstico) al arrancar y cada pocos minutos, para que nadie espere su ajuste en frío.

Corre en el proceso de la API (sin depender de n8n). Con varios workers cada uno revisa, pero
los avisos llevan clave de deduplicación por día, así que el resultado es el mismo.
"""

import asyncio
import contextlib
import logging
import time
from collections.abc import AsyncIterator, Callable
from datetime import datetime

from app.core.config import Settings
from app.planning.bootstrap import build_use_cases
from app.planning.domain.models import Seller
from app.planning.domain.permissions import GENERAL_SUPERVISOR
from app.planning.infrastructure.clock import ZoneClock
from app.planning.infrastructure.demand_model import training
from app.planning.infrastructure.demand_model.store import SqlDemandModelStore
from app.planning.infrastructure.http.saca_view import saca_out
from app.planning.infrastructure.persistence.repositories import SqlProductRepository
from app.shared.infrastructure.database.session import SessionLocal

logger = logging.getLogger(__name__)
# Quien figura como autor de la saca guardada al cierre.
SYSTEM_USER = "sistema"
# Ventana del reentrenamiento diario del modelo de demanda (horas desde MODEL_TRAIN_HOUR).
TRAIN_WINDOW_HOURS = 3
# Cada cuánto se vuelve a precalentar la saca (si la historia no cambió, es casi gratis).
WARM_EVERY_SECONDS = 300
_warmed_at = 0.0


def check_missed_projections(settings: Settings) -> int:
    with SessionLocal() as session:
        return build_use_cases(session, settings).notify_missed_projections()


def check_closing_soon(settings: Settings) -> int:
    with SessionLocal() as session:
        return build_use_cases(session, settings).notify_closing_soon()


def snapshot_saca(settings: Settings) -> int:
    """Desde SACA_SNAPSHOT_HOUR, guarda la saca del día como la del cierre (una vez por día;
    si alguien la vuelve a ver después, se actualiza con lo último)."""
    clock = ZoneClock(settings.tz)
    now = clock.now()
    if now.hour < settings.saca_snapshot_hour:
        return 0
    with SessionLocal() as session:
        use_cases = build_use_cases(session, settings)
        today = clock.today()
        system = Seller(SYSTEM_USER, "Sistema", None, GENERAL_SUPERVISOR)
        saved = use_cases.saca_history.snapshots.get(today)
        closing = now.replace(hour=settings.saca_snapshot_hour, minute=0, second=0, microsecond=0)
        if saved and saved.saved_at >= closing:
            return 0
        plan = use_cases.calculate_saca(system, today)
        use_cases.saca_history.record(system, plan, saca_out(plan).model_dump_json())
        logger.info("Saca del %s guardada al cierre: %d aves", today, plan.farm_order)
        return 1


def train_demand_model(settings: Settings) -> int:
    """Reentrena el modelo de demanda fuera de las peticiones (en el hilo del programador):
    en cuanto alguien sube datos nuevos de ARIS, o si no, una vez por día de madrugada."""
    if not settings.model_train_enabled:
        return 0
    clock = ZoneClock(settings.tz)
    now = clock.now()
    with SessionLocal() as session:
        store = SqlDemandModelStore(session)
        products = SqlProductRepository(session).list_active()
        if store.training_pending():
            logger.info("Reentrenando el modelo de demanda: llegaron datos nuevos de ARIS")
            training.train(session, products)
            return 1
        # Si no, solo de madrugada (3 horas desde MODEL_TRAIN_HOUR): nunca en horario de uso,
        # aunque se despliegue de día y no haya corrida de hoy.
        hour = settings.model_train_hour
        if not hour <= now.hour < hour + TRAIN_WINDOW_HOURS:
            return 0
        last = training.latest(session)
        if (
            last
            and datetime.fromisoformat(last["trained_at"]).astimezone(now.tzinfo).date()
            == now.date()
        ):
            return 0
        return 1 if training.train(session, products) else 0


def warm_saca(settings: Settings, force: bool = False) -> int:
    """Calcula la saca de hoy para dejar ajustado el modelo de llegada en este proceso: en frío
    tarda decenas de segundos (compiten varios modelos) y no debe pagarlo quien abre la pantalla.
    Siempre devuelve 0 (no es un aviso)."""
    global _warmed_at  # noqa: PLW0603 (marca de tiempo por proceso)
    if not force and time.monotonic() - _warmed_at < WARM_EVERY_SECONDS:
        return 0
    _warmed_at = time.monotonic()
    started = time.perf_counter()
    try:
        with SessionLocal() as session:
            system = Seller(SYSTEM_USER, "Sistema", None, GENERAL_SUPERVISOR)
            build_use_cases(session, settings).calculate_saca(
                system, ZoneClock(settings.tz).today()
            )
    except Exception:
        logger.exception("No se pudo precalentar la saca")
        return 0
    logger.info("Saca precalentada en %.1f s", time.perf_counter() - started)
    return 0


def check_cutoffs(settings: Settings) -> int:
    """Una revisión completa: aviso previo al corte, aviso de corte pasado y saca del cierre."""
    return (
        check_closing_soon(settings)
        + check_missed_projections(settings)
        + snapshot_saca(settings)
        + train_demand_model(settings)
        + warm_saca(settings)
    )


async def _every(seconds: int, job: Callable[[], int]) -> None:
    while True:
        await asyncio.sleep(seconds)
        try:
            await asyncio.to_thread(job)
        except Exception:
            # Un fallo (p. ej., la base no responde) no detiene la tarea: se reintenta luego.
            logger.exception("Falló la revisión de cortes")


@contextlib.asynccontextmanager
async def periodic_tasks(settings: Settings) -> AsyncIterator[None]:
    """Arranca las tareas al iniciar la API y las detiene al apagarla."""
    seconds = settings.planning_scheduler_seconds
    task = None
    warm = None
    if seconds > 0:
        task = asyncio.create_task(_every(seconds, lambda: check_cutoffs(settings)))
        logger.info("Revisión de cortes cada %d s", seconds)
        # Al arrancar (sin esperar al primer ciclo), en segundo plano: la API ya atiende.
        warm = asyncio.create_task(asyncio.to_thread(warm_saca, settings, True))
    try:
        yield
    finally:
        for running in (task, warm):
            if running:
                running.cancel()
                with contextlib.suppress(asyncio.CancelledError):
                    await running
