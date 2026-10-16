import pytest

from app.ingest.service import IngestService
from app.lakehouse.store import Lakehouse
from app.lakehouse.tables import GOLD, SILVER


@pytest.fixture
def lakehouse(tmp_path) -> Lakehouse:
    return Lakehouse(str(tmp_path / "lakehouse"))


@pytest.fixture
def service(lakehouse, fake_repo, schema, catalog) -> IngestService:
    return IngestService(lakehouse, fake_repo, schema, catalog)


def test_upload_writes_bronze_silver_gold_and_log(service, lakehouse, fake_repo, sample) -> None:
    path = sample("Horeca_comercial1")
    result = service.ingest(path.read_bytes(), path.name, "upload")

    assert result.status == "ok"
    assert lakehouse.get_bronze(result.bronze_path) == path.read_bytes()
    assert len(lakehouse.read(SILVER, "orders")) == 60
    gold = lakehouse.read(GOLD, "daily_demand")
    assert len(gold) == 12  # 3 días × 4 productos de Horeca
    assert gold["customers"].eq(5).all()
    silver = lakehouse.read(SILVER, "orders")
    assert gold["qty_kg"].sum() == pytest.approx(silver["qty_kg"].sum())
    assert fake_repo.logs[-1].status == "ok"
    assert fake_repo.logs[-1].bronze_path == result.bronze_path


def test_reupload_is_idempotent_and_updates_values(service, lakehouse, sample, tmp_path) -> None:
    path = sample("Horeca_comercial1")
    service.ingest(path.read_bytes(), path.name, "upload")
    service.ingest(path.read_bytes(), path.name, "upload")
    assert len(lakehouse.read(SILVER, "orders")) == 60

    csv = "fecha,canal,cliente,producto,cantidad_kg\n2026-10-14,Horeca,HOR-01,Pechuga,999\n"
    service.ingest(csv.encode(), "Horeca_fix_20261014.csv", "upload")
    silver = lakehouse.read(SILVER, "orders")
    assert len(silver) == 60
    row = silver[(silver["customer"] == "HOR-01") & (silver["product"] == "Pechuga")]
    assert row[row["date"].astype(str) == "2026-10-14"]["qty_kg"].item() == 999.0
    assert lakehouse.version(SILVER, "orders") == 2  # el time travel conserva las versiones


def test_needs_mapping_then_confirmed_reprocess(service, lakehouse, fake_repo, sample) -> None:
    path = sample("Horeca_horeca-wsp")
    first = service.ingest(path.read_bytes(), path.name, "inbox")
    assert first.status == "needs_mapping"
    assert first.signature in fake_repo.pending
    assert lakehouse.read(SILVER, "projections").empty

    fake_repo.confirmed[first.signature] = {
        "descripcion": "product",
        "peso_neto_kg": "qty_kg",
        "=type": "proyeccion",
    }
    second = service.reprocess(first.bronze_path)
    assert second.status == "ok"
    assert second.file_name == path.name
    assert len(lakehouse.read(SILVER, "projections")) == second.rows_ok > 0


def test_unreadable_file_is_logged(service, fake_repo) -> None:
    result = service.ingest(b"esto no es un excel", "roto.xlsx", "upload")
    assert result.status == "failed"
    assert fake_repo.logs[-1].status == "failed"


def test_bronze_rejects_path_traversal(lakehouse) -> None:
    with pytest.raises(ValueError):
        lakehouse.get_bronze("bronze/../../secreto.txt")
    with pytest.raises(ValueError):
        lakehouse.get_bronze("silver/orders/_delta_log/0.json")
