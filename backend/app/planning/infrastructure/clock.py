"""Reloj en la zona horaria del negocio."""

from datetime import date, datetime
from zoneinfo import ZoneInfo


class ZoneClock:
    def __init__(self, tz: str) -> None:
        self.tz = ZoneInfo(tz)

    def now(self) -> datetime:
        return datetime.now(self.tz)

    def today(self) -> date:
        return self.now().date()
