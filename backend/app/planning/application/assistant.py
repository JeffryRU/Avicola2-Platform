"""Asistente de la app (ADR 0022): cada persona le pregunta con su sesión y ve solo lo suyo.

El backend no llama al LLM: le pasa la pregunta al agente de n8n con un pase de pocos minutos
(`tickets`) para que el agente consulte el MCP **como esa persona**. Los permisos los siguen
aplicando los casos de uso de siempre.
"""

import logging
from collections.abc import Callable, Sequence

from app.planning.application.ports import AssistantGateway, AssistantRequest, TokenService
from app.planning.domain.assistant import (
    CONVERSATION_ID,
    MAX_MESSAGE,
    AssistantAnswer,
    StarterGroup,
    split_reply,
    starters,
)
from app.planning.domain.models import SellerAccount
from app.planning.domain.permissions import permissions_of
from app.shared.domain.errors import DomainError, TooManyRequestsError, UnavailableError

logger = logging.getLogger(__name__)

BUSY = "Hiciste muchas preguntas seguidas. Espera un minuto y vuelve a intentar."
UNAVAILABLE = "El asistente no está disponible ahora. Intenta en unos minutos."


class AssistantUnavailableError(UnavailableError):
    """El agente no respondió (n8n caído, sin clave del LLM o se pasó del tiempo)."""


class AssistantStarters:
    """Preguntas sugeridas para empezar, según lo que la persona puede ver."""

    def __init__(self, groups: Sequence[StarterGroup]) -> None:
        self.groups = groups

    def __call__(self, account: SellerAccount) -> tuple[str, ...]:
        seller = account.seller
        return starters(self.groups, permissions_of(seller.role), seller.is_seller)


class AskAssistant:
    """Una pregunta al asistente: respuesta y preguntas para seguir."""

    def __init__(
        self,
        gateway: AssistantGateway | None,
        tickets: TokenService,
        allow: Callable[[str], bool],
        starters: AssistantStarters,
    ) -> None:
        self.gateway, self.tickets, self.allow, self.starters = gateway, tickets, allow, starters

    @property
    def enabled(self) -> bool:
        return self.gateway is not None

    def __call__(self, account: SellerAccount, message: str, conversation: str) -> AssistantAnswer:
        message = message.strip()
        if not message:
            raise DomainError("Escribe una pregunta.")
        if len(message) > MAX_MESSAGE:
            raise DomainError(f"La pregunta puede tener hasta {MAX_MESSAGE} caracteres.")
        if not CONVERSATION_ID.match(conversation):
            raise DomainError("Conversación inválida.")
        if self.gateway is None:
            raise AssistantUnavailableError(UNAVAILABLE)
        seller = account.seller
        if not self.allow(seller.username):
            raise TooManyRequestsError(BUSY)
        request = AssistantRequest(
            message=message,
            # La memoria del agente es por persona: nadie puede seguir la conversación de otro.
            conversation=f"{seller.username}:{conversation}",
            ticket=self.tickets.issue(seller.username, account.token_version),
            username=seller.username,
            name=seller.name,
            role=seller.role,
            permissions=tuple(sorted(p.value for p in permissions_of(seller.role))),
        )
        try:
            text = self.gateway.ask(request)
        except Exception:
            logger.exception("El asistente no respondió")
            raise AssistantUnavailableError(UNAVAILABLE) from None
        answer = split_reply(text)
        if not answer.reply:
            raise AssistantUnavailableError(UNAVAILABLE)
        # Si el agente no propuso cómo seguir, se ofrecen las preguntas de inicio.
        return (
            answer
            if answer.suggestions
            else AssistantAnswer(answer.reply, self.starters(account)[:3])
        )
