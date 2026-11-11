"""Cálculo de saca: cuánto pedir a granja para un día (Python puro).

Dos formas de calcular lo que hace falta (ver docs/assumptions.md), nunca menos de 0:

    suma:   falta = proyección + pedidos confirmados − stock de despacho      (la del negocio)
    mayor:  falta = max(proyección, pedidos confirmados) − stock de despacho  (alternativa)

- «Suma»: la regla del negocio, por defecto.
- «Mayor»: por si la proyección ya incluye lo confirmado y sumarlos lo contaría dos veces.

A granja no se pide por producto sino por tipo (Brasa chica, mediana, grande). Por eso el pedido
final se arma por tipo: se suman proyección, pedidos y stock de sus productos y lo que hace falta
se multiplica por el factor del tipo (`SacaGroup`).
- El stock es lo que quedó en despacho: lo último registrado antes del día, si es reciente.
"""

from dataclasses import dataclass
from datetime import date, timedelta

from app.planning.domain.models import Product
from app.planning.domain.production import ArrivalEstimate

# El stock de hace más días ya no representa lo que hay en despacho: no se descuenta.
STOCK_MAX_AGE_DAYS = 3

METHOD_MAX, METHOD_SUM = "max", "sum"
METHODS = (METHOD_SUM, METHOD_MAX)
DEFAULT_METHOD = METHOD_SUM


@dataclass(frozen=True)
class SacaLine:
    product: Product
    projected: int
    ordered: int
    stock: int
    method: str = DEFAULT_METHOD

    @property
    def demand(self) -> int:
        if self.method == METHOD_SUM:
            return self.projected + self.ordered
        return max(self.projected, self.ordered)

    @property
    def request(self) -> int:
        return max(0, self.demand - self.stock)

    @property
    def request_kg(self) -> float:
        return self.product.kg(self.request)


@dataclass(frozen=True)
class SacaGroup:
    """Un tipo de pedido a granja (Brasa chica...): la suma de sus productos y su pedido final."""

    name: str
    projected: int
    ordered: int
    demand: int
    stock: int
    # Parte de lo que hace falta que se pide a granja (regla del negocio; 1 = todo).
    factor: float

    @property
    def need(self) -> int:
        """Lo que hace falta del tipo: el stock de un rango cubre la falta de otro del tipo."""
        return max(0, self.demand - self.stock)

    @property
    def farm_order(self) -> int:
        return round(self.need * self.factor)


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
    method: str = DEFAULT_METHOD
    # Factor del pedido final por tipo; los tipos que no figuran usan 1.
    group_factors: tuple[tuple[str, float], ...] = ()
    # Qué se espera que llegue por producto si se pide esto (None: aún no hay historia suficiente).
    arrival: ArrivalEstimate | None = None

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
    def groups(self) -> tuple[SacaGroup, ...]:
        """Por tipo, en el orden del catálogo: sus sumas y el pedido final a granja."""
        factors = dict(self.group_factors)
        names = list(dict.fromkeys(product_group(line.product) for line in self.lines))
        result = []
        for name in names:
            lines = [line for line in self.lines if product_group(line.product) == name]
            result.append(
                SacaGroup(
                    name,
                    sum(line.projected for line in lines),
                    sum(line.ordered for line in lines),
                    sum(line.demand for line in lines),
                    sum(line.stock for line in lines),
                    factors.get(name, 1.0),
                )
            )
        return tuple(result)

    @property
    def farm_order(self) -> int:
        """Aves del pedido final a granja: la suma de los tipos, ya con su factor."""
        return sum(group.farm_order for group in self.groups)

    def request_by_group(self) -> dict[str, float]:
        """Lo que se pide a granja de cada tipo (el pedido final, con su factor)."""
        return {group.name: float(group.farm_order) for group in self.groups}

    @property
    def live_kg(self) -> float:
        """Kg vivos estimados: kg de producto entre el rendimiento (kg de producto por kg vivo)."""
        return round(self.request_kg / self.yield_factor, 2)


def product_group(product: Product) -> str:
    return product.subcategory or product.category


def stock_window(day: date) -> tuple[date, date]:
    """Días cuyo stock sirve para la saca de `day`: los anteriores, hasta STOCK_MAX_AGE_DAYS."""
    return day - timedelta(days=STOCK_MAX_AGE_DAYS), day - timedelta(days=1)


def build_plan(
    day: date,
    products: list[Product],
    projected: dict[str, int],
    ordered: dict[str, int],
    stock: dict[str, int],
    method: str = DEFAULT_METHOD,
    **context,
) -> SacaPlan:
    lines = tuple(
        SacaLine(p, projected.get(p.id, 0), ordered.get(p.id, 0), stock.get(p.id, 0), method)
        for p in products
    )
    return SacaPlan(day, lines, method=method, **context)
