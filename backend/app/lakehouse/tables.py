"""Escritura de silver según schemas.yaml y recálculo de gold."""

from collections.abc import Iterable
from datetime import UTC, date, datetime

import pandas as pd
import pyarrow as pa

from app.ingest.schema import TableSpec
from app.lakehouse.store import ARROW_TYPES, LINEAGE_FIELDS, Lakehouse

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
    lh: Lakehouse, table: str, spec: TableSpec, df: pd.DataFrame, source_file: str, source_ref: str
) -> int:
    """Upsert de filas ya validadas en silver.{table}. Devuelve la versión Delta resultante."""
    data = df.copy()
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
