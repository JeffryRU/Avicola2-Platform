"""Asistente de la app (ADR 0022): preguntas sugeridas y la respuesta del agente.

El agente responde en texto y, al final, propone preguntas para seguir en un bloque
`<sugerencias>una | otra | otra</sugerencias>`. Aquí se separa la respuesta de esas preguntas y
se limpian (pocas, cortas, sin repetir y sin caracteres de control).
"""

import re
import unicodedata
from collections.abc import Iterable
from dataclasses import dataclass

from app.planning.domain.permissions import Permission

MAX_MESSAGE = 500
MAX_SUGGESTIONS = 3
MAX_STARTERS = 4
MAX_SUGGESTION_CHARS = 90
# Identificador de la conversación que elige la app (un UUID): letras, números y guiones.
CONVERSATION_ID = re.compile(r"^[A-Za-z0-9-]{8,64}$")

_BLOCK = re.compile(r"<sugerencias>(.*?)(?:</sugerencias>|$)", re.IGNORECASE | re.DOTALL)
_CONTROL = re.compile(r"[\x00-\x1f\x7f-\x9f  ]")


@dataclass(frozen=True)
class StarterGroup:
    """Preguntas para empezar que ve quien tiene `permission` (None: todos; `sellers`: solo
    quien registra proyecciones)."""

    questions: tuple[str, ...]
    permission: Permission | None = None
    sellers: bool = False


@dataclass(frozen=True)
class AssistantAnswer:
    reply: str
    suggestions: tuple[str, ...]


def clean_question(text: str) -> str | None:
    """Una pregunta sugerida en una línea, o None si queda vacía o es demasiado larga."""
    text = _CONTROL.sub(" ", text).strip(" -•*\"'")
    text = re.sub(r"\s+", " ", text)
    if not text or len(text) > MAX_SUGGESTION_CHARS:
        return None
    return text


def _unique(questions: Iterable[str], limit: int) -> tuple[str, ...]:
    out: list[str] = []
    for q in questions:
        clean = clean_question(q)
        if clean and clean.lower() not in {o.lower() for o in out}:
            out.append(clean)
        if len(out) == limit:
            break
    return tuple(out)


def split_reply(text: str) -> AssistantAnswer:
    """La respuesta sin el bloque de sugerencias, y las preguntas que propone."""
    found = _BLOCK.search(text)
    if not found:
        return AssistantAnswer(text.strip(), ())
    reply = (text[: found.start()] + text[found.end() :]).strip()
    parts = re.split(r"[|\n]", found.group(1))
    return AssistantAnswer(reply, _unique(parts, MAX_SUGGESTIONS))


def starters(
    groups: Iterable[StarterGroup], permissions: frozenset[Permission], is_seller: bool
) -> tuple[str, ...]:
    """Preguntas para empezar según lo que la persona puede ver (las más específicas primero)."""
    mine = [
        g
        for g in groups
        if (g.permission is None or g.permission in permissions) and (not g.sellers or is_seller)
    ]
    # Primero lo propio del rol; lo general (sin permiso ni vendedor) al final.
    mine.sort(key=lambda g: g.permission is None and not g.sellers)
    return _unique((q for g in mine for q in g.questions), MAX_STARTERS)


# --- Guardrails (ADR 0022) -------------------------------------------------------------------
# Antes del agente: preguntas que no se le pasan (credenciales, sacarle sus instrucciones, datos
# personales, detalles técnicos); se responden con un texto fijo. Después: la respuesta no puede
# traer secretos ni las instrucciones del agente (el system prompt lleva este código «canario»).

INSTRUCTIONS_CANARY = "AVP-CANARIO-7Q2"
LEAKED_REPLY = (
    "No puedo mostrar mis instrucciones internas. Puedo ayudarte con proyecciones, pedido real, "
    "saca, stock, producción y las reglas del registro."
)
REDACTED = "[oculto]"
_SECRETS = (
    re.compile(r"eyJ[\w-]{8,}\.[\w-]{8,}\.[\w-]{8,}"),  # JWT
    re.compile(r"\b(?:sk|pk|rk)-[\w-]{16,}"),  # claves de API
    re.compile(r"\b[0-9a-fA-F]{32,}\b"),  # tokens hexadecimales
    re.compile(r"(?i)\bbearer\s+[\w.-]{16,}"),
    re.compile(r"[\w.+-]+@[\w-]+\.[\w.-]+"),  # correos
)


@dataclass(frozen=True)
class GuardrailRule:
    """Preguntas que no llegan al agente: si el texto (sin tildes, en minúsculas) coincide con
    alguno de `patterns`, se responde `reply`."""

    category: str
    patterns: tuple[re.Pattern[str], ...]
    reply: str


def plain(text: str) -> str:
    """Minúsculas y sin tildes (para comparar con los patrones de los guardrails)."""
    folded = unicodedata.normalize("NFKD", text.lower())
    return "".join(c for c in folded if not unicodedata.combining(c))


def guardrail_rule(category: str, patterns: Iterable[str], reply: str) -> GuardrailRule:
    return GuardrailRule(category, tuple(re.compile(plain(p)) for p in patterns), reply)


def blocked_by(question: str, rules: Iterable[GuardrailRule]) -> GuardrailRule | None:
    text = plain(question)
    return next((r for r in rules if any(p.search(text) for p in r.patterns)), None)


def guard_reply(text: str) -> tuple[str, bool]:
    """(respuesta segura, ¿hubo que intervenir?): sin las instrucciones del agente y sin
    secretos (tokens, claves, correos)."""
    if INSTRUCTIONS_CANARY.lower() in text.lower():
        return LEAKED_REPLY, True
    clean = text
    for pattern in _SECRETS:
        clean = pattern.sub(REDACTED, clean)
    return clean, clean != text
