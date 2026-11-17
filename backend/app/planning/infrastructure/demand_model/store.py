"""Lectura de la última corrida del modelo de demanda (para la API)."""

from datetime import date

from sqlalchemy.orm import Session

from app.planning.domain.models import DailyUnits
from app.planning.infrastructure.demand_model import training


class SqlDemandModelStore:
    def __init__(self, session: Session) -> None:
        self.session = session

    def latest(self) -> dict | None:
        return training.latest(self.session)

    def predictions(
        self, model: str, date_from: date, date_to: date, seller: str | None
    ) -> list[DailyUnits]:
        found = training.stored_predictions(self.session, model, date_from, date_to, seller)
        return [DailyUnits(s, d, units) for s, d, units in found]
