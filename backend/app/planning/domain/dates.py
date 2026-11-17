"""Reglas de fechas que comparten varios casos de uso de la planificación (Python puro)."""

from datetime import date, timedelta

from app.shared.domain.errors import DomainError

# Rango máximo de una consulta (proyecciones, ventas, historial, stock, producción).
MAX_RANGE_DAYS = 800


def check_order(date_from: date, date_to: date) -> None:
    """El rango no puede terminar antes de empezar (un solo día sí vale)."""
    if date_to < date_from:
        raise DomainError("El rango de fechas está invertido.")


def check_range(date_from: date, date_to: date) -> None:
    """Rango de una consulta: en orden y de hasta MAX_RANGE_DAYS días entre sus extremos."""
    check_order(date_from, date_to)
    if (date_to - date_from).days > MAX_RANGE_DAYS:
        raise DomainError(f"El rango no puede superar {MAX_RANGE_DAYS} días.")


def check_recent_day(day: date, today: date, back_days: int, subject: str) -> None:
    """Registro de algo que ya pasó (stock, producción): de hoy o de hasta `back_days` días atrás.

    Nunca de días futuros. `subject` nombra lo que se registra («el stock»).
    """
    if day > today:
        raise DomainError(f"No se puede registrar {subject} de un día que aún no llega.")
    if day < today - timedelta(days=back_days):
        raise DomainError(
            f"Solo se puede registrar o corregir {subject} de los últimos {back_days} días."
        )
