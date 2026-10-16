from app.db.models import APP_SCHEMA, Base


def test_all_tables_live_in_app_schema() -> None:
    """En Supabase, `public` se expone por la Data API: ninguna tabla de la app debe ir ahí."""
    assert Base.metadata.tables
    assert {t.schema for t in Base.metadata.tables.values()} == {APP_SCHEMA}


def test_expected_tables() -> None:
    names = {t.name for t in Base.metadata.tables.values()}
    assert names == {
        "users",
        "saca_plans",
        "saca_plan_comments",
        "ingestion_log",
        "column_mappings",
        "alerts",
    }
