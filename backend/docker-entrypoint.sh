#!/bin/sh
set -e

# Aplica las migraciones pendientes antes de levantar la API.
alembic upgrade head

# Carga el catálogo de productos (config/planning_seed.yaml). Es idempotente: actualiza lo que
# cambió y desactiva lo que salió. Fuera de local no crea cuentas.
python -m app.planning.infrastructure.cli init

# Detrás de un proxy (Traefik, Caddy) uvicorn toma la IP real y el esquema de X-Forwarded-*,
# solo si vienen de FORWARDED_ALLOW_IPS (por defecto, únicamente 127.0.0.1).
exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers "${UVICORN_WORKERS:-1}"   --no-access-log --proxy-headers --forwarded-allow-ips "${FORWARDED_ALLOW_IPS:-127.0.0.1}"
