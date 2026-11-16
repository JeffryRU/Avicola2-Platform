"""Prefijos de las rutas HTTP: una sola definición para routers, seguridad y logs."""

# API de la app (web y móvil) y API de ingesta (la usa n8n).
API_PREFIX = "/api"
INGEST_PREFIX = "/ingest"
# Lo que es API, no la PWA: sin caché del navegador y registrado en INFO.
API_PATH_PREFIXES = (f"{API_PREFIX}/", f"{INGEST_PREFIX}/")
