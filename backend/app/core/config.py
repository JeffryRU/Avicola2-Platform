"""Configuración de la aplicación, leída desde variables de entorno (.env)."""

from functools import lru_cache
from pathlib import Path

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

DEFAULT_AUTH_SECRET = "cambiar-en-produccion"
MIN_SECRET_LENGTH = 32


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

    # Login de vendedores (app de planificación). Secreto para firmar los tokens (JWT HS256):
    # al menos 32 caracteres aleatorios (`openssl rand -hex 32`). Fuera de local es obligatorio.
    auth_secret: str = DEFAULT_AUTH_SECRET
    auth_token_ttl_hours: int = Field(12, gt=0)
    # Cookie de sesión solo por HTTPS. Vacío = sí, salvo en APP_ENV=local (http://127.0.0.1).
    auth_cookie_secure: bool | None = None
    # Orígenes del frontend si se sirve aparte (p. ej. Vercel reenviando /api a este backend),
    # separados por coma. Admiten comodín: https://avicola2.vercel.app,https://avicola2-*.vercel.app
    trusted_origins: str = ""
    # Bloqueo por intentos fallidos de login.
    login_max_attempts: int = Field(5, ge=1)
    login_lock_minutes: int = Field(15, ge=1)

    # Proyecciones: máximo de días por envío y semanas de historia para la sugerencia.
    planning_max_days: int = Field(7, ge=1)
    planning_suggestion_weeks: int = Field(4, ge=1)

    # Build del frontend (React) que sirve FastAPI; si no existe, no se monta.
    frontend_dist_dir: Path = Path(__file__).resolve().parents[3] / "frontend" / "dist"

    # Logs: nivel (DEBUG|INFO|WARNING|ERROR), formato (text|json) y carpeta de archivos
    # (app.log y errors.log, rotativos). LOG_TO_FILES=false = solo consola.
    log_level: str = "INFO"
    log_format: str = "text"
    log_to_files: bool = True
    log_dir: Path = Path(__file__).resolve().parents[3] / "logs"
    log_max_mb: int = Field(10, ge=1)
    log_backups: int = Field(5, ge=0)

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

    @field_validator("auth_cookie_secure", mode="before")
    @classmethod
    def _empty_is_auto(cls, value: object) -> object:
        # AUTH_COOKIE_SECURE= (vacío, como en .env.example y docker-compose) = automático.
        return None if value == "" else value

    @property
    def is_local(self) -> bool:
        return self.app_env == "local"

    @property
    def trusted_origin_list(self) -> tuple[str, ...]:
        return tuple(o.strip().rstrip("/") for o in self.trusted_origins.split(",") if o.strip())

    @property
    def cookie_secure(self) -> bool:
        return not self.is_local if self.auth_cookie_secure is None else self.auth_cookie_secure

    def security_problems(self) -> list[str]:
        """Configuración insegura que impide arrancar la API fuera de APP_ENV=local."""
        problems = []
        if len(self.auth_secret) < MIN_SECRET_LENGTH or self.auth_secret == DEFAULT_AUTH_SECRET:
            problems.append(
                f"AUTH_SECRET debe tener al menos {MIN_SECRET_LENGTH} caracteres aleatorios "
                "(genera uno con `openssl rand -hex 32`)."
            )
        if not self.ingest_api_token:
            problems.append("INGEST_API_TOKEN está vacío: /ingest quedaría sin control de acceso.")
        if not self.cookie_secure:
            problems.append("AUTH_COOKIE_SECURE=false: la cookie de sesión viajaría sin HTTPS.")
        return problems


@lru_cache
def get_settings() -> Settings:
    """Devuelve la configuración cacheada."""
    return Settings()
