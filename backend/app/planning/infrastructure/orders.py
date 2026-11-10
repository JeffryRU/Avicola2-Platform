"""Fuente de pedidos confirmados. Hoy ninguna: ARIS aún no se integra.

Los pedidos del Excel de despacho vienen en kg por material de ARIS; para usarlos hace falta la
equivalencia material → producto del catálogo (Brasa 1 a 10), que el negocio aún no define.
"""

from datetime import date


class NoConfirmedOrders:
    available = False

    def units(self, day: date) -> dict[str, int]:  # noqa: ARG002 (lo exige el puerto)
        return {}
