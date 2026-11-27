"""Canales del asistente (Telegram y WhatsApp, ADR 0024): comandos, código de vinculación,
productos leídos de una foto y borradores. Python puro."""

import re
import secrets
from dataclasses import dataclass
from datetime import date, datetime
from difflib import SequenceMatcher
from typing import Any
from uuid import UUID

from app.planning.domain.assistant import plain
from app.planning.domain.models import Product

# Sin caracteres ambiguos (0/O, 1/I/L).
LINK_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"
LINK_CODE_LENGTH = 6
LINK_CODE_MINUTES = 10
DRAFT_MINUTES = 30
FILE_MINUTES = 15
MIN_SIMILARITY = 0.8
MAX_SENDER = 64

PROJECTION, STOCK, UNKNOWN = "projection", "stock", "unknown"
PENDING, CONFIRMED, DISCARDED, EXPIRED = "pending", "confirmed", "discarded", "expired"

_LINK = re.compile(r"^/?(?:vincular|start)\s+([a-z0-9]{6})$")
_NUMBER = re.compile(r"^\d{1,2}$")


def new_link_code() -> str:
    return "".join(secrets.choice(LINK_CODE_ALPHABET) for _ in range(LINK_CODE_LENGTH))


@dataclass(frozen=True)
class Command:
    kind: str  # link | new | yes | no | number | text
    arg: str = ""


def parse_command(text: str) -> Command:
    """Qué quiso decir la persona: vincular, empezar de nuevo, confirmar, descartar, elegir una
    sugerencia por su número o una pregunta."""
    key = plain(text).strip()
    if found := _LINK.match(key):
        return Command("link", found.group(1).upper())
    if key in ("nueva", "/nueva"):
        return Command("new")
    if key in ("si", "/si"):
        return Command("yes")
    if key in ("no", "/no"):
        return Command("no")
    if _NUMBER.match(key):
        return Command("number", key)
    return Command("text", text.strip())


def numbered(suggestions: list[str] | tuple[str, ...]) -> str:
    """Las sugerencias como lista numerada (se responde con el número)."""
    if not suggestions:
        return ""
    lines = [f"{i}. {q}" for i, q in enumerate(suggestions, 1)]
    return "Puedes responder con el número:\n" + "\n".join(lines)


# --- Lo que el modelo leyó de una foto ----------------------------------------------------


@dataclass(frozen=True)
class ExtractedRow:
    product: str
    units: int | None = None
    kg: float | None = None
    lot_date: date | None = None


@dataclass(frozen=True)
class Extraction:
    kind: str
    date: date | None
    rows: tuple[ExtractedRow, ...]
    notes: str = ""


def normalize_name(text: str) -> str:
    folded = re.sub(r"[^a-z0-9]+", " ", plain(text))
    return " ".join(folded.split())


def match_product(read: str, products: list[Product]) -> Product | None:
    """El producto del catálogo que corresponde al texto leído: nombre o código exacto (sin
    tildes ni mayúsculas) y, si no, el más parecido con similitud de al menos 0,8. Si dos
    empatan, ninguno (el modelo no decide entre ellos). El catálogo no tiene alias hoy."""
    key = normalize_name(read)
    if not key:
        return None
    for product in products:
        if key in (normalize_name(product.name), normalize_name(product.id)):
            return product
    # Un número distinto es otro producto (Brasa 11 no es Brasa 1), aunque se parezcan mucho.
    digits = re.findall(r"\d+", key)
    candidates = [p for p in products if re.findall(r"\d+", normalize_name(p.name)) == digits]
    scored = sorted(
        ((SequenceMatcher(None, key, normalize_name(p.name)).ratio(), p) for p in candidates),
        key=lambda pair: -pair[0],
    )
    if not scored or scored[0][0] < MIN_SIMILARITY:
        return None
    if len(scored) > 1 and scored[1][0] == scored[0][0]:
        return None
    return scored[0][1]


@dataclass(frozen=True)
class DraftLine:
    product_id: str
    name: str
    category: str
    units: int
    lot_date: date | None = None


def build_lines(
    rows: tuple[ExtractedRow, ...], products: list[Product]
) -> tuple[list[DraftLine], list[str]]:
    """(líneas reconocidas, textos que no se reconocieron). Una fila sin unidades toma los kg
    entre el peso por unidad del catálogo; las repetidas del mismo producto y lote se suman."""
    merged: dict[tuple[str, date | None], DraftLine] = {}
    unknown: list[str] = []
    for row in rows:
        product = match_product(row.product, products)
        units = row.units
        if units is None and row.kg is not None and product and product.kg_per_unit > 0:
            units = round(row.kg / product.kg_per_unit)
        if product is None or units is None or units < 0:
            unknown.append(row.product.strip()[:60] or "(sin nombre)")
            continue
        key = (product.id, row.lot_date)
        before = merged.get(key)
        total = units + (before.units if before else 0)
        merged[key] = DraftLine(product.id, product.name, product.category, total, row.lot_date)
    return list(merged.values()), unknown


@dataclass(frozen=True)
class Draft:
    id: UUID
    username: str
    channel: str
    kind: str
    payload: dict[str, Any]
    created_at: datetime
    expires_at: datetime
    status: str = PENDING

    def is_expired(self, now: datetime) -> bool:
        return self.expires_at <= now
