from datetime import date
from pathlib import Path

import pytest

from app.core.catalog import get_catalog
from app.ingest.repository import LogEntry, PendingMapping
from app.ingest.schema import get_schema
from app.synthetic.generator import SyntheticConfig, generate
from app.synthetic.samples import write_samples


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
