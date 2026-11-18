"""Lectura de la última corrida del modelo de demanda (para la API)."""

from datetime import UTC, date, datetime

from sqlalchemy import delete, insert, select
from sqlalchemy.orm import Session

from app.planning.domain.models import DailyUnits
from app.planning.infrastructure.demand_model import training
from app.planning.infrastructure.persistence.tables import settings as settings_table

# Ajuste con la fecha y hora (UTC, ISO) del último pedido de reentrenamiento.
TRAIN_REQUEST_KEY = "model_train_requested"


class SqlDemandModelStore:
    def __init__(self, session: Session) -> None:
        self.session = session

    def latest(self) -> dict | None:
        return training.latest(self.session)

    def request_training(self, by: str) -> None:
        now = datetime.now(UTC)
        t = settings_table
        self.session.execute(delete(t).where(t.c.key == TRAIN_REQUEST_KEY))
        self.session.execute(
            insert(t).values(
                key=TRAIN_REQUEST_KEY, value=now.isoformat(), updated_by=by, updated_at=now
            )
        )
        self.session.commit()

    def training_pending(self) -> bool:
        """Hay un pedido de reentrenamiento posterior a la última corrida."""
        t = settings_table
        requested = self.session.scalar(select(t.c.value).where(t.c.key == TRAIN_REQUEST_KEY))
        if not requested:
            return False
        latest = self.latest()
        if not latest:
            return True
        return datetime.fromisoformat(requested) > datetime.fromisoformat(latest["trained_at"])

    def predictions(
        self, model: str, date_from: date, date_to: date, seller: str | None
    ) -> list[DailyUnits]:
        found = training.stored_predictions(self.session, model, date_from, date_to, seller)
        return [DailyUnits(s, d, units) for s, d, units in found]
