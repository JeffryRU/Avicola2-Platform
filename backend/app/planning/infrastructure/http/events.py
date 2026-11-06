"""GET /api/events: canal en tiempo real (Server-Sent Events) hacia el navegador.

Solo avisa que algo cambió (nueva notificación, proyecciones actualizadas, sesión cerrada); los
datos se vuelven a pedir por la API normal. SSE y no WebSocket: va en un solo sentido, se
reconecta solo, usa la misma cookie de sesión y pasa sin problemas por Caddy o Traefik.
"""

import asyncio
import json
from collections.abc import AsyncIterator

from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse

from app.core.config import get_settings
from app.planning.bootstrap import build_use_cases
from app.planning.domain.models import SellerAccount
from app.planning.domain.notifications import SESSION_REVOKED, Event
from app.planning.infrastructure.events import Subscription, event_bus
from app.planning.infrastructure.http.router import SessionToken
from app.shared.domain.errors import AuthenticationError, ForbiddenError
from app.shared.infrastructure.database.session import SessionLocal

router = APIRouter(prefix="/api", tags=["events"])

# Comentario cada 20 s: los proxies no cierran la conexión por inactividad y el servidor
# detecta antes a los navegadores que se fueron.
HEARTBEAT_SECONDS = 20.0
RETRY_MS = 5000


def _authenticate(token: str | None) -> SellerAccount:
    """Abre y cierra su propia sesión de base: una conexión SSE dura horas y no debe ocupar
    una conexión del pool mientras tanto."""
    if not token:
        raise AuthenticationError("Inicia sesión para continuar.")
    with SessionLocal() as session:
        account = build_use_cases(session, get_settings()).current_account(token)
    if account.must_change_password:
        raise ForbiddenError("Debes cambiar tu contraseña antes de continuar.")
    return account


def _format(event: Event) -> str:
    return f"event: {event.type}\ndata: {json.dumps(event.data, ensure_ascii=False)}\n\n"


async def _stream(request: Request, subscription: Subscription) -> AsyncIterator[str]:
    yield f"retry: {RETRY_MS}\n: conectado\n\n"
    while not await request.is_disconnected():
        try:
            event = await asyncio.wait_for(subscription.next(), HEARTBEAT_SECONDS)
        except TimeoutError:
            yield ": ping\n\n"
            continue
        yield _format(event)
        if event.type == SESSION_REVOKED:
            return  # la sesión ya no vale: el navegador la cierra y no debe reconectar


@router.get("/events")
async def events(request: Request, token: SessionToken) -> StreamingResponse:
    account = await asyncio.to_thread(_authenticate, token)

    async def body() -> AsyncIterator[str]:
        async with event_bus.subscribe(account.seller.username, account.seller.role) as sub:
            async for chunk in _stream(request, sub):
                yield chunk

    return StreamingResponse(
        body(),
        media_type="text/event-stream",
        # X-Accel-Buffering: que ningún proxy acumule los eventos antes de enviarlos.
        headers={"Cache-Control": "no-store", "X-Accel-Buffering": "no"},
    )
