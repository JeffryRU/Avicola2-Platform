# Contexto de build: la raíz del repo (ver docker-compose.yml).

# --- Frontend (PWA) ---------------------------------------------------------------
FROM node:24.20-alpine AS frontend
RUN corepack enable
WORKDIR /web
COPY frontend/package.json frontend/pnpm-lock.yaml frontend/pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY frontend/ ./
RUN pnpm build

# --- Backend ----------------------------------------------------------------------
FROM python:3.12.15-slim-trixie

COPY --from=ghcr.io/astral-sh/uv:0.12.10 /uv /usr/local/bin/uv

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PROJECT_ENVIRONMENT=/opt/venv \
    PATH="/opt/venv/bin:$PATH" \
    FRONTEND_DIST_DIR=/srv/frontend/dist

WORKDIR /srv

# Dependencias primero para aprovechar la caché de capas.
# DB_EXTRAS=azure agrega el driver de Azure SQL / SQL Server (pymssql).
ARG DB_EXTRAS=""
COPY backend/pyproject.toml backend/uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project ${DB_EXTRAS:+--extra $DB_EXTRAS}

COPY backend/alembic.ini ./
COPY backend/config ./config
COPY backend/app ./app
COPY backend/docker-entrypoint.sh ./
COPY --from=frontend /web/dist ./frontend/dist
RUN chmod +x docker-entrypoint.sh && useradd --system --uid 1000 app && mkdir -p /data/lakehouse /data/logs && chown app /data/lakehouse /data/logs

USER app
EXPOSE 8000
ENTRYPOINT ["./docker-entrypoint.sh"]
