"""Asistente de la app (ADR 0022): cada persona le pregunta con su sesión y ve solo lo suyo.

El backend no llama al LLM: le pasa la pregunta al agente de n8n con un pase de pocos minutos
(`tickets`) para que el agente consulte el MCP **como esa persona**. Los permisos los siguen
aplicando los casos de uso de siempre.
"""

import logging
from collections.abc import Callable, Iterator, Sequence

from app.planning.application.ports import AssistantGateway, AssistantRequest, TokenService
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
    ) -> None:
        self.gateway, self.tickets, self.allow, self.starters = gateway, tickets, allow, starters
        self.guardrails = guardrails

    @property
    def enabled(self) -> bool:
        return self.gateway is not None

    def __call__(self, account: SellerAccount, message: str, conversation: str) -> AssistantAnswer:
        request = self._request(account, message, conversation)
        if isinstance(request, AssistantAnswer):
            return request
        try:
            text = self.gateway.ask(request)  # type: ignore[union-attr] (validado en _request)
        except Exception:
            logger.exception("El asistente no respondió")
            raise AssistantUnavailableError(UNAVAILABLE) from None
        return self._finish(account, text)

    def stream(self, account: SellerAccount, message: str, conversation: str) -> Iterator[dict]:
        """La misma pregunta, con la respuesta en partes mientras el agente la escribe.

        Valida antes de empezar (los errores salen como siempre); después emite `delta` (texto
        que se agrega), y al final `done` con la respuesta completa y sus sugerencias (reemplaza
        lo mostrado) o `error`. Sin streaming en el agente, llega todo en una sola parte.
        """
        request = self._request(account, message, conversation)

        def events() -> Iterator[dict]:
            if isinstance(request, AssistantAnswer):
                yield _done(request)
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
        )

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


def _done(answer: AssistantAnswer) -> dict:
    return {"type": "done", "reply": answer.reply, "suggestions": list(answer.suggestions)}
