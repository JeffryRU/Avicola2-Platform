"""Catálogo de canales, productos y tipos de registro (backend/config/catalog.yaml)."""

from dataclasses import dataclass


@dataclass(frozen=True)
class Catalog:
    channels: list[str]
    products: list[str]
    record_types: list[str]

    def __post_init__(self) -> None:
        for name in ("channels", "products", "record_types"):
            if not getattr(self, name):
                raise ValueError(f"el catálogo necesita al menos un valor en {name}")
