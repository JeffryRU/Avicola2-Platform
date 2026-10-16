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
    database_url: str = "postgresql+psycopg://postgres:postgres@127.0.0.1:5432/postgres"
    db_pool_size: int = 5

    # Raíz del lakehouse Delta: ruta local (./data/lakehouse) o gs://bucket/lakehouse.
    lakehouse_uri: str = "./data/lakehouse"

    # Carpeta con catalog.yaml (y luego schemas.yaml).
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
