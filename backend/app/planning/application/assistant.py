"""Asistente de la app (ADR 0022): cada persona le pregunta con su sesión y ve solo lo suyo.

El backend no llama al LLM: le pasa la pregunta al agente de n8n con un pase de pocos minutos
(`tickets`) para que el agente consulte el MCP **como esa persona**. Los permisos los siguen
aplicando los casos de uso de siempre.
"""

import logging
from collections.abc import Callable, Iterator, Sequence
from dataclasses import replace
from uuid import NAMESPACE_URL, UUID, uuid4, uuid5

from app.planning.application.ports import (
    AssistantGateway,
    AssistantRequest,
    Clock,
    ConversationRepository,
    TokenService,
)
from app.planning.domain.assistant import (
    CONVERSATION_ID,
    MAX_MESSAGE,
    MAX_SUGGESTIONS,
    AssistantAnswer,
    GuardrailRule,
    ReplyStream,
    StarterGroup,
    blocked_by,
    guard_reply,
    scope_of,
    split_reply,
    starters,
    within_scope,
)
from app.planning.domain.assistant_tables import split_blocks
from app.planning.domain.conversations import (
    APP,
    ASSISTANT,
    USER,
    Conversation,
    StoredMessage,
    title_of,
)
from app.planning.domain.models import SellerAccount
from app.planning.domain.permissions import permissions_of
from app.shared.domain.errors import (
    ConflictError,
    DomainError,
    TooManyRequestsError,
    UnavailableError,
)

logger = logging.getLogger(__name__)

BUSY = "Hiciste muchas preguntas seguidas. Espera un minuto y vuelve a intentar."
UNAVAILABLE = "El asistente no está disponible ahora. Intenta en unos minutos."
DISABLED = "El asistente no está activado."
# Memoria que se le pasa al agente: los últimos mensajes de la conversación, recortados.
HISTORY_MESSAGES = 8
HISTORY_CHARS = 1500


class AssistantUnavailableError(UnavailableError):
    """El agente no respondió (n8n caído, sin clave del LLM o se pasó del tiempo)."""


class AssistantStarters:
    """Preguntas sugeridas para empezar, según lo que la persona puede ver."""

    def __init__(self, groups: Sequence[StarterGroup]) -> None:
        self.groups = groups

    def __call__(self, account: SellerAccount) -> tuple[str, ...]:
        seller = account.seller
        return starters(self.groups, permissions_of(seller.role), seller.is_seller)

    def scope(self, account: SellerAccount) -> str:
        seller = account.seller
        return scope_of(self.groups, permissions_of(seller.role), seller.is_seller)

    def within_scope(self, account: SellerAccount, suggestions: Sequence[str]) -> tuple[str, ...]:
        seller = account.seller
        return within_scope(suggestions, self.groups, permissions_of(seller.role), seller.is_seller)


class AskAssistant:
    """Una pregunta al asistente: respuesta y preguntas para seguir."""

    def __init__(
        self,
        gateway: AssistantGateway | None,
        tickets: TokenService,
        allow: Callable[[str], bool],
        starters: AssistantStarters,
        guardrails: Sequence[GuardrailRule] = (),
        history: ConversationRepository | None = None,
        clock: Clock | None = None,
    ) -> None:
        self.gateway, self.tickets, self.allow, self.starters = gateway, tickets, allow, starters
        self.guardrails = guardrails
        # Historial (ADR 0024): sin él (pruebas, otro adaptador) no se guarda nada.
        self.history, self.clock = history, clock

    @property
    def enabled(self) -> bool:
        return self.gateway is not None

    def __call__(
        self, account: SellerAccount, message: str, conversation: str, channel: str = APP
    ) -> AssistantAnswer:
        request = self._request(account, message, conversation)
        if isinstance(request, AssistantAnswer):
            return self._record(account, message, conversation, channel, request)
        try:
            text = self.gateway.ask(request)  # type: ignore[union-attr] (validado en _request)
        except Exception:
            logger.exception("El asistente no respondió")
            raise AssistantUnavailableError(UNAVAILABLE) from None
        answer = self._finish(account, text)
        return self._record(account, message, conversation, channel, answer)

    def stream(
        self, account: SellerAccount, message: str, conversation: str, channel: str = APP
    ) -> Iterator[dict]:
        """La misma pregunta, con la respuesta en partes mientras el agente la escribe.

        Valida antes de empezar (los errores salen como siempre); después emite `delta` (texto
        que se agrega), y al final `done` con la respuesta completa y sus sugerencias (reemplaza
        lo mostrado) o `error`. Sin streaming en el agente, llega todo en una sola parte.
        """
        request = self._request(account, message, conversation)

        def events() -> Iterator[dict]:
            if isinstance(request, AssistantAnswer):
                yield _done(self._record(account, message, conversation, channel, request))
                return
            guard, parts = ReplyStream(), []
            ask_stream = getattr(self.gateway, "ask_stream", None)
            try:
                # Sin `ask_stream` (otro adaptador), la respuesta llega en una sola parte.
                chunks = ask_stream(request) if ask_stream else iter([self.gateway.ask(request)])  # type: ignore[union-attr]
                for chunk in chunks:
                    parts.append(chunk)
                    if delta := guard.feed(chunk):
                        yield {"type": "delta", "text": delta}
                answer = self._finish(account, "".join(parts))
                answer = self._record(account, message, conversation, channel, answer)
            except AssistantUnavailableError:
                yield {"type": "error", "message": UNAVAILABLE}
                return
            except Exception:
                logger.exception("El asistente no respondió")
                yield {"type": "error", "message": UNAVAILABLE}
                return
            yield _done(answer)

        return events()

    def _request(
        self, account: SellerAccount, message: str, conversation: str
    ) -> AssistantRequest | AssistantAnswer:
        """Valida la pregunta y arma lo que va al agente (o la respuesta del guardrail)."""
        message = message.strip()
        if not message:
            raise DomainError("Escribe una pregunta.")
        if len(message) > MAX_MESSAGE:
            raise DomainError(f"La pregunta puede tener hasta {MAX_MESSAGE} caracteres.")
        if not CONVERSATION_ID.match(conversation):
            raise DomainError("Conversación inválida.")
        if self.gateway is None:
            raise ConflictError(DISABLED)
        seller = account.seller
        self._check_owner(seller.username, conversation)
        if not self.allow(seller.username):
            raise TooManyRequestsError(BUSY)
        rule = blocked_by(message, self.guardrails)
        if rule is not None:
            # Ni la pregunta ni la respuesta pasan por el agente. Solo se registra la categoría.
            logger.info("Asistente: pregunta de %s detenida (%s)", seller.username, rule.category)
            return AssistantAnswer(rule.reply, self.starters(account)[:MAX_SUGGESTIONS])
        return AssistantRequest(
            message=message,
            # La memoria del agente es por persona: nadie puede seguir la conversación de otro.
            conversation=f"{seller.username}:{conversation}",
            ticket=self.tickets.issue(seller.username, account.token_version),
            username=seller.username,
            name=seller.name,
            role=seller.role,
            permissions=tuple(sorted(p.value for p in permissions_of(seller.role))),
            scope=self.starters.scope(account),
            history=self._recent(conversation),
        )

    def _recent(self, conversation: str) -> tuple[tuple[str, str], ...]:
        """Los últimos mensajes guardados de la conversación (el dueño ya se comprobó)."""
        if self.history is None:
            return ()
        cid = conversation_uuid(conversation)
        if self.history.get(cid) is None:
            return ()
        recent = self.history.messages(cid)[-HISTORY_MESSAGES:]
        return tuple((m.role, m.text[:HISTORY_CHARS]) for m in recent)

    def _finish(self, account: SellerAccount, text: str) -> AssistantAnswer:
        """La respuesta final: guardrail, sin bloque de sugerencias y con preguntas a su alcance."""
        seller = account.seller
        safe, intervened = guard_reply(text)
        if intervened:
            logger.warning(
                "Asistente: respuesta para %s corregida por el guardrail", seller.username
            )
        answer = split_reply(safe)
        if not answer.reply:
            raise AssistantUnavailableError(UNAVAILABLE)
        # Las preguntas para seguir, solo de lo que la persona puede ver; si no queda ninguna,
        # se ofrecen las de inicio.
        follow = self.starters.within_scope(account, answer.suggestions)
        return AssistantAnswer(answer.reply, follow or self.starters(account)[:MAX_SUGGESTIONS])

    def _check_owner(self, username: str, conversation: str) -> None:
        """Una conversación guardada es de una sola persona: nadie escribe en la de otra."""
        if self.history is None:
            return
        found = self.history.get(conversation_uuid(conversation))
        if found is not None and found.username != username:
            raise DomainError("Conversación inválida.")

    def _record(
        self,
        account: SellerAccount,
        message: str,
        conversation: str,
        channel: str,
        answer: AssistantAnswer,
    ) -> AssistantAnswer:
        """Guarda la pregunta y la respuesta final (también las del guardrail) en el historial.
        La respuesta vuelve con su `message_id` y sus bloques de texto y tabla."""
        if self.history is None or self.clock is None:
            return answer
        username, now = account.seller.username, self.clock.now()
        cid = conversation_uuid(conversation)
        found = self.history.get(cid)
        title = None
        if found is None:
            self.history.create(Conversation(cid, username, channel, "", now, now))
        elif found.username != username:
            raise DomainError("Conversación inválida.")
        if found is None or not found.title:
            title = title_of(message)
        self.history.add_message(StoredMessage(uuid4(), cid, USER, message.strip(), now), title)
        blocks = tuple(split_blocks(answer.reply))
        reply = StoredMessage(
            uuid4(), cid, ASSISTANT, answer.reply, self.clock.now(), blocks, answer.suggestions
        )
        self.history.add_message(reply)
        return replace(answer, message_id=str(reply.id), blocks=blocks)


def conversation_uuid(conversation: str) -> UUID:
    """El id de la conversación que elige la app (un UUID); otro identificador válido se
    convierte siempre al mismo UUID."""
    try:
        return UUID(conversation)
    except ValueError:
        return uuid5(NAMESPACE_URL, f"assistant-conversation:{conversation}")


def _done(answer: AssistantAnswer) -> dict:
    return {
        "type": "done",
        "message_id": answer.message_id,
        "reply": answer.reply,
        "blocks": list(answer.blocks),
        "suggestions": list(answer.suggestions),
    }
