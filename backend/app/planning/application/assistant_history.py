"""Historial del asistente (ADR 0024): conversaciones guardadas, tablas en Excel y limpieza.

Cada persona ve solo lo suyo: una conversación o un mensaje ajeno responde igual que uno que no
existe (404), para no revelar qué ids hay.
"""

import logging
from dataclasses import dataclass
from datetime import datetime, timedelta
from uuid import UUID

from app.planning.application.ports import (
    ChannelLinkRepository,
    Clock,
    ConversationRepository,
    DraftRepository,
    TableExporter,
)
from app.planning.domain.assistant_tables import file_slug, tables_of
from app.planning.domain.conversations import ASSISTANT, Conversation, StoredMessage
from app.planning.domain.models import SellerAccount
from app.shared.domain.errors import NotFoundError

logger = logging.getLogger(__name__)

NOT_FOUND = "La conversación no existe."
TABLE_NOT_FOUND = "La tabla no existe."
MAX_LIMIT = 100
# Los borradores ya resueltos o vencidos se conservan un día más y luego se borran.
DRAFT_KEEP = timedelta(days=1)


@dataclass(frozen=True)
class TableFile:
    name: str
    content: bytes


def _uuid(value: str, message: str) -> UUID:
    try:
        return UUID(value)
    except ValueError:
        raise NotFoundError(message) from None


class AssistantHistory:
    def __init__(
        self, conversations: ConversationRepository, tables: TableExporter, clock: Clock
    ) -> None:
        self.conversations, self.tables, self.clock = conversations, tables, clock

    def conversations_of(
        self, account: SellerAccount, limit: int = 30, before: datetime | None = None
    ):
        limit = max(1, min(limit, MAX_LIMIT))
        return self.conversations.list_for(account.seller.username, limit, before)

    def get(
        self, account: SellerAccount, conversation_id: str
    ) -> tuple[Conversation, list[StoredMessage]]:
        conversation = self._mine(account.seller.username, conversation_id)
        return conversation, self.conversations.messages(conversation.id)

    def archive(self, account: SellerAccount, conversation_id: str) -> None:
        conversation = self._mine(account.seller.username, conversation_id)
        self.conversations.archive(conversation.id)

    def table_file(self, username: str, message_id: str, index: int) -> TableFile:
        """El Excel de una tabla de un mensaje guardado (solo de quien es dueño de la
        conversación). `index` es la posición entre las tablas del mensaje, desde 0."""
        found = self.conversations.message(_uuid(message_id, TABLE_NOT_FOUND))
        if found is None or found[0].username != username or found[1].role != ASSISTANT:
            raise NotFoundError(TABLE_NOT_FOUND)
        tables = tables_of(list(found[1].blocks))
        if not 0 <= index < len(tables):
            raise NotFoundError(TABLE_NOT_FOUND)
        table = tables[index]
        content = self.tables.xlsx(table.get("title"), table["columns"], table["rows"])
        return TableFile(f"{file_slug(table.get('title') or 'tabla')}.xlsx", content)

    def _mine(self, username: str, conversation_id: str) -> Conversation:
        found = self.conversations.get(_uuid(conversation_id, NOT_FOUND))
        if found is None or found.username != username or found.archived or not found.title:
            raise NotFoundError(NOT_FOUND)
        return found


class PurgeAssistantData:
    """Limpieza diaria: conversaciones más viejas que la retención, códigos de vinculación
    vencidos y borradores de fotos viejos."""

    def __init__(
        self,
        conversations: ConversationRepository,
        links: ChannelLinkRepository,
        drafts: DraftRepository,
        clock: Clock,
        days: int,
    ) -> None:
        self.conversations, self.links, self.drafts = conversations, links, drafts
        self.clock, self.days = clock, days

    def __call__(self) -> int:
        now = self.clock.now()
        removed = self.conversations.purge_before(now - timedelta(days=self.days))
        self.links.purge_codes(now)
        self.drafts.purge_before(now - DRAFT_KEEP)
        if removed:
            logger.info("Historial del asistente: %d conversaciones viejas borradas", removed)
        return removed
