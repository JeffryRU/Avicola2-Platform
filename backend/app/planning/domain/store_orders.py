"""Pedidos de las tiendas (reporte «pedidos en tienda detalle») por zona de venta (Python puro).

Las tiendas no son vendedores: en los dashboards cada zona suma una columna «Tiendas» con lo que
piden sus tiendas, junto a lo que proyectan sus vendedores.
"""

import unicodedata
from dataclasses import dataclass
from datetime import date

# El reporte nombra algunas zonas por la región: La Libertad es la zona de Trujillo.
ZONE_ALIASES = {"LA LIBERTAD": "TRUJILLO"}


@dataclass(frozen=True)
class StoreOrderDay:
    # Zona de venta (la de los vendedores); None si el reporte no la trae.
    zone: str | None
    date: date
    units: dict[str, int]


def _key(text: str) -> str:
    plain = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode()
    return " ".join(plain.upper().split())


def sales_zone(raw: str | None, zones: list[str]) -> str | None:
    """La zona de venta del reporte («SAN MARTIN», «LA LIBERTAD») con el nombre que usan los
    vendedores («San Martín», «Trujillo»). Si no coincide con ninguna, queda tal cual."""
    if not raw or not raw.strip():
        return None
    key = _key(raw)
    key = ZONE_ALIASES.get(key, key)
    for zone in zones:
        if _key(zone) == key:
            return zone
    return raw.strip().title()
