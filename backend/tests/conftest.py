import os

# Los tests corren contra SQLite en memoria: prueba de que el backend no depende del motor.
os.environ["DATABASE_URL"] = "sqlite://"
os.environ["AUTH_SECRET"] = "secreto-de-tests-con-largo-suficiente"
# Los tests no escriben en logs/: solo consola (pytest la captura).
os.environ["LOG_TO_FILES"] = "false"
# Sin token de servicio por defecto (el .env del desarrollador puede tener uno); los tests que
# lo prueban lo configuran explícitamente.
os.environ["INGEST_API_TOKEN"] = ""
# Las pruebas registran desde hoy hasta 7 días: corte al final del día y ventana amplia.
# Las de la hora de corte la cambian por la API.
os.environ["PLANNING_CUTOFF_TIME"] = "23:59"
os.environ["PLANNING_CUTOFF_DAYS_BEFORE"] = "0"
os.environ["PLANNING_MAX_DAYS"] = "7"
# Desde hoy (las pruebas del inicio en mañana lo cambian) y sin la revisión periódica de cortes.
os.environ["PLANNING_STARTS_IN_DAYS"] = "0"
os.environ["PLANNING_CUTOFF_ENABLED"] = "true"
os.environ["PLANNING_SCHEDULER_SECONDS"] = "0"
# Con caché, como en producción: así los tests de la API prueban también que cada escritura
# la invalida. Se vacía antes de cada test (fixture _fresh_cache), porque cada uno recrea la base.
os.environ.setdefault("CACHE_TTL_SECONDS", "60")

from datetime import date
from pathlib import Path

import pytest

from app.ingest.domain.models import LogEntry, PendingMapping
from app.ingest.infrastructure.config import get_catalog, get_schema
from app.ingest.infrastructure.synthetic.generator import SyntheticConfig, generate
from app.ingest.infrastructure.synthetic.samples import write_samples


class FakeIngestRepository:
    """Repositorio en memoria para probar la ingesta sin base de datos."""

    def __init__(self) -> None:
        self.confirmed: dict[str, dict[str, str]] = {}
        self.pending: dict[str, PendingMapping] = {}
        self.logs: list[LogEntry] = []

    def confirmed_mapping(self, signature: str) -> dict[str, str] | None:
        return self.confirmed.get(signature)

    def save_pending_mapping(self, pending: PendingMapping) -> int:
        self.pending[pending.signature] = pending
        return list(self.pending).index(pending.signature) + 1

    def log(self, entry: LogEntry) -> int:
        self.logs.append(entry)
        return len(self.logs)


@pytest.fixture(scope="session")
def samples_dir(tmp_path_factory) -> Path:
    """Los 5 Excel de ejemplo, generados una vez por sesión de tests."""
    out = tmp_path_factory.mktemp("samples")
    ds = generate(SyntheticConfig(end=date(2026, 10, 14), days=60))
    write_samples(ds, get_catalog(), out)
    return out


@pytest.fixture
def sample(samples_dir):
    def _get(prefix: str) -> Path:
        return next(samples_dir.glob(f"{prefix}*.xlsx"))

    return _get


@pytest.fixture
def schema():
    return get_schema()


@pytest.fixture
def catalog():
    return get_catalog()


@pytest.fixture
def fake_repo() -> FakeIngestRepository:
    return FakeIngestRepository()


class FastHasher:
    """Scrypt es lento a propósito; en los tests de propiedades y fuzzing solo importa la
    autorización, y hacen miles de logins."""

    dummy_hash = "x:"

    def hash(self, password: str) -> str:
        return f"x:{password}"

    def verify(self, password: str, stored: str) -> bool:
        return stored == f"x:{password}"


@pytest.fixture
def fast_hasher(monkeypatch):
    monkeypatch.setattr("app.planning.bootstrap.ScryptPasswordHasher", FastHasher)
    monkeypatch.setattr("app.planning.infrastructure.cli.ScryptPasswordHasher", FastHasher)


def examples(default: int) -> int:
    """Intensidad de Hypothesis: ligera por defecto (CI); `FUZZ_EXAMPLES=200`, a fondo."""
    return int(os.environ.get("FUZZ_EXAMPLES", default))


@pytest.fixture(autouse=True)
def _fresh_cache():
    """Cada test recrea la base: la caché de un test no debe verse en el siguiente."""
    from app.planning.bootstrap import planning_cache

    planning_cache.invalidate()
