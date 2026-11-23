"""Sirve el build del frontend (PWA) desde FastAPI; las rutas de React caen en index.html."""

import gzip
import mimetypes
from functools import lru_cache
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, Response

# Rutas que nunca deben caer en index.html.
API_PREFIXES = ("api/", "ingest/", "mcp", "health", "docs", "redoc", "openapi.json")
# El service worker, el manifest y la versión no se cachean: así la PWA detecta las versiones
# nuevas (la app consulta version.json y se recarga sola).
NO_CACHE = {"sw.js", "registerSW.js", "manifest.webmanifest", "index.html", "version.json"}
# Vite pone un hash en el nombre de todo lo de assets/: si cambia el contenido, cambia el nombre.
IMMUTABLE_DIR = "assets"
IMMUTABLE = "public, max-age=31536000, immutable"
# Solo se comprime texto. Las fuentes woff2 y las imágenes ya vienen comprimidas.
COMPRESSIBLE = {".js", ".mjs", ".css", ".html", ".svg", ".json", ".webmanifest", ".txt"}
MIN_COMPRESS_BYTES = 1024


@lru_cache(maxsize=256)
def _gzipped(path: str, mtime_ns: int) -> bytes:  # noqa: ARG001 (mtime_ns es parte de la clave de la caché)
    """Contenido comprimido de un archivo del build (la clave incluye mtime: un build nuevo
    no reutiliza lo viejo)."""
    return gzip.compress(Path(path).read_bytes(), compresslevel=6, mtime=0)


def _accepts_gzip(request: Request) -> bool:
    """`Accept-Encoding` admite gzip (o `*`) con calidad mayor que 0 (RFC 9110 §12.5.3)."""
    for part in request.headers.get("accept-encoding", "").lower().split(","):
        coding, *params = (p.strip() for p in part.split(";"))
        if coding not in ("gzip", "*"):
            continue
        quality = 1.0
        for param in params:
            name, _, value = param.partition("=")
            if name.strip() == "q":
                try:
                    quality = float(value)
                except ValueError:
                    quality = 0.0
        if quality > 0:
            return True
    return False


def mount_spa(app: FastAPI, dist: Path) -> None:
    if not (dist / "index.html").is_file():
        return
    root = dist.resolve()

    # HEAD también: los monitores de disponibilidad suelen usarlo.
    @app.api_route("/{path:path}", methods=["GET", "HEAD"], include_in_schema=False)
    def spa(path: str, request: Request) -> Response:
        if path.startswith(API_PREFIXES):
            raise HTTPException(404)
        file = (root / path).resolve()
        if not (file.is_file() and file.is_relative_to(root)):
            # Un archivo de assets/ que no existe es de una versión anterior: 404 (y no
            # index.html, que el navegador intentaría ejecutar como JS). La app lo detecta y se
            # recarga con la versión nueva.
            if path.startswith(f"{IMMUTABLE_DIR}/"):
                raise HTTPException(404)
            file = root / "index.html"
        headers: dict[str, str] = {}
        if file.name in NO_CACHE:
            headers["Cache-Control"] = "no-cache"
        elif file.parent == root / IMMUTABLE_DIR:
            headers["Cache-Control"] = IMMUTABLE
        stat = file.stat()
        if file.suffix in COMPRESSIBLE and stat.st_size >= MIN_COMPRESS_BYTES:
            headers["Vary"] = "Accept-Encoding"
            if _accepts_gzip(request):
                media_type = mimetypes.guess_type(file.name)[0] or "application/octet-stream"
                if file.suffix == ".webmanifest":
                    media_type = "application/manifest+json"
                body = _gzipped(str(file), stat.st_mtime_ns)
                headers["Content-Encoding"] = "gzip"
                return Response(body, media_type=media_type, headers=headers)
        return FileResponse(file, headers=headers or None)
