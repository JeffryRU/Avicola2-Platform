"""Punto de entrada de la API."""

import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.core.config import get_settings
from app.ingest.infrastructure.http import router as ingest
from app.ingest.infrastructure.mcp import tools as ingest_mcp
from app.planning.infrastructure.http import events as planning_events
from app.planning.infrastructure.http import router as planning
from app.planning.infrastructure.mcp import tools as planning_mcp
from app.planning.infrastructure.scheduler import periodic_tasks
from app.shared.infrastructure.http import health
from app.shared.infrastructure.http.errors import register_error_handlers
from app.shared.infrastructure.http.paths import MCP_PATH
from app.shared.infrastructure.http.security import install_security
from app.shared.infrastructure.http.spa import mount_spa
from app.shared.infrastructure.logging import client as client_logs
from app.shared.infrastructure.logging.middleware import install_request_logging
from app.shared.infrastructure.logging.setup import configure_from_settings
from app.shared.infrastructure.mcp.limits import build_rate_limiter
from app.shared.infrastructure.mcp.server import BearerVerifier, McpEndpoint, build_server

settings = get_settings()
configure_from_settings(settings)

# Fuera de local la API no arranca con una configuración insegura; en local solo avisa.
problems = settings.security_problems()
if not settings.auth_secret or (problems and not settings.is_local):
    raise RuntimeError("Configuración insegura:\n- " + "\n- ".join(problems))
for problem in problems:
    logging.getLogger("app.security").warning("Solo aceptable en local: %s", problem)

# La documentación interactiva expone todos los endpoints: solo en local.
docs = {} if settings.is_local else {"docs_url": None, "redoc_url": None, "openapi_url": None}


# Servidor MCP para agentes de IA (ADR 0017): solo lectura, con los mismos casos de uso.
MCP_INSTRUCTIONS = (
    "Datos reales de AviPlanner (planificación de saca de Avícola 2): proyecciones de venta, "
    "quién registró, saca sugerida, stock, producción y cargas de archivos. Solo lectura. "
    "Fechas en AAAA-MM-DD, hora de Lima. Cada usuario ve solo lo que su rol permite. "
    "Si una herramienta devuelve una lista vacía, no hay datos: no los inventes."
)
mcp_verifier = BearerVerifier(planning_mcp.identify)
mcp_server = build_server(
    mcp_verifier, build_rate_limiter(**settings.rate_limit_options()), MCP_INSTRUCTIONS
)
planning_mcp.register(mcp_server)
ingest_mcp.register(mcp_server, may_view=planning_mcp.sees_team)
mcp_endpoint = McpEndpoint(mcp_server, MCP_PATH, mcp_verifier)


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    async with periodic_tasks(settings), mcp_endpoint.lifespan():
        yield


app = FastAPI(
    title="AviPlanner — Planificación de saca", version="0.1.0", lifespan=lifespan, **docs
)
register_error_handlers(app)
install_security(app, https=settings.cookie_secure, trusted_origins=settings.trusted_origin_list)
install_request_logging(app)
app.include_router(health.router)
app.include_router(ingest.router)
app.include_router(planning.public)
app.include_router(planning.router)
app.include_router(planning.admin)
app.include_router(planning.editing_admin)
app.include_router(planning.stock)
app.include_router(planning.saca)
app.include_router(planning.production)
app.include_router(planning.internal)
app.include_router(planning_events.router)
app.include_router(client_logs.router)
app.add_route(MCP_PATH, mcp_endpoint, include_in_schema=False)
# Al final: captura las rutas que no son de la API y sirve la app de React.
mount_spa(app, settings.frontend_dist_dir)
