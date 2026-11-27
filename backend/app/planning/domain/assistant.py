"""Asistente de la app (ADR 0022): preguntas sugeridas y la respuesta del agente.

El agente responde en texto y, al final, propone preguntas para seguir en un bloque
`<sugerencias>una | otra | otra</sugerencias>`. Aquí se separa la respuesta de esas preguntas y
se limpian (pocas, cortas, sin repetir y sin caracteres de control).
"""

import re
import unicodedata
from collections.abc import Iterable
from dataclasses import dataclass
from typing import Any

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
    """Un tema del asistente para quien tiene `permission` (None: todos; `sellers`: solo quien
    registra proyecciones): sus preguntas para empezar, qué puede consultar (`scope`, se le dice
    al agente) y palabras del tema (`topics`): una pregunta sugerida que las tenga no se ofrece a
    quien no ve el tema."""

    questions: tuple[str, ...]
    permission: Permission | None = None
    sellers: bool = False
    scope: str = ""
    topics: tuple[str, ...] = ()

    def visible_to(self, permissions: frozenset[Permission], is_seller: bool) -> bool:
        return (self.permission is None or self.permission in permissions) and (
            not self.sellers or is_seller
        )


@dataclass(frozen=True)
class AssistantAnswer:
    reply: str
    suggestions: tuple[str, ...]
    # Mensaje guardado en el historial y la respuesta en bloques de texto y tabla (ADR 0024).
    message_id: str | None = None
    blocks: tuple[dict[str, Any], ...] = ()


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
    mine = [g for g in groups if g.visible_to(permissions, is_seller)]
    # Primero lo propio del rol; lo general (sin permiso ni vendedor) al final.
    mine.sort(key=lambda g: g.permission is None and not g.sellers)
    return _unique((q for g in mine for q in g.questions), MAX_STARTERS)


def scope_of(
    groups: Iterable[StarterGroup], permissions: frozenset[Permission], is_seller: bool
) -> str:
    """Lo que la persona puede consultar, en palabras (para que el agente no ofrezca más)."""
    return "; ".join(g.scope for g in groups if g.scope and g.visible_to(permissions, is_seller))


def within_scope(
    suggestions: Iterable[str],
    groups: Iterable[StarterGroup],
    permissions: frozenset[Permission],
    is_seller: bool,
) -> tuple[str, ...]:
    """Las preguntas sugeridas sin las de temas que la persona no ve (p. ej. la saca para un
    vendedor): el agente a veces las propone igual."""
    hidden = [
        plain(t) for g in groups if not g.visible_to(permissions, is_seller) for t in g.topics
    ]
    return tuple(q for q in suggestions if not any(t in plain(q) for t in hidden))


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


SUGGESTIONS_TAG = "<sugerencias"
# Lo último que llegó no se muestra todavía: así un secreto o el canario a medio escribir no
# alcanzan a verse antes de que el guardrail los reconozca (un JWT o una clave caben aquí).
STREAM_HOLDBACK = 120


class ReplyStream:
    """La respuesta del agente a medida que llega, con los mismos guardrails que la final.

    `feed` devuelve solo el texto nuevo que ya es seguro mostrar: sin el bloque de sugerencias,
    sin secretos y guardando los últimos `holdback` caracteres. Si aparece el canario (el agente
    filtró sus instrucciones), deja de mostrar nada: la respuesta final lo reemplaza.
    """

    def __init__(self, holdback: int = STREAM_HOLDBACK) -> None:
        self.holdback = holdback
        self.raw = ""
        self.sent = ""
        self.leaked = False

    def feed(self, chunk: str) -> str:
        self.raw += chunk
        if self.leaked or INSTRUCTIONS_CANARY.lower() in self.raw.lower():
            self.leaked = True
            return ""
        cut = self.raw.lower().find(SUGGESTIONS_TAG)
        safe, _ = guard_reply(self.raw if cut < 0 else self.raw[:cut])
        upto = len(safe) - self.holdback
        # Se corta en un espacio: no se muestran palabras a medias.
        space = safe.rfind(" ", len(self.sent), max(upto, 0))
        if space < 0:
            return ""
        shown = safe[: space + 1]
        if not shown.startswith(self.sent):
            # Lo ya mostrado cambió (un secreto que empezaba antes): se espera a la final.
            return ""
        delta, self.sent = shown[len(self.sent) :], shown
        return delta
