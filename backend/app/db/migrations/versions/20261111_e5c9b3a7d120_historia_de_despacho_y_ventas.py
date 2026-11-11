"""historia de pedidos de despacho y de ventas en tienda

Revision ID: e5c9b3a7d120
Revises: d4b8a2f6c019
Create Date: 2026-11-11 14:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

from app.shared.infrastructure.database.metadata import TABLES
from app.shared.infrastructure.database.migrations import app_schema

revision: str = "e5c9b3a7d120"
down_revision: str | Sequence[str] | None = "d4b8a2f6c019"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

ORDERS, SALES = TABLES["dispatch_orders"], TABLES["store_sales"]


def _amount(name: str, precision: int = 12, scale: int = 2) -> sa.Column:
    return sa.Column(name, sa.Numeric(precision, scale, asdecimal=False), nullable=False)


def upgrade() -> None:
    op.create_table(
        ORDERS,
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("order_number", sa.Integer(), nullable=False),
        sa.Column("customer", sa.String(length=200), nullable=False),
        sa.Column("material_code", sa.String(length=30), nullable=True),
        sa.Column("material", sa.String(length=200), nullable=False),
        _amount("ordered_kg"),
        _amount("dispatched_kg"),
        _amount("ordered_units"),
        _amount("dispatched_units"),
        sa.Column("zone", sa.String(length=60), nullable=True),
        sa.Column("registered_on", sa.Date(), nullable=False),
        sa.Column("delivery_date", sa.Date(), nullable=False),
        sa.Column("seller", sa.String(length=60), nullable=True),
        sa.PrimaryKeyConstraint("id", name=op.f(f"pk_{ORDERS}")),
        schema=app_schema(),
    )
    op.create_index(
        op.f(f"ix_{ORDERS}_delivery_date_material_code"),
        ORDERS,
        ["delivery_date", "material_code"],
        schema=app_schema(),
    )
    op.create_table(
        SALES,
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("source_line_id", sa.Integer(), nullable=False),
        sa.Column("document", sa.String(length=30), nullable=False),
        sa.Column("document_type", sa.String(length=20), nullable=False),
        sa.Column("grouping", sa.String(length=30), nullable=True),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("store_code", sa.String(length=20), nullable=False),
        sa.Column("store", sa.String(length=120), nullable=False),
        sa.Column("material_code", sa.String(length=30), nullable=False),
        sa.Column("material", sa.String(length=200), nullable=False),
        _amount("quantity", 14, 3),
        sa.Column("unit", sa.String(length=10), nullable=True),
        _amount("unit_price", 12, 4),
        sa.PrimaryKeyConstraint("id", name=op.f(f"pk_{SALES}")),
        sa.UniqueConstraint("source_line_id", name=op.f(f"uq_{SALES}_source_line_id")),
        schema=app_schema(),
    )
    op.create_index(
        op.f(f"ix_{SALES}_date_material_code"),
        SALES,
        ["date", "material_code"],
        schema=app_schema(),
    )


def downgrade() -> None:
    op.drop_table(SALES, schema=app_schema())
    op.drop_table(ORDERS, schema=app_schema())
