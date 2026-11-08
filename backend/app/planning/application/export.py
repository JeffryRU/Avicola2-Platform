"""Exportar las proyecciones (Excel): la misma tabla que descarga la web desde los dashboards.

El caso de uso arma filas y columnas (Python puro); el formato del archivo lo pone un adaptador
(`SpreadsheetWriter`), así el día de mañana puede salir también en CSV o PDF.
"""

from dataclasses import dataclass, field
from datetime import date, timedelta

from app.planning.application.ports import (
    Clock,
    ProductRepository,
    ProjectionRepository,
    SalesSource,
    SellerRepository,
)
from app.planning.application.use_cases import visible_seller
from app.planning.domain.catalog import Catalog
from app.planning.domain.models import CONFIRMED, SELLER, Seller
from app.planning.domain.permissions import Permission
from app.shared.domain.errors import DomainError

# Un período de exportación razonable para un archivo que se abre en el celular.
MAX_EXPORT_DAYS = 93
MISSING = "Sin proyección"
STATUS_LABEL = {CONFIRMED: "Confirmada"}
WEEKDAYS = ("Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom")


@dataclass(frozen=True)
class Column:
    label: str
    width: int
    numeric: bool = False


COLUMNS = (
    Column("Fecha", 11),
    Column("Día", 5),
    Column("Zona", 12),
    Column("Vendedor", 20),
    Column("Categoría", 11),
    Column("Código", 7),
    Column("Producto", 14),
    Column("Kg por unidad", 9, numeric=True),
    Column("Unidades", 9, numeric=True),
    Column("Kg", 9, numeric=True),
    Column("Venta real (unid.)", 11, numeric=True),
    Column("Estado", 14),
    Column("Enviado", 17),
)

Cell = str | int | float | date | None


@dataclass(frozen=True)
class ExportTable:
    title: str
    subtitle: str
    columns: tuple[Column, ...]
    rows: list[list[Cell]] = field(default_factory=list)

    @property
    def missing(self) -> int:
        return sum(1 for r in self.rows if r[11] == MISSING)


class ExportProjections:
    """Una fila por día, vendedor y producto (con la venta real si ya llegó) y una fila
    «Sin proyección» por cada vendedor que no registró ese día. El vendedor exporta lo suyo; el
    supervisor, el equipo o un vendedor."""

    def __init__(
        self,
        products: ProductRepository,
        projections: ProjectionRepository,
        sales: SalesSource,
        sellers: SellerRepository,
        clock: Clock,
    ):
        self.products, self.projections = products, projections
        self.sales, self.sellers, self.clock = sales, sellers, clock

    def __call__(
        self,
        viewer: Seller,
        date_from: date,
        date_to: date,
        seller: str | None,
    ) -> ExportTable:
        generated_at = self.clock.now()
        if date_to < date_from:
            raise DomainError("El rango de fechas está invertido.")
        if (date_to - date_from).days >= MAX_EXPORT_DAYS:
            raise DomainError(f"Exporta como máximo {MAX_EXPORT_DAYS} días a la vez.")
        only = visible_seller(viewer, seller)
        team = self._team(viewer, only)
        catalog = Catalog(self.products.list_active())
        found = self.projections.find(date_from, date_to, only)
        real = {
            (d.seller, d.date): d.units for d in self.sales.daily_units(date_from, date_to, only)
        }

        rows: list[list[Cell]] = []
        day = date_from
        while day <= date_to:
            for person in team:
                base: list[Cell] = [day, WEEKDAYS[day.weekday()], person.zone or "", person.name]
                own = sorted(
                    (p for p in found if p.seller == person.username and p.date == day),
                    key=lambda p: p.category,
                )
                if not own:
                    rows.append([*base, None, None, None, None, None, None, None, MISSING, None])
                    continue
                sold = real.get((person.username, day))
                for projection in own:
                    units = projection.units
                    for product in catalog.of(projection.category).values():
                        n = units.get(product.id, 0)
                        rows.append(
                            [
                                *base,
                                projection.category,
                                product.id,
                                product.name,
                                product.kg_per_unit,
                                n,
                                product.kg(n),
                                sold.get(product.id, 0) if sold is not None else None,
                                STATUS_LABEL.get(projection.status, projection.status),
                                f"{projection.submitted_at:%Y-%m-%d %H:%M}",
                            ]
                        )
            day += timedelta(days=1)

        who = team[0].name if len(team) == 1 else f"{len(team)} vendedores"
        table = ExportTable("Proyecciones del equipo", "", COLUMNS, rows)
        subtitle = (
            f"Del {date_from:%d/%m/%Y} al {date_to:%d/%m/%Y} · {who} · "
            f"{table.missing} sin proyección · generado el {generated_at:%d/%m/%Y %H:%M}"
        )
        return ExportTable(table.title, subtitle, COLUMNS, rows)

    def _team(self, viewer: Seller, only: str | None) -> list[Seller]:
        if not viewer.can(Permission.VIEW_TEAM):
            return [viewer]
        team = [s for s in self.sellers.list_active() if s.role == SELLER]
        if only:
            team = [s for s in team if s.username == only]
            if not team:
                raise DomainError("No existe un vendedor activo con ese usuario.")
        return sorted(team, key=lambda s: (s.zone or "", s.name))
