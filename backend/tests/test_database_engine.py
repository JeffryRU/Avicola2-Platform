import pytest

from app.planning.infrastructure.security import ScryptPasswordHasher
from app.shared.infrastructure.database.engine import physical_schema, profile_for
from app.shared.infrastructure.database.tables import get_table_names

SUPABASE = "postgresql+psycopg://u:p@aws-0-x.pooler.supabase.com:5432/postgres?sslmode=require"
AZURE = "mssql+pymssql://u:p@srv.database.windows.net:1433/noraves"


@pytest.mark.parametrize(
    ("url", "override", "expected"),
    [(SUPABASE, None, "app"), (AZURE, "dbo", "dbo"), ("sqlite://", "dbo", None)],
)
def test_physical_schema_per_engine(url, override, expected) -> None:
    assert physical_schema(url, "app", override) == expected


def test_profiles_have_engine_specific_options() -> None:
    assert "connect_timeout" in profile_for(SUPABASE).connect_args
    assert "login_timeout" in profile_for(AZURE).connect_args
    assert "CREATE SCHEMA" in profile_for(AZURE).create_schema_sql("dbo")


def test_table_names_come_from_config() -> None:
    names = get_table_names()
    assert names["projections"] == "np_projections"
    assert names.fk("sellers") == "app.np_sellers.id"
    with pytest.raises(KeyError):
        names["nope"]


def test_scrypt_matches_node_mockup_hash() -> None:
    hasher = ScryptPasswordHasher()
    stored = hasher.hash("demo1234")
    assert hasher.verify("demo1234", stored) and not hasher.verify("otra", stored)
    assert not hasher.verify("demo1234", "sin-formato")
