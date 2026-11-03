"""Punto de entrada de la API."""

import logging

from fastapi import FastAPI

from app.core.config import get_settings
from app.ingest.infrastructure.http import router as ingest
from app.planning.infrastructure.http import events as planning_events
from app.planning.infrastructure.http import router as planning
from app.shared.infrastructure.http import health
from app.shared.infrastructure.http.errors import register_error_handlers
from app.shared.infrastructure.http.security import install_security
from app.shared.infrastructure.http.spa import mount_spa
from app.shared.infrastructure.logging import client as client_logs
from app.shared.infrastructure.logging.middleware import install_request_logging
from app.shared.infrastructure.logging.setup import configure_from_settings

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
app = FastAPI(title="Avícola 2 — Planificación de saca", version="0.1.0", **docs)
register_error_handlers(app)
install_security(app, https=settings.cookie_secure)
install_request_logging(app)
app.include_router(health.router)
app.include_router(ingest.router)
app.include_router(planning.public)
app.include_router(planning.router)
app.include_router(planning.admin)
app.include_router(planning.internal)
app.include_router(planning_events.router)
app.include_router(client_logs.router)
# Al final: captura las rutas que no son de la API y sirve la app de React.
mount_spa(app, settings.frontend_dist_dir)
