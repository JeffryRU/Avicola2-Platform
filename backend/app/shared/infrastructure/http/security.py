"""Cabeceras de seguridad, bloqueo de peticiones de otros sitios (CSRF) y API sin caché."""

import logging
from collections.abc import Awaitable, Callable
from urllib.parse import urlsplit

from fastapi import FastAPI, Request, Response
from fastapi.responses import JSONResponse

logger = logging.getLogger("app.http")

# Solo recursos propios; las fuentes de Google son la única excepción (index.html).
CSP = "; ".join(
    [
        "default-src 'self'",
        "script-src 'self'",
        # React usa atributos style (gráficos, animaciones): requieren 'unsafe-inline'.
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
        "font-src 'self' https://fonts.gstatic.com",
        "img-src 'self' data: blob:",
        "connect-src 'self'",
        "manifest-src 'self'",
        "worker-src 'self'",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
        "frame-ancestors 'none'",
    ]
)
HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "same-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()",
    "Cross-Origin-Opener-Policy": "same-origin",
}
HSTS = "max-age=31536000; includeSubDomains"
UNSAFE_METHODS = {"POST", "PUT", "PATCH", "DELETE"}
NO_STORE_PREFIXES = ("/api/", "/ingest/")
# Swagger y ReDoc (solo en local) cargan scripts de un CDN: sin CSP.
DOCS_PREFIXES = ("/docs", "/redoc")


def _cross_site(request: Request) -> bool:
    """Una página de otro dominio intentando usar la sesión del usuario (CSRF)."""
    if request.headers.get("sec-fetch-site") == "cross-site":
        return True
    origin = request.headers.get("origin")
    return bool(origin) and urlsplit(origin).netloc != request.headers.get("host")


def install_security(app: FastAPI, https: bool) -> None:
    @app.middleware("http")
    async def secure(
        request: Request, call_next: Callable[[Request], Awaitable[Response]]
    ) -> Response:
        path = request.url.path
        if request.method in UNSAFE_METHODS and path.startswith("/api/") and _cross_site(request):
            logger.warning(
                "Bloqueada petición de otro sitio a %s (origin=%s)",
                path,
                request.headers.get("origin", "-"),
            )
            return JSONResponse({"detail": "Origen no permitido."}, status_code=403)

        response = await call_next(request)
        for name, value in HEADERS.items():
            response.headers.setdefault(name, value)
        if not path.startswith(DOCS_PREFIXES):
            response.headers.setdefault("Content-Security-Policy", CSP)
        if https:
            response.headers.setdefault("Strict-Transport-Security", HSTS)
        if path.startswith(NO_STORE_PREFIXES):
            # Datos de un usuario: ni el navegador ni un proxy los guardan.
            response.headers["Cache-Control"] = "no-store"
        return response
