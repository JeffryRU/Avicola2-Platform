"""Conversaciones guardadas del asistente (ADR 0024). Python puro."""

from dataclasses import dataclass
from datetime import datetime
from typing import Any
from uuid import UUID

APP, TELEGRAM, WHATSAPP = "app", "telegram", "whatsapp"
CHANNELS = (TELEGRAM, WHATSAPP)
ALL_CHANNELS = (APP, *CHANNELS)
USER, ASSISTANT = "user", "assistant"
MAX_TITLE = 120
PREVIEW_CHARS = 100


def title_of(question: str) -> str:
    """La primera pregunta, en una línea y recortada."""
    one_line = " ".join(question.split())
    return one_line if len(one_line) <= MAX_TITLE else one_line[: MAX_TITLE - 1].rstrip() + "…"


@dataclass(frozen=True)
class Conversation:
    id: UUID
    username: str
    channel: str
    title: str
    created_at: datetime
    updated_at: datetime
    archived: bool = False


@dataclass(frozen=True)
class StoredMessage:
    id: UUID
    conversation_id: UUID
    role: str
    text: str
    created_at: datetime
    blocks: tuple[dict[str, Any], ...] = ()
    suggestions: tuple[str, ...] = ()


@dataclass(frozen=True)
class ConversationSummary:
    id: UUID
    title: str
    channel: str
    updated_at: datetime
    preview: str
