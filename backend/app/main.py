"""Punto de entrada de la API."""

from fastapi import FastAPI

from app.core.config import get_settings
from app.ingest.infrastructure.http import router as ingest
from app.planning.infrastructure.http import router as planning
from app.shared.infrastructure.http import health
from app.shared.infrastructure.http.errors import register_error_handlers
from app.shared.infrastructure.http.spa import mount_spa
from app.shared.infrastructure.logging.middleware import install_request_logging
from app.shared.infrastructure.logging.setup import configure_from_settings

settings = get_settings()
configure_from_settings(settings)

app = FastAPI(title="Avícola 2 — Planificación de saca", version="0.1.0")
register_error_handlers(app)
install_request_logging(app)
app.include_router(health.router)
app.include_router(ingest.router)
app.include_router(planning.public)
app.include_router(planning.router)
# Al final: captura las rutas que no son de la API y sirve la app de React.
mount_spa(app, settings.frontend_dist_dir)
