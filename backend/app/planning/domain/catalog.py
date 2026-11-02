"""Catálogo de productos y reglas para armar las líneas de una proyección."""

from collections.abc import Iterable, Mapping

from app.planning.domain.models import Product, ProjectionLine
from app.shared.domain.errors import DomainError

MAX_UNITS_PER_LINE = 99_999


class Catalog:
    """Productos activos agrupados por categoría."""

    def __init__(self, products: Iterable[Product]) -> None:
        self._products = sorted(products, key=lambda p: (p.category, p.sort_order, p.id))

    @property
    def products(self) -> list[Product]:
        return list(self._products)

    def of(self, category: str) -> dict[str, Product]:
        found = {p.id: p for p in self._products if p.category == category}
        if not found:
            raise DomainError(f"La categoría {category} no existe.")
        return found

    def lines_for(self, category: str, units: Mapping[str, int]) -> tuple[ProjectionLine, ...]:
        """Valida las unidades de un día y calcula los kg con el peso del catálogo."""
        products = self.of(category)
        unknown = set(units) - set(products)
        if unknown:
            raise DomainError(f"Productos fuera de {category}: {', '.join(sorted(unknown))}.")
        lines = []
        for product_id, product in products.items():
            n = units.get(product_id, 0)
            if not 0 <= n <= MAX_UNITS_PER_LINE:
                raise DomainError(f"Unidades inválidas en {product_id}.")
            lines.append(ProjectionLine(product_id, n, product.kg(n)))
        return tuple(lines)
