"""Cálculo de saca: cuánto pedir a granja para un día (Python puro).

Regla (ver docs/assumptions.md): por producto,

    pedir = max(proyección, pedidos confirmados) − stock de despacho      (nunca menos de 0)

- La proyección ya estima lo que se va a pedir: sumarla a los pedidos contaría lo mismo dos veces.
  Se toma el mayor: si los pedidos superan lo proyectado mandan los pedidos; si aún no llegaron,
  manda la proyección.
- El stock es lo que quedó en despacho: lo último registrado antes del día, si es reciente.
"""

from dataclasses import dataclass
from datetime import date, timedelta

from app.planning.domain.models import Product

# El stock de hace más días ya no representa lo que hay en despacho: no se descuenta.
STOCK_MAX_AGE_DAYS = 3


@dataclass(frozen=True)
class SacaLine:
    product: Product
    projected: int
    ordered: int
    stock: int

    @property
    def demand(self) -> int:
        return max(self.projected, self.ordered)

    @property
    def request(self) -> int:
        return max(0, self.demand - self.stock)

    @property
    def request_kg(self) -> float:
        return self.product.kg(self.request)


@dataclass(frozen=True)
class SacaPlan:
    """Lo que hay que pedir a granja para `date`, por producto, y con qué datos se calculó."""

    date: date
    lines: tuple[SacaLine, ...]
    # Día del stock descontado (None: no hay stock reciente registrado).
    stock_date: date | None
    # Vendedores con proyección para el día, de cuántos activos.
    sellers_registered: int
    sellers_total: int
    # ¿Hay una fuente de pedidos confirmados conectada? (hoy no: ARIS aún no se integra)
    orders_available: bool
    yield_factor: float

    def _sum(self, field: str) -> int:
        return sum(getattr(line, field) for line in self.lines)

    @property
    def projected(self) -> int:
        return self._sum("projected")

    @property
    def ordered(self) -> int:
        return self._sum("ordered")

    @property
    def demand(self) -> int:
        return self._sum("demand")

    @property
    def stock(self) -> int:
        return self._sum("stock")

    @property
    def request(self) -> int:
        """Aves a pedir: en brasa, una unidad es un pollo entero."""
        return self._sum("request")

    @property
    def request_kg(self) -> float:
        return round(sum(line.request_kg for line in self.lines), 2)

    @property
    def live_kg(self) -> float:
        """Kg vivos estimados: kg de producto entre el rendimiento (kg de producto por kg vivo)."""
        return round(self.request_kg / self.yield_factor, 2)


def stock_window(day: date) -> tuple[date, date]:
    """Días cuyo stock sirve para la saca de `day`: los anteriores, hasta STOCK_MAX_AGE_DAYS."""
    return day - timedelta(days=STOCK_MAX_AGE_DAYS), day - timedelta(days=1)


def build_plan(
    day: date,
    products: list[Product],
    projected: dict[str, int],
    ordered: dict[str, int],
    stock: dict[str, int],
    **context,
) -> SacaPlan:
    lines = tuple(
        SacaLine(p, projected.get(p.id, 0), ordered.get(p.id, 0), stock.get(p.id, 0))
        for p in products
    )
    return SacaPlan(day, lines, **context)
