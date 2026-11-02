"""Configuración de la aplicación, leída desde variables de entorno (.env)."""

from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Parámetros del backend. Todo lo ajustable al equipo va aquí, no en el código."""

    # Lee el .env de la raíz del repo (al correr desde backend/) o el del directorio actual.
    model_config = SettingsConfigDict(env_file=("../.env", ".env"), extra="ignore")

    app_env: str = "local"
    # Supabase: usar el pooler en modo sesión (puerto 5432, IPv4) con ?sslmode=require.
    # El motor sale de la URL: postgresql+psycopg (Supabase), mssql+pymssql (Azure SQL),
    # sqlite:// (memoria, pruebas). Ver app/shared/infrastructure/database/engine.py.
    database_url: str = "postgresql+psycopg://postgres:postgres@127.0.0.1:5432/postgres"
    db_pool_size: int = 5
    # Esquema físico; vacío = el de config/tables.yaml (`app`). En Azure SQL p. ej. `dbo`.
    db_schema: str | None = None

    # Zona horaria del negocio: define "hoy" para validar fechas de proyección.
    tz: str = "America/Lima"

    # Login de vendedores (app de planificación). Secreto para firmar los tokens (JWT HS256).
    auth_secret: str = "cambiar-en-produccion"
    auth_token_ttl_hours: int = Field(12, gt=0)

    # Proyecciones: máximo de días por envío y semanas de historia para la sugerencia.
    planning_max_days: int = Field(7, ge=1)
    planning_suggestion_weeks: int = Field(4, ge=1)

    # Build del frontend (React) que sirve FastAPI; si no existe, no se monta.
    frontend_dist_dir: Path = Path(__file__).resolve().parents[3] / "frontend" / "dist"

    # Raíz del lakehouse Delta: ruta local (./data/lakehouse) o gs://bucket/lakehouse.
    lakehouse_uri: str = "./data/lakehouse"

    # Token que n8n envía en X-Api-Token a /ingest/* (vacío = sin control; provisional hasta JWT).
    ingest_api_token: str | None = None

    # Carpeta con catalog.yaml y schemas.yaml.
    config_dir: Path = Path(__file__).resolve().parents[2] / "config"

    # Estados permitidos para un plan de saca (configurables, ver ADR / docs/assumptions.md).
    saca_plan_statuses: list[str] = ["draft", "proposed", "approved", "rejected"]

    # Conversión de kg de producto a saca (pollo vivo). Valores de referencia por validar.
    yield_factor: float = Field(0.75, gt=0, le=1)  # kg de producto por kg vivo
    avg_live_weight_kg: float = Field(2.6, gt=0)  # peso vivo promedio por ave


@lru_cache
def get_settings() -> Settings:
    """Devuelve la configuración cacheada."""
    return Settings()
