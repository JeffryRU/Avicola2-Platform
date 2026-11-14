"""Cálculo de saca: cuánto pedir a granja (Python puro).

Se calcula el día D (hoy) y, por tipo de pedido a granja, en este orden (regla del negocio):

    saca = stock − pedidos de mañana (D+1) + proyección de pasado mañana (D+2) + plus

- **Stock:** lo que quedó en despacho, lo último registrado hasta D (si es reciente). Incluye la
  calidad B, que se cuenta por tipo.
- **Pedidos:** los confirmados para entregar mañana.
- **Proyección:** la del equipo de vendedores para pasado mañana (cuando llega lo que se pide).
- **Plus:** aves extra fijas por tipo, que configura un supervisor.
- Nunca menos de 0: un pedido a granja negativo no existe.

A granja no se pide por producto sino por tipo (Brasa chica, mediana, grande): el plus va por
tipo. Las líneas por producto muestran el mismo cálculo sin el plus, como detalle.
"""

from dataclasses import dataclass
from datetime import date, timedelta

from app.planning.domain.models import Product
from app.planning.domain.production import ArrivalEstimate

# El stock de hace más días ya no representa lo que hay en despacho: no se descuenta.
STOCK_MAX_AGE_DAYS = 3
# Forma de cálculo (una sola): se informa en la respuesta para que el cliente la muestre.
METHOD = "stock_orders_projection_plus"


@dataclass(frozen=True)
class SacaLine:
    product: Product
    projected: int
    ordered: int
    stock: int

    @property
    def balance(self) -> int:
        """stock − pedidos + proyección, sin el plus (puede ser negativo)."""
        return self.stock - self.ordered + self.projected

    @property
    def request(self) -> int:
        return max(0, self.balance)

    @property
    def request_kg(self) -> float:
        return self.product.kg(self.request)


@dataclass(frozen=True)
class SacaGroup:
    """Un tipo de pedido a granja (Brasa chica...): sus sumas, su plus y el pedido final."""

    name: str
    projected: int
    ordered: int
    stock: int
    plus: int = 0
    # De ese stock, cuánto es calidad B (se cuenta por tipo, no por producto).
    stock_b: int = 0

    @property
    def balance(self) -> int:
        """stock − pedidos + proyección, antes del plus (puede ser negativo)."""
        return self.stock - self.ordered + self.projected

    @property
    def farm_order(self) -> int:
        """stock − pedidos + proyección + plus; nunca menos de 0."""
        return max(0, self.balance + self.plus)


@dataclass(frozen=True)
class SacaPlan:
    """Lo que hay que pedir a granja, calculado el día `date`, y con qué datos."""

    date: date
    lines: tuple[SacaLine, ...]
    # Día del stock usado (None: no hay stock reciente registrado).
    stock_date: date | None
    # Vendedores con proyección para pasado mañana, de cuántos activos.
    sellers_registered: int
    sellers_total: int
    # ¿Hay pedidos cargados para mañana?
    orders_available: bool
    yield_factor: float
    # Plus por tipo (aves); los tipos que no figuran no llevan plus.
    group_plus: tuple[tuple[str, int], ...] = ()
    # Stock de calidad B por tipo: se suma al stock del tipo, no de un producto.
    stock_b_by_group: tuple[tuple[str, int], ...] = ()
    # Unidades en lotes demasiado antiguos, que no se cuentan (se trozan).
    stock_old: int = 0
    # Antigüedad máxima de los lotes que sí cuentan (días).
    stock_lot_days: int | None = None
    # Qué se espera que llegue por producto si se pide esto (None: aún no hay historia suficiente).
    arrival: ArrivalEstimate | None = None

    @property
    def orders_date(self) -> date:
        return orders_day(self.date)

    @property
    def projection_date(self) -> date:
        return projection_day(self.date)

    def _sum(self, field: str) -> int:
        return sum(getattr(line, field) for line in self.lines)

    @property
    def projected(self) -> int:
        return self._sum("projected")

    @property
    def ordered(self) -> int:
        return self._sum("ordered")

    @property
    def stock(self) -> int:
        return self._sum("stock")

    @property
    def balance(self) -> int:
        return self._sum("balance")

    @property
    def request(self) -> int:
        """Por producto, sin el plus: en brasa, una unidad es un pollo entero."""
        return self._sum("request")

    @property
    def request_kg(self) -> float:
        return round(sum(line.request_kg for line in self.lines), 2)

    @property
    def groups(self) -> tuple[SacaGroup, ...]:
        """Por tipo, en el orden del catálogo: sus sumas, su plus y el pedido final a granja."""
        plus = dict(self.group_plus)
        quality_b = dict(self.stock_b_by_group)
        names = list(dict.fromkeys(product_group(line.product) for line in self.lines))
        result = []
        for name in names:
            lines = [line for line in self.lines if product_group(line.product) == name]
            result.append(
                SacaGroup(
                    name,
                    sum(line.projected for line in lines),
                    sum(line.ordered for line in lines),
                    sum(line.stock for line in lines) + quality_b.get(name, 0),
                    plus.get(name, 0),
                    quality_b.get(name, 0),
                )
            )
        return tuple(result)

    @property
    def plus(self) -> int:
        return sum(group.plus for group in self.groups)

    @property
    def stock_b(self) -> int:
        return sum(units for _, units in self.stock_b_by_group)

    @property
    def farm_order(self) -> int:
        """Aves del pedido final a granja: la suma de los tipos, ya con su plus."""
        return sum(group.farm_order for group in self.groups)

    def request_by_group(self) -> dict[str, float]:
        """Lo que se pide a granja de cada tipo (el pedido final, con su plus)."""
        return {group.name: float(group.farm_order) for group in self.groups}

    @property
    def live_kg(self) -> float:
        """Kg vivos estimados: kg de producto entre el rendimiento (kg de producto por kg vivo)."""
        return round(self.request_kg / self.yield_factor, 2)


def product_group(product: Product) -> str:
    return product.subcategory or product.category


def orders_day(day: date) -> date:
    """Pedidos que se descuentan: los de mañana."""
    return day + timedelta(days=1)


def projection_day(day: date) -> date:
    """Proyección que se suma: la de pasado mañana."""
    return day + timedelta(days=2)


def stock_window(day: date) -> tuple[date, date]:
    """Días cuyo stock sirve para la saca calculada `day`: hasta ese día, de los últimos
    STOCK_MAX_AGE_DAYS."""
    return day - timedelta(days=STOCK_MAX_AGE_DAYS - 1), day


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
