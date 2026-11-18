"""Datos de ARIS: hasta qué día llegan y la carga de un export nuevo.

ARIS es la fuente de la venta real (lo despachado a cada vendedor y cliente): es lo que aprende
el modelo de demanda. Subirlo no es obligatorio; la app solo avisa cuando faltan días, y tras
cada carga pide al programador que reentrene el modelo (nunca dentro de la petición).
"""

from dataclasses import dataclass
from datetime import date, timedelta

from app.planning.application.ports import ArisData, ArisLoad, Clock, DemandModelStore
from app.planning.domain.models import Seller
from app.planning.domain.permissions import Permission, require
from app.shared.domain.errors import DomainError

OK, INFO, WARNING = "ok", "info", "warning"


@dataclass(frozen=True)
class ArisStatus:
    last_dispatch: date | None
    last_sales: date | None
    # Días completos sin datos de despacho (hasta ayer: hoy todavía se está despachando).
    missing_days: int
    level: str  # ok | info (falta un día o pocos) | warning (varios días)
    training_pending: bool


def missing_days(last: date | None, today: date) -> int:
    yesterday = today - timedelta(days=1)
    if last is None:
        return 0
    return max(0, (yesterday - last).days)


def level_for(last: date | None, missing: int, warn_days: int) -> str:
    if last is None:
        return WARNING
    if missing == 0:
        return OK
    return WARNING if missing >= warn_days else INFO


class GetArisStatus:
    def __init__(self, data: ArisData, model: DemandModelStore, clock: Clock, warn_days: int):
        self.data, self.model, self.clock, self.warn_days = data, model, clock, warn_days

    def __call__(self, viewer: Seller) -> ArisStatus:
        require(viewer.role, Permission.LOAD_ARIS)
        last_dispatch, last_sales = self.data.coverage()
        missing = missing_days(last_dispatch, self.clock.today())
        return ArisStatus(
            last_dispatch,
            last_sales,
            missing,
            level_for(last_dispatch, missing, self.warn_days),
            self.model.training_pending(),
        )


class ImportArisData:
    def __init__(self, data: ArisData, model: DemandModelStore):
        self.data, self.model = data, model

    def __call__(self, actor: Seller, content: bytes, filename: str) -> list[ArisLoad]:
        require(actor.role, Permission.LOAD_ARIS)
        if not content:
            raise DomainError("El archivo está vacío.")
        loaded = self.data.load(content, filename)
        # Con datos nuevos, el programador reentrena en cuanto pueda (no en esta petición).
        self.model.request_training(actor.username)
        return loaded
