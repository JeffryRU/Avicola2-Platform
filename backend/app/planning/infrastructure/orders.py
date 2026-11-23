"""Pedidos confirmados para el cálculo de saca.

`LoadedOrders` los toma de la historia de ARIS cargada con `cli historia` (tabla de pedidos de
despacho): no es una conexión en vivo, así que solo hay pedidos para los días que estén en el
archivo cargado. `NoConfirmedOrders` es la fuente vacía (pruebas, o si no se quiere usar).
"""

from collections import Counter
from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.planning.application.ports import ProductRepository
from app.planning.domain.orders import (
    ORDER_CATEGORY,
    ORDER_MATERIAL_PREFIX,
    OrderLine,
    daily_units,
)
from app.planning.infrastructure.persistence.tables import dispatch_orders
from app.planning.infrastructure.store_orders_import import STORE_CODE_PREFIX


class NoConfirmedOrders:
    available = False

    def units(self, day: date) -> dict[str, int]:  # noqa: ARG002 (lo exige el puerto)
        return {}


class LoadedOrders:
    """Pedidos con entrega ese día, llevados a productos del catálogo: el pollo entero para brasa
    (por su peso) y los otros productos que se proyectan, reconocidos por su material de ARIS
    (`extra_materials`: producto → inicio del material, p. ej. el pollo de mercado)."""

    def __init__(
        self,
        session: Session,
        products: ProductRepository,
        extra_materials: dict[str, str] | None = None,
    ) -> None:
        self.session, self.products = session, products
        self.extra_materials = extra_materials or {}
        # Se actualiza en cada consulta: ¿hay pedidos cargados para ese día?
        self.available = False

    def units(self, day: date) -> dict[str, int]:
        t = dispatch_orders.c
        query = select(
            t.delivery_date,
            t.material,
            t.ordered_kg,
            t.ordered_units,
            t.dispatched_kg,
            t.dispatched_units,
        ).where(t.delivery_date == day)
        active = self.products.list_active()
        brasa = [p for p in active if p.category == ORDER_CATEGORY]
        extras = [
            (p, self.extra_materials[p.id].upper()) for p in active if p.id in self.extra_materials
        ]
        lines, units = [], Counter()
        for row in self.session.execute(query):
            line = OrderLine(*row)
            material = line.material.upper()
            extra = next((p for p, prefix in extras if material.startswith(prefix)), None)
            if extra is not None:
                lines.append(line)
                n = (
                    line.ordered_units
                    if line.ordered_units > 0
                    else line.ordered_kg / extra.kg_per_unit
                )
                units[extra.id] += n
            elif material.startswith(ORDER_MATERIAL_PREFIX):
                lines.append(line)
        units.update(
            daily_units(
                [x for x in lines if x.material.upper().startswith(ORDER_MATERIAL_PREFIX)], brasa
            ).get(day, {})
        )
        self.available = bool(lines)
        return {product: round(n) for product, n in units.items() if round(n) > 0}


class LoadedStoreOrders:
    """Pedidos de las tiendas cargados con `cli tiendas` (filas TIENDA- de la tabla de despacho)."""

    def __init__(self, session: Session) -> None:
        self.session = session

    def lines(self, date_from: date, date_to: date) -> list[tuple[str | None, OrderLine]]:
        t = dispatch_orders.c
        query = select(
            t.zone,
            t.delivery_date,
            t.material,
            t.ordered_kg,
            t.ordered_units,
            t.dispatched_kg,
            t.dispatched_units,
        ).where(
            t.delivery_date.between(date_from, date_to),
            t.material_code.startswith(STORE_CODE_PREFIX, autoescape=True),
        )
        return [(row[0], OrderLine(*row[1:])) for row in self.session.execute(query)]
