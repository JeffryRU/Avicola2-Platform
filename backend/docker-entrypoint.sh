#!/bin/sh
set -e

# Aplica las migraciones pendientes antes de levantar la API.
alembic upgrade head

exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers "${UVICORN_WORKERS:-1}"
