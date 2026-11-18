"""Configuración de la aplicación, leída desde variables de entorno (.env)."""

from functools import lru_cache
from pathlib import Path
from typing import Any, Literal

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

DEFAULT_AUTH_SECRET = "cambiar-en-produccion"  # noqa: S105 (marcador: fuera de local se rechaza)
MIN_SECRET_LENGTH = 32
# Un secreto de `openssl rand -hex 32` usa casi los 16 dígitos hexadecimales.
MIN_DISTINCT_CHARS = 10
# Carpetas del repositorio: las rutas relativas de la configuración se resuelven desde aquí.
BACKEND_DIR = Path(__file__).resolve().parents[2]
REPO_ROOT = BACKEND_DIR.parent
# Conversión de kg de producto a saca (pollo vivo). Valores de referencia por validar
# (docs/assumptions.md). Los usan Settings y el generador de datos sintéticos.
DEFAULT_YIELD_FACTOR = 0.75  # kg de producto por kg vivo
DEFAULT_AVG_LIVE_WEIGHT_KG = 2.6  # peso vivo promedio por ave


class Settings(BaseSettings):
    """Parámetros del backend. Todo lo ajustable al equipo va aquí, no en el código."""

    # Lee el .env de la raíz del repo (al correr desde backend/) o el del directorio actual.
    model_config = SettingsConfigDict(env_file=("../.env", ".env"), extra="ignore")

    app_env: str = "local"
    # Supabase: usar el pooler en modo sesión (puerto 5432, IPv4) con ?sslmode=require.
    # El motor sale de la URL: postgresql+psycopg (Supabase), mssql+pymssql (Azure SQL),
    # sqlite:// (memoria, pruebas). Ver app/shared/infrastructure/database/engine.py.
    database_url: str = "postgresql+psycopg://postgres:postgres@127.0.0.1:5432/postgres"
    # Conexiones a la base: hasta db_pool_size + db_max_overflow a la vez. El total no debe
    # superar el "Pool Size" del pooler de Supabase (Database → Settings → Connection pooling).
    db_pool_size: int = Field(10, gt=0)
    db_max_overflow: int = Field(3, ge=0)
    # Segundos que una petición espera una conexión libre antes de fallar (rápido, no 30 s).
    db_pool_timeout: float = Field(10, gt=0)
    # Caché de lecturas frecuentes (configuración, catálogo, vendedores activos). ADR 0014.
    # memory: por proceso · redis: compartida entre procesos (necesita REDIS_URL).
    cache_backend: Literal["memory", "redis"] = "memory"
    # Segundos de vida; 0 = desactivada. Con memory, lo que cambia otro proceso se ve tras este
    # tiempo; con redis, al instante.
    cache_ttl_seconds: float = Field(60, ge=0)
    redis_url: str | None = None
    # Prefijo de las claves en Redis; vacío = "aviplanner:<APP_ENV>:" (develop y producción
    # pueden compartir un Redis sin pisarse).
    cache_namespace: str = ""
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

    # Proyecciones: días que se pueden registrar y semanas de historia para la sugerencia.
    planning_max_days: int = Field(7, ge=1)
    # Categorías que los vendedores proyectan (PLANNING_PROJECTED_CATEGORIES, JSON). Las demás
    # (p. ej. Pollo de mercado) siguen en el catálogo para el stock y la saca, pero no se registran.
    planning_projected_categories: list[str] = Field(default_factory=lambda: ["BRASA"])
    # Productos sueltos de otras categorías que también se proyectan (PLANNING_PROJECTED_PRODUCTS,
    # JSON): el pollo entero sin menudencia, del pollo de mercado.
    planning_projected_products: list[str] = Field(default_factory=lambda: ["P0012"])
    # Primer día que se puede registrar: 1 = mañana (las proyecciones son de los días siguientes);
    # 0 = también hoy.
    planning_starts_in_days: int = Field(1, ge=0, le=1)
    # Hora de corte por defecto (el supervisor la cambia desde la app): la proyección de un día
    # se edita hasta esa hora, PLANNING_CUTOFF_DAYS_BEFORE días antes (1 = el día anterior).
    planning_cutoff_time: str = "14:00"
    planning_cutoff_days_before: int = Field(1, ge=0, le=7)
    # Bloqueo por horario encendido por defecto (el supervisor lo apaga o enciende desde la app).
    planning_cutoff_enabled: bool = True
    planning_suggestion_weeks: int = Field(4, ge=1)
    # Cada cuántos segundos la API revisa si pasó un corte para avisar quién no registró
    # (0 = no lo revisa: lo dispara n8n con POST /api/internal/notifications/missed-projections).
    planning_scheduler_seconds: int = Field(60, ge=0)
    # Minutos de anticipación con que se avisa, antes del corte, a quien aún no registró
    # (0 = sin aviso previo). El corte es el vigente: si el supervisor lo cambia, el aviso lo sigue.
    planning_closing_reminder_minutes: int = Field(30, ge=0, le=720)
    # Contraseña de los usuarios de prueba que crea `cli init` (solo con APP_ENV=local).
    planning_demo_password: str = "demo1234"  # noqa: S105 (solo local; la política la rechaza)

    # Build del frontend (React) que sirve FastAPI; si no existe, no se monta.
    frontend_dist_dir: Path = REPO_ROOT / "frontend" / "dist"

    # Logs: nivel (DEBUG|INFO|WARNING|ERROR), formato (text|json) y carpeta de archivos
    # (app.log y errors.log, rotativos). LOG_TO_FILES=false = solo consola.
    log_level: str = "INFO"
    log_format: str = "text"
    log_to_files: bool = True
    log_dir: Path = REPO_ROOT / "logs"
    log_max_mb: int = Field(10, ge=1)
    log_backups: int = Field(5, ge=0)

    # Raíz del lakehouse Delta: ruta local (./data/lakehouse) o gs://bucket/lakehouse.
    lakehouse_uri: str = "./data/lakehouse"

    # Token que n8n envía en X-Api-Token a /ingest/* (vacío = sin control; provisional hasta JWT).
    ingest_api_token: str | None = None

    # Servidor MCP para agentes de IA (/mcp, ADR 0017). Token de servicio del agente de n8n:
    # quien lo presente actúa con el rol de solo lectura `ai_agent`. Vacío = sin agente de
    # servicio (el MCP acepta igual el token de sesión de cada usuario). 32+ caracteres.
    mcp_agent_token: str | None = None
    # Llamadas a herramientas permitidas por usuario en cada ventana de MCP_RATE_WINDOW_SECONDS.
    mcp_rate_limit: int = Field(30, ge=1)
    mcp_rate_window_seconds: int = Field(60, ge=1)

    # Carpeta con catalog.yaml, schemas.yaml, tables.yaml y planning_seed.yaml.
    config_dir: Path = BACKEND_DIR / "config"

    # Estados permitidos para un plan de saca (configurables, ver ADR / docs/assumptions.md).
    saca_plan_statuses: list[str] = ["draft", "proposed", "approved", "rejected"]

    # Conversión de kg de producto a saca (pollo vivo). Valores de referencia por validar.
    yield_factor: float = Field(DEFAULT_YIELD_FACTOR, gt=0, le=1)
    avg_live_weight_kg: float = Field(DEFAULT_AVG_LIVE_WEIGHT_KG, gt=0)
    # Ubicaciones del stock de despacho (STOCK_LOCATIONS, JSON). «General» es el stock que se sube
    # de forma general: en la app es «Todas las ubicaciones», la opción por defecto. Las demás
    # (SUPUESTO: las zonas con más pedidos) se eligen si se cuenta por ubicación. Con una sola
    # ubicación, la app no muestra el filtro.
    stock_locations: list[str] = Field(
        default_factory=lambda: ["General", "Trujillo", "Piura", "Chiclayo", "Chimbote", "San Martín"]
    )
    # Para la saca solo cuenta el stock de lotes de hasta estos días (lo más antiguo se troza).
    saca_stock_lot_days: int = Field(3, ge=0, le=30)
    # Hora (local) desde la que el programador guarda la saca del día como la del cierre.
    saca_snapshot_hour: int = Field(20, ge=0, le=23)
    # Hora (local) desde la que el programador reentrena el modelo de demanda (una vez por día).
    model_train_hour: int = Field(2, ge=0, le=23)
    model_train_enabled: bool = True
    # Días sin datos de ARIS desde los que el aviso pasa de informativo a advertencia.
    aris_warn_days: int = Field(3, ge=1, le=60)
    # Plus de la saca: aves extra por tipo que se suman al pedido a granja (regla del negocio).
    # Se cambia con SACA_GROUP_PLUS (JSON) o, desde la app, un supervisor.
    # «Carne» del negocio = el tipo «Pollo de mercado» del catálogo (SUPUESTO, docs/assumptions).
    saca_group_plus: dict[str, int] = Field(
        default_factory=lambda: {
            "Brasa chica": 4000,
            "Brasa mediana": 1500,
            "Brasa grande": 1500,
            "Pollo de mercado": 4000,
        }
    )

    @field_validator("auth_cookie_secure", mode="before")
    @classmethod
    def _empty_is_auto(cls, value: object) -> object:
        # AUTH_COOKIE_SECURE= (vacío, como en .env.example y docker-compose) = automático.
        return None if value == "" else value

    @property
    def is_local(self) -> bool:
        return self.app_env == "local"

    def rate_limit_options(self) -> dict[str, Any]:
        """Argumentos de `build_rate_limiter` (mismo backend y prefijo que la caché)."""
        return {
            "backend": self.cache_backend,
            "limit": self.mcp_rate_limit,
            "window_seconds": self.mcp_rate_window_seconds,
            "redis_url": self.redis_url,
            "namespace": self.cache_options()["namespace"],
        }

    def cache_options(self) -> dict[str, Any]:
        """Argumentos de `build_cache` según la configuración."""
        return {
            "backend": self.cache_backend,
            "ttl_seconds": self.cache_ttl_seconds,
            "redis_url": self.redis_url,
            "namespace": self.cache_namespace or f"aviplanner:{self.app_env}:",
        }

    @property
    def trusted_origin_list(self) -> tuple[str, ...]:
        return tuple(o.strip().rstrip("/") for o in self.trusted_origins.split(",") if o.strip())

    @property
    def cookie_secure(self) -> bool:
        return not self.is_local if self.auth_cookie_secure is None else self.auth_cookie_secure

    def _strong_agent_token(self) -> bool:
        token = self.mcp_agent_token or ""
        return (
            len(token) >= MIN_SECRET_LENGTH
            and token == token.strip()
            and len(set(token)) >= MIN_DISTINCT_CHARS
            and token not in (self.auth_secret, self.ingest_api_token)
        )

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
        if self.mcp_agent_token and not self._strong_agent_token():
            problems.append(
                f"MCP_AGENT_TOKEN debe tener al menos {MIN_SECRET_LENGTH} caracteres aleatorios "
                "(`openssl rand -hex 32`), distinto de AUTH_SECRET y de INGEST_API_TOKEN."
            )
        if not self.cookie_secure:
            problems.append("AUTH_COOKIE_SECURE=false: la cookie de sesión viajaría sin HTTPS.")
        return problems


@lru_cache
def get_settings() -> Settings:
    """Devuelve la configuración cacheada."""
    return Settings()
