"""Repositorios SQL del asistente (ADR 0024): historial, vinculaciones, códigos y borradores."""

import json
from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import and_, delete, insert, select, update
from sqlalchemy.orm import Session

from app.planning.domain.channels import PENDING, Draft
from app.planning.domain.conversations import (
    PREVIEW_CHARS,
    Conversation,
    ConversationSummary,
    StoredMessage,
)
from app.planning.infrastructure.persistence.tables import (
    assistant_channel_links,
    assistant_conversations,
    assistant_drafts,
    assistant_link_codes,
    assistant_messages,
)

conversations, messages = assistant_conversations.c, assistant_messages.c


def _aware(value: datetime) -> datetime:
    # SQLite devuelve fechas sin zona: se guardan en UTC.
    return value.replace(tzinfo=UTC) if value.tzinfo is None else value


def _utc(value: datetime) -> datetime:
    return value.astimezone(UTC)


def _conversation(row) -> Conversation:
    return Conversation(
        row.id,
        row.username,
        row.channel,
        row.title,
        _aware(row.created_at),
        _aware(row.updated_at),
        bool(row.archived),
    )


def _message(row) -> StoredMessage:
    return StoredMessage(
        row.id,
        row.conversation_id,
        row.role,
        row.text,
        _aware(row.created_at),
        tuple(json.loads(row.blocks)) if row.blocks else (),
        tuple(json.loads(row.suggestions)) if row.suggestions else (),
    )


class SqlConversationRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    def get(self, conversation_id: UUID) -> Conversation | None:
        row = self.session.execute(
            select(assistant_conversations).where(conversations.id == conversation_id)
        ).first()
        return _conversation(row) if row else None

    def create(self, conversation: Conversation) -> None:
        self.session.execute(
            insert(assistant_conversations).values(
                id=conversation.id,
                username=conversation.username,
                channel=conversation.channel,
                title=conversation.title,
                created_at=_utc(conversation.created_at),
                updated_at=_utc(conversation.updated_at),
                archived=conversation.archived,
            )
        )
        self.session.commit()

    def add_message(self, message: StoredMessage, title: str | None = None) -> None:
        self.session.execute(
            insert(assistant_messages).values(
                id=message.id,
                conversation_id=message.conversation_id,
                role=message.role,
                text=message.text,
                blocks=json.dumps(list(message.blocks), ensure_ascii=False)
                if message.blocks
                else None,
                suggestions=json.dumps(list(message.suggestions), ensure_ascii=False)
                if message.suggestions
                else None,
                created_at=_utc(message.created_at),
            )
        )
        changes: dict = {"updated_at": _utc(message.created_at)}
        if title is not None:
            changes["title"] = title
        self.session.execute(
            update(assistant_conversations)
            .where(conversations.id == message.conversation_id)
            .values(**changes)
        )
        self.session.commit()

    def messages(self, conversation_id: UUID) -> list[StoredMessage]:
        rows = self.session.execute(
            select(assistant_messages)
            .where(messages.conversation_id == conversation_id)
            .order_by(messages.created_at, messages.id)
        ).all()
        return [_message(r) for r in rows]

    def message(self, message_id: UUID) -> tuple[Conversation, StoredMessage] | None:
        row = self.session.execute(
            select(assistant_messages).where(messages.id == message_id)
        ).first()
        if row is None:
            return None
        conversation = self.get(row.conversation_id)
        return (conversation, _message(row)) if conversation else None

    def list_for(
        self, username: str, limit: int, before: datetime | None
    ) -> list[ConversationSummary]:
        query = select(assistant_conversations).where(
            conversations.username == username,
            conversations.archived.is_(False),
            conversations.title != "",
        )
        if before is not None:
            query = query.where(conversations.updated_at < _utc(before))
        rows = self.session.execute(query.order_by(conversations.updated_at.desc()).limit(limit))
        found = []
        for row in rows.all():
            last = self.session.scalar(
                select(messages.text)
                .where(messages.conversation_id == row.id)
                .order_by(messages.created_at.desc(), messages.role.asc())
                .limit(1)
            )
            preview = " ".join((last or "").split())[:PREVIEW_CHARS]
            found.append(
                ConversationSummary(row.id, row.title, row.channel, _aware(row.updated_at), preview)
            )
        return found

    def latest_for(self, username: str, channel: str) -> Conversation | None:
        row = self.session.execute(
            select(assistant_conversations)
            .where(
                conversations.username == username,
                conversations.channel == channel,
                conversations.archived.is_(False),
            )
            .order_by(conversations.updated_at.desc())
            .limit(1)
        ).first()
        return _conversation(row) if row else None

    def archive(self, conversation_id: UUID) -> None:
        self.session.execute(
            update(assistant_conversations)
            .where(conversations.id == conversation_id)
            .values(archived=True)
        )
        self.session.commit()

    def purge_before(self, cutoff: datetime) -> int:
        old = select(conversations.id).where(conversations.updated_at < _utc(cutoff))
        self.session.execute(delete(assistant_messages).where(messages.conversation_id.in_(old)))
        result = self.session.execute(
            delete(assistant_conversations).where(conversations.updated_at < _utc(cutoff))
        )
        self.session.commit()
        return result.rowcount or 0


links, codes = assistant_channel_links.c, assistant_link_codes.c


class SqlChannelLinkRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    def link(self, channel: str, sender: str, username: str, now: datetime) -> None:
        self.session.execute(
            delete(assistant_channel_links).where(
                and_(links.channel == channel, links.sender == sender)
            )
        )
        self.session.execute(
            insert(assistant_channel_links).values(
                channel=channel, sender=sender, username=username, created_at=_utc(now)
            )
        )
        self.session.commit()

    def username_for(self, channel: str, sender: str) -> str | None:
        return self.session.scalar(
            select(links.username).where(links.channel == channel, links.sender == sender)
        )

    def delete_for(self, username: str) -> int:
        result = self.session.execute(
            delete(assistant_channel_links).where(links.username == username)
        )
        self.session.commit()
        return result.rowcount or 0

    def save_code(self, code: str, username: str, now: datetime, expires_at: datetime) -> None:
        self.session.execute(delete(assistant_link_codes).where(codes.username == username))
        self.session.execute(
            insert(assistant_link_codes).values(
                code=code, username=username, created_at=_utc(now), expires_at=_utc(expires_at)
            )
        )
        self.session.commit()

    def consume_code(self, code: str, now: datetime) -> str | None:
        row = self.session.execute(select(assistant_link_codes).where(codes.code == code)).first()
        if row is None:
            return None
        # Un solo uso: se borra al leerlo, esté vigente o no.
        self.session.execute(delete(assistant_link_codes).where(codes.code == code))
        self.session.commit()
        return row.username if _aware(row.expires_at) > now else None

    def purge_codes(self, now: datetime) -> int:
        result = self.session.execute(
            delete(assistant_link_codes).where(codes.expires_at <= _utc(now))
        )
        self.session.commit()
        return result.rowcount or 0


drafts = assistant_drafts.c


def _draft(row) -> Draft:
    return Draft(
        row.id,
        row.username,
        row.channel,
        row.kind,
        json.loads(row.payload),
        _aware(row.created_at),
        _aware(row.expires_at),
        row.status,
    )


class SqlDraftRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    def replace(self, draft: Draft) -> None:
        # Un solo borrador pendiente por persona: el nuevo reemplaza al anterior.
        self.session.execute(
            update(assistant_drafts)
            .where(drafts.username == draft.username, drafts.status == PENDING)
            .values(status="discarded")
        )
        self.session.execute(
            insert(assistant_drafts).values(
                id=draft.id,
                username=draft.username,
                channel=draft.channel,
                kind=draft.kind,
                payload=json.dumps(draft.payload, ensure_ascii=False),
                created_at=_utc(draft.created_at),
                expires_at=_utc(draft.expires_at),
                status=draft.status,
            )
        )
        self.session.commit()

    def pending(self, username: str) -> Draft | None:
        row = self.session.execute(
            select(assistant_drafts)
            .where(drafts.username == username, drafts.status == PENDING)
            .order_by(drafts.created_at.desc())
            .limit(1)
        ).first()
        return _draft(row) if row else None

    def set_status(self, draft_id: UUID, status: str) -> None:
        self.session.execute(
            update(assistant_drafts).where(drafts.id == draft_id).values(status=status)
        )
        self.session.commit()

    def purge_before(self, cutoff: datetime) -> int:
        result = self.session.execute(
            delete(assistant_drafts).where(drafts.expires_at < _utc(cutoff))
        )
        self.session.commit()
        return result.rowcount or 0
