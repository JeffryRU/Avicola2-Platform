"""El asistente en Telegram y WhatsApp (ADR 0024).

n8n solo reenvía lo que escribe la persona. Aquí se decide qué es: vincular la cuenta, empezar otra
conversación, confirmar o descartar el registro pendiente de una foto, elegir una sugerencia por su
número o una pregunta para el asistente, que responde **como la persona vinculada** (mismos
permisos, límites y guardrails que en la app).
"""

import logging
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from uuid import uuid4

from app.planning.application.assistant import AskAssistant
from app.planning.application.assistant_history import AssistantHistory, TableFile
from app.planning.application.channel_drafts import ChannelDrafts
from app.planning.application.ports import (
    ChannelLinkRepository,
    Clock,
    ConversationRepository,
    FileTokens,
    SellerRepository,
)
from app.planning.domain.assistant import MAX_MESSAGE
from app.planning.domain.assistant_tables import chat_text, file_slug, table_as_text
from app.planning.domain.channels import (
    LINK_CODE_MINUTES,
    MAX_SENDER,
    Command,
    Extraction,
    new_link_code,
    numbered,
    parse_command,
)
from app.planning.domain.conversations import ASSISTANT, CHANNELS, Conversation
from app.planning.domain.models import Product, Seller, SellerAccount
from app.planning.domain.permissions import Permission, permissions_of
from app.shared.domain.errors import DomainError, NotFoundError

logger = logging.getLogger(__name__)

HOW_TO_LINK = (
    "Para usar el asistente por aquí, vincula tu cuenta: abre la app, entra al asistente, elige "
    "«Usar en Telegram o WhatsApp» y pide un código. Luego envíamelo así: vincular ABC123"
)
BAD_CODE = "El código no es válido o ya venció. Pide uno nuevo en la app."
BUSY = "Hiciste muchas preguntas seguidas. Espera un minuto y vuelve a intentar."
FILE_NOT_FOUND = "El archivo no existe o ya venció."
NEW_CONVERSATION = "Listo, empecemos una conversación nueva. ¿En qué te ayudo?"


@dataclass(frozen=True)
class LinkCode:
    code: str
    expires_at: datetime


class CreateLinkCode:
    """El código de 6 caracteres que la persona envía al bot (vale 10 minutos, de un solo uso)."""

    def __init__(self, links: ChannelLinkRepository, clock: Clock) -> None:
        self.links, self.clock = links, clock

    def __call__(self, account: SellerAccount) -> LinkCode:
        now = self.clock.now()
        expires = now + timedelta(minutes=LINK_CODE_MINUTES)
        code = new_link_code()
        self.links.save_code(code, account.seller.username, now, expires)
        logger.info("%s pidió un código para vincular un chat", account.seller.username)
        return LinkCode(code, expires)


@dataclass(frozen=True)
class ChannelFile:
    name: str
    token: str


@dataclass(frozen=True)
class ChannelReply:
    text: str
    files: tuple[ChannelFile, ...] = ()
    suggestions: tuple[str, ...] = ()


@dataclass(frozen=True)
class ChannelContext:
    linked: bool
    name: str = ""
    can_project: bool = False
    can_stock: bool = False
    today: date | None = None
    dates: tuple[date, ...] = ()
    products: tuple[Product, ...] = ()


def clean_sender(channel: str, sender: str) -> str:
    sender = sender.strip().lstrip("+")
    if channel not in CHANNELS:
        raise DomainError("Canal inválido.")
    if not sender or len(sender) > MAX_SENDER:
        raise DomainError("Remitente inválido.")
    return sender


class ChannelAssistant:
    def __init__(
        self,
        sellers: SellerRepository,
        links: ChannelLinkRepository,
        conversations: ConversationRepository,
        ask: AskAssistant,
        history: AssistantHistory,
        drafts: ChannelDrafts,
        files: FileTokens,
        clock: Clock,
        idle_hours: int,
        aris_roles: frozenset[str] = frozenset(),
    ) -> None:
        self.sellers, self.links, self.conversations = sellers, links, conversations
        self.aris_roles = aris_roles
        self.ask, self.history, self.drafts, self.files = ask, history, drafts, files
        self.clock, self.idle = clock, timedelta(hours=idle_hours)

    # --- Mensajes ----------------------------------------------------------------------------

    def message(self, channel: str, sender: str, text: str) -> ChannelReply:
        sender = clean_sender(channel, sender)
        command = parse_command(text)
        if command.kind == "link":
            return ChannelReply(self._link(channel, sender, command.arg))
        account = self._account(channel, sender)
        if account is None:
            return ChannelReply(HOW_TO_LINK)
        if command.kind == "new":
            self._start(account, channel)
            return ChannelReply(NEW_CONVERSATION)
        if command.kind in ("yes", "no") and self.drafts.has_pending(account):
            done = (
                self.drafts.confirm(account)
                if command.kind == "yes"
                else self.drafts.discard(account)
            )
            return ChannelReply(done)
        return self._ask(account, channel, self._question(account, channel, command, text))

    def photo(self, channel: str, sender: str, extraction: Extraction) -> ChannelReply:
        sender = clean_sender(channel, sender)
        account = self._account(channel, sender)
        if account is None:
            return ChannelReply(HOW_TO_LINK)
        return ChannelReply(self.drafts.prepare(account, channel, extraction))

    def context(self, channel: str, sender: str) -> ChannelContext:
        account = self._account(channel, clean_sender(channel, sender))
        if account is None:
            return ChannelContext(linked=False)
        return ChannelContext(
            linked=True,
            name=account.seller.name,
            can_project=self.drafts.can_project(account),
            can_stock=self.drafts.can_stock(account),
            today=self.clock.today(),
            dates=tuple(self.drafts.dates(account)),
            products=tuple(self.drafts.catalog(account)),
        )

    def aris_uploader(self, channel: str, sender: str) -> Seller | None:
        """Quién carga el export de ARIS enviado desde este chat: la persona vinculada, si su rol
        está en ARIS_CHANNEL_ROLES y además puede cargar ARIS en la app. Si no, nadie."""
        account = self._account(channel, clean_sender(channel, sender))
        if account is None:
            return None
        seller = account.seller
        allowed = seller.role in self.aris_roles
        if not allowed or Permission.LOAD_ARIS not in permissions_of(seller.role):
            return None
        return seller

    def file(self, token: str) -> TableFile:
        """El Excel de una tabla para el canal: el token firmado dice de quién y de qué mensaje;
        vencido, alterado o de una cuenta que ya no existe responde como un archivo inexistente."""
        claims = self.files.decode(token)
        if claims is None or self.sellers.get_account(claims[0]) is None:
            raise NotFoundError(FILE_NOT_FOUND)
        return self.history.table_file(*claims)

    # --- Piezas ------------------------------------------------------------------------------

    def _account(self, channel: str, sender: str) -> SellerAccount | None:
        username = self.links.username_for(channel, sender)
        if username is None:
            return None
        account = self.sellers.get_account(username)
        if account is None:
            # La cuenta ya no existe o está desactivada: el chat deja de estar vinculado.
            self.links.delete_for(username)
        return account

    def _link(self, channel: str, sender: str, code: str) -> str:
        # El límite de preguntas también frena a quien prueba códigos al azar.
        if not self.ask.allow(f"link:{channel}:{sender}"):
            return BUSY
        username = self.links.consume_code(code, self.clock.now())
        account = self.sellers.get_account(username) if username else None
        if account is None:
            return BAD_CODE
        self.links.link(channel, sender, account.seller.username, self.clock.now())
        logger.info("%s vinculó un chat de %s", account.seller.username, channel)
        return (
            f"Listo, {account.seller.name}: tu cuenta quedó vinculada. Ya puedes preguntarme por "
            "aquí. Escribe *nueva* para empezar una conversación nueva."
        )

    def _current(self, account: SellerAccount, channel: str) -> Conversation | None:
        found = self.conversations.latest_for(account.seller.username, channel)
        if found and self.clock.now() - found.updated_at <= self.idle:
            return found
        return None

    def _start(self, account: SellerAccount, channel: str) -> None:
        """Una conversación vacía: la siguiente pregunta es la primera de otra (sin título aún)."""
        now = self.clock.now()
        self.conversations.create(
            Conversation(uuid4(), account.seller.username, channel, "", now, now)
        )

    def _question(self, account: SellerAccount, channel: str, command: Command, text: str) -> str:
        """La pregunta: el texto, o la sugerencia elegida por su número."""
        if command.kind != "number":
            return text.strip()
        current = self._current(account, channel)
        if current:
            last = [m for m in self.conversations.messages(current.id) if m.role == ASSISTANT]
            number = int(command.arg)
            if last and 1 <= number <= len(last[-1].suggestions):
                return last[-1].suggestions[number - 1]
        return text.strip()

    def _ask(self, account: SellerAccount, channel: str, question: str) -> ChannelReply:
        if len(question) > MAX_MESSAGE:
            return ChannelReply(f"La pregunta puede tener hasta {MAX_MESSAGE} caracteres.")
        current = self._current(account, channel)
        conversation = str(current.id if current else uuid4())
        try:
            answer = self.ask(account, question, conversation, channel)
        except DomainError as error:
            return ChannelReply(error.message)
        parts, files = [], []
        for block in answer.blocks or ({"type": "text", "text": answer.reply},):
            if block["type"] == "table":
                parts.append(table_as_text(block["columns"], block["rows"], block.get("title")))
                if answer.message_id:
                    token = self.files.issue(account.seller.username, answer.message_id, len(files))
                    name = f"{file_slug(block.get('title') or 'tabla')}.xlsx"
                    files.append(ChannelFile(name, token))
            else:
                parts.append(chat_text(block["text"]))
        if hint := numbered(answer.suggestions):
            parts.append(hint)
        return ChannelReply("\n\n".join(parts), tuple(files), answer.suggestions)
