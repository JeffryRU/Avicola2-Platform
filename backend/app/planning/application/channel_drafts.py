"""Borradores de la proyección o del stock que llegan en una foto (ADR 0024).

El modelo lee la foto, pero el backend no confía en él: busca cada producto en el catálogo, valida
la fecha y los permisos de quien envía y guarda un borrador. Solo con un «sí» se registra, con los
mismos casos de uso y reglas de la app (hora de corte, ventana, historial, avisos).
"""

import logging
from collections import defaultdict
from datetime import date, timedelta
from typing import Any
from uuid import uuid4

from app.planning.application.editing import GetEditingWindow
from app.planning.application.ports import Clock, DraftRepository, ProductRepository
from app.planning.application.stock import RegisterStock, StockEntry
from app.planning.application.use_cases import DayUnits, SubmitProjection
from app.planning.domain.assistant_tables import table_as_text
from app.planning.domain.channels import (
    CONFIRMED,
    DISCARDED,
    DRAFT_MINUTES,
    EXPIRED,
    PROJECTION,
    STOCK,
    Draft,
    DraftLine,
    Extraction,
    build_lines,
)
from app.planning.domain.models import Product, SellerAccount
from app.planning.domain.permissions import Permission
from app.planning.domain.stock import STOCK_BACK_DAYS, check_lot_date, check_stock_date
from app.shared.domain.errors import DomainError

logger = logging.getLogger(__name__)

UNREADABLE = (
    "No pude reconocer una proyección ni un stock en la foto. Envía otra más clara, o escribe "
    "tu consulta."
)
NO_DATE = "No pude leer la fecha en la foto. Envíala otra vez con la fecha bien visible."
NO_PRODUCTS = "No reconocí ningún producto del catálogo en la foto."
NOT_SELLER = "Solo los vendedores registran proyecciones."
NOT_STOCK = "No tienes permiso para registrar el stock."
NOTHING = "No tienes ningún registro pendiente por confirmar."
EXPIRED_TEXT = (
    f"El registro pendiente venció (dura {DRAFT_MINUTES} minutos). Envía la foto otra vez."
)
CONFIRM_HINT = "Responde *sí* para registrarlo o *no* para descartarlo."


def _day(value: str) -> date:
    return date.fromisoformat(value)


class ChannelDrafts:
    def __init__(
        self,
        products: ProductRepository,
        drafts: DraftRepository,
        submit: SubmitProjection,
        register_stock: RegisterStock,
        window: GetEditingWindow,
        clock: Clock,
    ) -> None:
        self.products, self.drafts, self.submit = products, drafts, submit
        self.register_stock, self.window, self.clock = register_stock, window, clock

    # --- Qué puede hacer la persona ----------------------------------------------------------

    @staticmethod
    def can_project(account: SellerAccount) -> bool:
        return account.seller.is_seller

    @staticmethod
    def can_stock(account: SellerAccount) -> bool:
        return account.seller.can(Permission.MANAGE_STOCK)

    def dates(self, account: SellerAccount) -> list[date]:
        today, found = self.clock.today(), set()
        if self.can_project(account):
            found |= {d.date for d in self.window(account.seller).days if d.open}
        if self.can_stock(account):
            found |= {today - timedelta(days=n) for n in range(STOCK_BACK_DAYS + 1)}
        return sorted(found)

    def catalog(self, account: SellerAccount) -> list[Product]:
        found: dict[str, Product] = {}
        if self.can_stock(account):
            found.update({p.id: p for p in self.products.list_stock_items()})
        if self.can_project(account):
            found.update({p.id: p for p in self.products.list_active()})
        return sorted(found.values(), key=lambda p: (p.category, p.sort_order, p.id))

    # --- Borrador ----------------------------------------------------------------------------

    def prepare(self, account: SellerAccount, channel: str, extraction: Extraction) -> str:
        """Arma el borrador y responde con lo que se va a registrar y lo que no se reconoció."""
        refusal, day = self._refusal(account, extraction), extraction.date
        if refusal or day is None:
            return refusal or NO_DATE
        products = (
            self.products.list_stock_items()
            if extraction.kind == STOCK
            else self.products.list_active()
        )
        lines, unknown = build_lines(extraction.rows, products)
        if extraction.kind == STOCK:
            lines, unknown = self._valid_lots(day, lines, unknown)
        if not lines:
            return NO_PRODUCTS
        by_id = {p.id: p for p in products}
        now = self.clock.now()
        payload: dict[str, Any] = {
            "date": day.isoformat(),
            "lines": [
                {
                    "product_id": ln.product_id,
                    "name": ln.name,
                    "category": ln.category,
                    "units": ln.units,
                    "kg": by_id[ln.product_id].kg(ln.units),
                    "lot_date": ln.lot_date.isoformat() if ln.lot_date else None,
                }
                for ln in lines
            ],
            "unrecognized": unknown,
        }
        draft = Draft(
            uuid4(),
            account.seller.username,
            channel,
            extraction.kind,
            payload,
            now,
            now + timedelta(minutes=DRAFT_MINUTES),
        )
        self.drafts.replace(draft)
        logger.info(
            "Borrador %s de %s armado desde una foto: %d líneas, %d sin reconocer",
            draft.kind,
            account.seller.username,
            len(lines),
            len(unknown),
        )
        return _summary(draft)

    def _refusal(self, account: SellerAccount, extraction: Extraction) -> str | None:
        """Por qué no se arma el borrador (tipo, permisos y fecha), o None si se puede."""
        if extraction.kind not in (PROJECTION, STOCK):
            return UNREADABLE
        if extraction.kind == PROJECTION and not self.can_project(account):
            return NOT_SELLER
        if extraction.kind == STOCK and not self.can_stock(account):
            return NOT_STOCK
        if extraction.date is None:
            return NO_DATE
        try:
            self._check_day(account, extraction.kind, extraction.date)
        except DomainError as error:
            return error.message
        return None

    def _check_day(self, account: SellerAccount, kind: str, day: date) -> None:
        if kind == STOCK:
            check_stock_date(day, self.clock.today())
            return
        window = {d.date: d for d in self.window(account.seller).days}
        if day not in window:
            raise DomainError(f"El {day:%d/%m/%Y} está fuera de los días que se pueden registrar.")
        if not window[day].open:
            closes = window[day].closes_at
            raise DomainError(
                f"El registro del {day:%d/%m/%Y} cerró el {closes:%d/%m} a las {closes:%H:%M}. "
                "Pide una habilitación a tu supervisor."
            )

    @staticmethod
    def _valid_lots(
        day: date, lines: list[DraftLine], unknown: list[str]
    ) -> tuple[list[DraftLine], list[str]]:
        valid = []
        for line in lines:
            try:
                check_lot_date(line.lot_date or day, day)
            except DomainError:
                unknown.append(f"{line.name} (lote fuera de rango)")
            else:
                valid.append(line)
        return valid, unknown

    # --- Respuesta de la persona -------------------------------------------------------------

    def has_pending(self, account: SellerAccount) -> bool:
        return self.drafts.pending(account.seller.username) is not None

    def confirm(self, account: SellerAccount) -> str:
        draft = self.drafts.pending(account.seller.username)
        if draft is None:
            return NOTHING
        if draft.is_expired(self.clock.now()):
            self.drafts.set_status(draft.id, EXPIRED)
            return EXPIRED_TEXT
        try:
            text = self._register(account, draft)
        except DomainError as error:
            # Sigue pendiente: la persona ve el motivo y puede descartarlo; si no, vence solo.
            return f"No se pudo registrar: {error.message}"
        self.drafts.set_status(draft.id, CONFIRMED)
        return text

    def discard(self, account: SellerAccount) -> str:
        draft = self.drafts.pending(account.seller.username)
        if draft is None:
            return NOTHING
        self.drafts.set_status(draft.id, DISCARDED)
        return "Listo, descarté el registro pendiente."

    def _register(self, account: SellerAccount, draft: Draft) -> str:
        day = _day(draft.payload["date"])
        lines = draft.payload["lines"]
        seller = account.seller
        if draft.kind == PROJECTION:
            by_category: dict[str, dict[str, int]] = defaultdict(dict)
            for ln in lines:
                by_category[ln["category"]][ln["product_id"]] = ln["units"]
            total = 0
            for category, units in by_category.items():
                saved = self.submit(seller, category, [DayUnits(day, units)], None)
                total += sum(p.total_units for p in saved)
            return f"Listo, registré tu proyección del {day:%d/%m/%Y}: {total} unidades."
        entries = [
            StockEntry(
                ln["product_id"], ln["units"], _day(ln["lot_date"]) if ln["lot_date"] else None
            )
            for ln in lines
        ]
        saved_stock = self.register_stock(seller, day, entries, None)
        return (
            f"Listo, registré el stock del {day:%d/%m/%Y}: "
            f"{saved_stock.total_units} unidades en total."
        )


def _summary(draft: Draft) -> str:
    payload = draft.payload
    day = _day(payload["date"])
    stock = draft.kind == STOCK
    title = f"{'Stock' if stock else 'Proyección'} del {day:%d/%m/%Y}"
    columns = ["Producto", "Unidades", "Kg"]
    rows = [[ln["name"], str(ln["units"]), f"{ln['kg']:g}"] for ln in payload["lines"]]
    parts = [f"Esto es lo que voy a registrar:\n{table_as_text(columns, rows, title)}"]
    if stock:
        parts.append("Reemplaza lo que ya estaba registrado de ese día en la ubicación general.")
    if payload["unrecognized"]:
        parts.append("No reconocí: " + ", ".join(payload["unrecognized"]) + ".")
    parts.append(CONFIRM_HINT)
    return "\n\n".join(parts)
