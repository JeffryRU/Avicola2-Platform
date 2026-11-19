"""Servidor MCP montado en la API (Streamable HTTP en `/mcp`), con el SDK oficial `mcp` (ADR 0017).

- **Autenticación:** `Authorization: Bearer <token>`. Sin token o con uno inválido: 401 (lo
  responde el SDK, antes de llegar a ninguna herramienta). Quién es el dueño del token lo
  decide el módulo de cuentas (`identify`), no este archivo.
- **Límite y auditoría:** cada `tools/call` cuenta en el límite del usuario y deja una línea de
  log (`app.mcp`) con usuario, herramienta, argumentos resumidos y resultado.
- **Pase del asistente (ADR 0022):** el agente de servicio puede mandar `?ticket=<pase>` para
  consultar como la persona que preguntó en el chat de la app. Solo vale junto con un token que
  pueda delegar (`Identity.may_delegate`); un pase solo, o mandado como Bearer, recibe 401.
- **Sin estado:** cada petición es independiente (`stateless_http`), así funciona igual con
  varios workers de uvicorn y no hay sesiones que limpiar.
"""

import json
import logging
import re
import time
from collections.abc import AsyncIterator, Callable, Iterator, Mapping
from contextlib import asynccontextmanager, contextmanager
from contextvars import ContextVar
from dataclasses import dataclass
from typing import Any
from urllib.parse import parse_qs

import anyio.to_thread
from mcp.server.auth.middleware.auth_context import get_access_token
from mcp.server.auth.provider import AccessToken
from mcp.server.auth.settings import AuthSettings
from mcp.server.mcpserver import MCPServer
from mcp.server.mcpserver.exceptions import ToolError
from mcp.server.transport_security import TransportSecuritySettings
from mcp.types import CallToolResult, TextContent
from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Receive, Scope, Send

from app.shared.domain.errors import DomainError
from app.shared.infrastructure.mcp.limits import RateLimiter

audit_logger = logging.getLogger("app.mcp")
logger = logging.getLogger(__name__)

TOOLS_CALL = "tools/call"
# Resumen de los argumentos en el log: valores cortos y pocas claves (nunca el token).
MAX_LOGGED_ARGS = 8
MAX_LOGGED_VALUE = 60
NO_OAUTH_ISSUER = "http://localhost"
# Saltos de línea y otros caracteres de control: en el log de texto fabricarían líneas falsas.
_CONTROL = re.compile(r"[\x00-\x1f\x7f-\x9f\u2028\u2029]")
RATE_LIMITED = "Demasiadas consultas seguidas. Espera un minuto y vuelve a intentar."
# Prefijo interno del token cuando se consulta con un pase: nadie puede mandarlo como Bearer.
TICKET_PREFIX = "ticket:"


@dataclass(frozen=True)
class Identity:
    """Quién llama: el usuario dueño del token, su rol y sus permisos ya resueltos."""

    username: str
    role: str
    permissions: frozenset[str]
    token: str = ""
    # Puede consultar en nombre de otra persona con un pase (solo el agente de servicio).
    may_delegate: bool = False

    def can(self, permission: str) -> bool:
        return permission in self.permissions


# Identidad ya resuelta en esta petición por `McpEndpoint` (token, identidad): así la base se
# consulta una sola vez y un fallo de la base responde 503, no 500.
_resolved: ContextVar[tuple[str, Identity | None] | None] = ContextVar("mcp_resolved", default=None)


class BearerVerifier:
    """`TokenVerifier` del SDK. `identify` corre en un hilo (consulta la base, es síncrono)."""

    def __init__(self, identify: Callable[[str], Identity | None]) -> None:
        self.identify = identify

    async def verify_token(self, token: str) -> AccessToken | None:
        resolved = _resolved.get()
        if resolved is not None and resolved[0] == token:
            identity = resolved[1]
        else:
            identity = await anyio.to_thread.run_sync(self.identify, token)
        if identity is None:
            return None
        return AccessToken(
            token=token,
            client_id=identity.username,
            subject=identity.username,
            scopes=[],
            claims={"role": identity.role, "permissions": sorted(identity.permissions)},
        )


def bearer_token(scope: Scope) -> str | None:
    """El token como lo lee el SDK: la primera cabecera Authorization que empieza con «Bearer »."""
    for name, value in scope.get("headers", ()):
        if name.lower() == b"authorization":
            header = value.decode("latin-1")
            return header[7:] if header.lower().startswith("bearer ") else None
    return None


def query_ticket(scope: Scope) -> str | None:
    """El pase del asistente (`?ticket=`), si viene."""
    values = parse_qs(scope.get("query_string", b"").decode("latin-1")).get("ticket")
    return values[0] if values and values[0] else None


def _with_bearer(scope: Scope, token: str) -> Scope:
    headers = [(k, v) for k, v in scope.get("headers", ()) if k.lower() != b"authorization"]
    headers.append((b"authorization", f"Bearer {token}".encode("latin-1")))
    return {**scope, "headers": headers}


def current_identity() -> Identity:
    """El usuario de la petición en curso (dentro de una herramienta)."""
    access = get_access_token()
    if access is None or not access.subject:
        # No debería pasar: el SDK responde 401 antes de llegar aquí.
        raise ToolError("Falta identificarse.")
    claims = access.claims or {}
    return Identity(
        access.subject,
        str(claims.get("role", "")),
        frozenset(claims.get("permissions", ())),
        access.token,
    )


@contextmanager
def domain_errors() -> Iterator[None]:
    """Un error de dominio (permiso, fechas inválidas) vuelve al agente con su mensaje."""
    try:
        yield
    except DomainError as exc:
        raise ToolError(exc.message) from exc


def compact_json(data: object) -> str:
    """La respuesta de una herramienta: JSON sin espacios (cada carácter es costo del agente)."""
    return json.dumps(data, ensure_ascii=False, separators=(",", ":"), default=str)


def _short(value: object) -> str:
    """Texto seguro para el log: una sola línea y como mucho MAX_LOGGED_VALUE caracteres."""
    text = value if isinstance(value, str) else repr(value)
    if len(text) > MAX_LOGGED_VALUE:
        text = text[: MAX_LOGGED_VALUE - 1] + "…"
    return _CONTROL.sub("·", text)


def summarize_args(arguments: object) -> dict[str, str]:
    """Argumentos para el log: como mucho MAX_LOGGED_ARGS claves y valores recortados."""
    if not isinstance(arguments, Mapping):
        return {} if arguments is None else {"_": _short(arguments)}
    items = list(arguments.items())[:MAX_LOGGED_ARGS]
    return {_short(str(k)): _short(v) for k, v in items}


def _outcome(result: object) -> tuple[str, str, int]:
    """(resultado, mensaje de error, tamaño de la respuesta en caracteres).

    El SDK entrega el resultado ya en su forma de red (un dict con `content` e `isError`)."""
    if isinstance(result, CallToolResult):
        result = result.model_dump(by_alias=True)
    if not isinstance(result, Mapping):
        return "ok", "", 0
    blocks = result.get("content") or []
    text = "".join(str(b.get("text", "")) for b in blocks if isinstance(b, Mapping))
    failed = bool(result.get("isError"))
    return ("error" if failed else "ok"), (text if failed else ""), len(text)


class AuditAndLimit:
    """Middleware del servidor MCP: límite por usuario y una línea de auditoría por llamada.

    Envuelve también los argumentos inválidos (el SDK los rechaza dentro de `call_next`), así
    que cuentan para el límite y quedan en el registro."""

    def __init__(self, limiter: RateLimiter) -> None:
        self.limiter = limiter

    async def __call__(self, ctx: Any, call_next: Callable[[Any], Any]) -> Any:
        if ctx.method != TOOLS_CALL:
            return await call_next(ctx)
        params = ctx.params or {}
        # Lo manda el cliente: recortado y sin saltos de línea antes de llegar al log.
        tool, args = _short(str(params.get("name", ""))), summarize_args(params.get("arguments"))
        access = get_access_token()
        user = access.subject if access and access.subject else "-"
        role = str((access.claims or {}).get("role", "-")) if access else "-"
        start = time.perf_counter()
        allowed = await anyio.to_thread.run_sync(self.limiter.allow, user)
        if not allowed:
            self._log(logging.WARNING, user, role, tool, args, "rate_limited", "", 0, start)
            return CallToolResult(content=[TextContent(text=RATE_LIMITED)], is_error=True)
        try:
            result = await call_next(ctx)
        except Exception as exc:
            self._log(logging.WARNING, user, role, tool, args, "rejected", _short(exc), 0, start)
            raise
        outcome, error, size = _outcome(result)
        level = logging.INFO if outcome == "ok" else logging.WARNING
        self._log(level, user, role, tool, args, outcome, _short(error), size, start)
        return result

    @staticmethod
    def _log(
        level: int,
        user: str,
        role: str,
        tool: str,
        args: dict[str, str],
        outcome: str,
        error: str,
        size: int,
        start: float,
    ) -> None:
        audit_logger.log(
            level,
            "MCP %s de %s → %s",
            tool,
            user,
            outcome,
            extra={
                "mcp_user": user,
                "mcp_role": role,
                "mcp_tool": tool,
                "mcp_args": args,
                "mcp_result": outcome,
                "mcp_error": error,
                "mcp_size": size,
                "duration_ms": round((time.perf_counter() - start) * 1000, 1),
            },
        )


def build_server(verifier: BearerVerifier, limiter: RateLimiter, instructions: str) -> MCPServer:
    """Servidor sin herramientas: cada módulo registra las suyas (`register(server)`)."""
    return MCPServer(
        name="aviplanner",
        title="AviPlanner",
        instructions=instructions,
        token_verifier=verifier,
        # Solo como servidor de recursos: los tokens los emite la propia API (/api/auth/token)
        # o son el token de servicio del agente. Sin OAuth ni metadatos de descubrimiento, así
        # que `issuer_url` (obligatorio en el SDK) no se publica ni se usa.
        auth=AuthSettings(issuer_url=NO_OAUTH_ISSUER, resource_server_url=None),
        middleware=[AuditAndLimit(limiter)],
        # Si el logging aún no está configurado, el SDK llama a basicConfig con este nivel.
        log_level="WARNING",
    )


class McpEndpoint:
    """El endpoint `/mcp` como aplicación ASGI.

    El administrador de sesiones del SDK solo se puede arrancar una vez por instancia, y
    Starlette no arranca el `lifespan` de una sub-aplicación. Por eso cada `lifespan()` de la
    API arma una aplicación nueva y la sirve mientras dura. Fuera de él responde 503.

    Antes de pasarle la petición al SDK resuelve el token: si la base no responde, contesta
    503 (el SDK solo sabe responder 401 o 500)."""

    def __init__(
        self,
        server: MCPServer,
        path: str,
        verifier: BearerVerifier,
        delegate: Callable[[str], Identity | None] | None = None,
    ) -> None:
        self.server, self.path, self.verifier = server, path, verifier
        # Resuelve un pase del asistente (quién preguntó); None: no se aceptan pases.
        self.delegate = delegate
        self._app: ASGIApp | None = None

    @asynccontextmanager
    async def lifespan(self) -> AsyncIterator[None]:
        app = self.server.streamable_http_app(
            streamable_http_path=self.path,
            stateless_http=True,
            json_response=True,
            # Sin cookies ni sesión del navegador (solo Bearer), un sitio ajeno no puede usar
            # las credenciales de nadie: la protección contra DNS rebinding no aporta y
            # rechazaría el host real (p. ej. backend:8000 desde n8n).
            transport_security=TransportSecuritySettings(enable_dns_rebinding_protection=False),
        )
        async with self.server.session_manager.run():
            self._app = app
            try:
                yield
            finally:
                self._app = None

    async def _identify(
        self, scope: Scope, token: str
    ) -> tuple[Scope, str, Identity | None] | None:
        """(petición, token, identidad) con que sigue la llamada; None: 401 por el pase.

        Con `?ticket=`, quien llama tiene que poder delegar (el agente de servicio) y la
        identidad pasa a ser la dueña del pase."""
        if token.startswith(TICKET_PREFIX):
            return None
        identity = await anyio.to_thread.run_sync(self.verifier.identify, token)
        ticket = query_ticket(scope)
        if ticket is None:
            return scope, token, identity
        if identity is None or not identity.may_delegate or self.delegate is None:
            return None
        person = await anyio.to_thread.run_sync(self.delegate, ticket)
        if person is None:
            return None
        token = f"{TICKET_PREFIX}{ticket}"
        return _with_bearer(scope, token), token, person

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] == "http" and scope["method"] == "GET":
            # Sin estado no hay mensajes del servidor por SSE: un GET dejaría una conexión
            # abierta sin uso. Los clientes MCP aceptan el 405 y siguen solo con POST.
            response = JSONResponse(
                {"detail": "Usa POST."}, status_code=405, headers={"Allow": "POST"}
            )
            await response(scope, receive, send)
            return
        if self._app is None:
            await _unavailable("El servidor MCP no está listo.")(scope, receive, send)
            return
        token = bearer_token(scope) if scope["type"] == "http" else None
        if token is None:
            await self._app(scope, receive, send)  # el SDK responde 401
            return
        try:
            found = await self._identify(scope, token)
        except Exception:
            logger.exception("No se pudo verificar el token del MCP")
            await _unavailable("No se pudo verificar el acceso. Intenta en un minuto.")(
                scope, receive, send
            )
            return
        if found is None:
            await _unauthorized()(scope, receive, send)
            return
        scope, token, identity = found
        resolved = _resolved.set((token, identity))
        try:
            await self._app(scope, receive, send)
        finally:
            _resolved.reset(resolved)


def _unauthorized() -> JSONResponse:
    return JSONResponse(
        {"detail": "Pase del asistente inválido o vencido."},
        status_code=401,
        headers={"WWW-Authenticate": "Bearer"},
    )


def _unavailable(detail: str) -> JSONResponse:
    return JSONResponse({"detail": detail}, status_code=503, headers={"Retry-After": "60"})
