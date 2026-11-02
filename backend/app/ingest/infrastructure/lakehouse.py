"""Adaptador Delta de la ingesta: escritura de silver según schemas.yaml y recálculo de gold."""

from collections.abc import Iterable
from datetime import UTC, date, datetime

import pandas as pd
import pyarrow as pa

from app.ingest.domain.models import Row
from app.ingest.domain.schema import TableSpec
from app.shared.infrastructure.lakehouse import Lakehouse

ARROW_TYPES: dict[str, pa.DataType] = {
    "date": pa.date32(),
    "string": pa.string(),
    "float": pa.float64(),
    "int": pa.int64(),
}
# Columnas de linaje que se agregan a toda tabla silver.
LINEAGE_FIELDS = [
    pa.field("source_file", pa.string()),
    pa.field("source_ref", pa.string()),
    pa.field("ingested_at", pa.timestamp("us", tz="UTC")),
]

SILVER = "silver"
GOLD = "gold"

DAILY_DEMAND = "daily_demand"
DAILY_DEMAND_KEYS = ["date", "channel", "product"]
DAILY_DEMAND_SCHEMA = pa.schema(
    [
        pa.field("date", pa.date32()),
        pa.field("channel", pa.string()),
        pa.field("product", pa.string()),
        pa.field("qty_kg", pa.float64()),
        pa.field("delivered_kg", pa.float64()),
        pa.field("customers", pa.int64()),
        pa.field("updated_at", pa.timestamp("us", tz="UTC")),
    ]
)


def silver_schema(spec: TableSpec) -> pa.Schema:
    fields = [pa.field(name, ARROW_TYPES[col.type]) for name, col in spec.columns.items()]
    return pa.schema(fields + LINEAGE_FIELDS)


def write_silver(
    lh: Lakehouse, table: str, spec: TableSpec, rows: list[Row], source_file: str, source_ref: str
) -> int:
    """Upsert de filas ya validadas en silver.{table}. Devuelve la versión Delta resultante."""
    data = pd.DataFrame.from_records(rows, columns=list(spec.columns))
    data["source_file"] = source_file
    data["source_ref"] = source_ref
    data["ingested_at"] = pd.Timestamp(datetime.now(UTC))
    arrow = pa.Table.from_pandas(data, schema=silver_schema(spec), preserve_index=False)
    return lh.upsert(SILVER, table, arrow, spec.merge_keys)


def refresh_daily_demand(lh: Lakehouse, dates: Iterable[date]) -> int | None:
    """Recalcula gold.daily_demand (fecha × canal × producto) para las fechas dadas."""
    dates = sorted(set(dates))
    if not dates:
        return None
    orders = lh.read(
        SILVER,
        "orders",
        columns=["date", "channel", "product", "customer", "qty_kg", "delivered_kg"],
        where_in=("date", dates),
    )
    if orders.empty:
        return None
    gold = (
        orders.groupby(DAILY_DEMAND_KEYS, as_index=False)
        .agg(
            qty_kg=("qty_kg", "sum"),
            # min_count=1: si nadie informó lo entregado, queda nulo en vez de 0.
            delivered_kg=("delivered_kg", lambda s: s.sum(min_count=1)),
            customers=("customer", "nunique"),
        )
        .round({"qty_kg": 3, "delivered_kg": 3})
    )
    gold["updated_at"] = pd.Timestamp(datetime.now(UTC))
    arrow = pa.Table.from_pandas(gold, schema=DAILY_DEMAND_SCHEMA, preserve_index=False)
    return lh.upsert(GOLD, DAILY_DEMAND, arrow, DAILY_DEMAND_KEYS)


class DeltaAnalyticsStore:
    """Adaptador del puerto AnalyticsStore sobre el lakehouse Delta."""

    def __init__(self, lakehouse: Lakehouse) -> None:
        self.lakehouse = lakehouse

    def write_silver(
        self, table: str, spec: TableSpec, rows: list[Row], source_file: str, source_ref: str
    ) -> int:
        return write_silver(self.lakehouse, table, spec, rows, source_file, source_ref)

    def refresh_daily_demand(self, dates: Iterable[date]) -> int | None:
        return refresh_daily_demand(self.lakehouse, dates)
