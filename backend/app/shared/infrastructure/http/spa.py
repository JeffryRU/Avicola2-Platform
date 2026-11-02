"""Sirve el build del frontend (PWA) desde FastAPI; las rutas de React caen en index.html."""

from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse

# Rutas que nunca deben caer en index.html.
API_PREFIXES = ("api/", "ingest/", "health", "docs", "redoc", "openapi.json")
# El service worker y el manifest no se cachean: así la PWA detecta las versiones nuevas.
NO_CACHE = {"sw.js", "registerSW.js", "manifest.webmanifest", "index.html"}


def mount_spa(app: FastAPI, dist: Path) -> None:
    if not (dist / "index.html").is_file():
        return
    root = dist.resolve()

    # HEAD también: los monitores de disponibilidad suelen usarlo.
    @app.api_route("/{path:path}", methods=["GET", "HEAD"], include_in_schema=False)
    def spa(path: str) -> FileResponse:
        if path.startswith(API_PREFIXES):
            raise HTTPException(404)
        file = (root / path).resolve()
        if not (file.is_file() and file.is_relative_to(root)):
            file = root / "index.html"
        headers = {"Cache-Control": "no-cache"} if file.name in NO_CACHE else None
        return FileResponse(file, headers=headers)
