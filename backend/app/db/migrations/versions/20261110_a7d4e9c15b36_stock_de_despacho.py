"""stock de despacho

Revision ID: a7d4e9c15b36
Revises: c3a1f8e6b902
Create Date: 2026-11-10 23:30:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

from app.shared.infrastructure.database.metadata import TABLES
from app.shared.infrastructure.database.migrations import app_schema, ref

revision: str = "a7d4e9c15b36"
down_revision: str | Sequence[str] | None = "c3a1f8e6b902"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

STOCK, PRODUCTS = TABLES["dispatch_stock"], TABLES["products"]


def upgrade() -> None:
    op.create_table(
        STOCK,
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("product_id", sa.String(length=10), nullable=False),
        sa.Column("units", sa.Integer(), nullable=False),
        sa.Column("kg", sa.Numeric(precision=10, scale=2, asdecimal=False), nullable=False),
        sa.Column("recorded_by", sa.String(length=50), nullable=False),
        sa.Column("recorded_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("units >= 0", name=op.f(f"ck_{STOCK}_units_non_negative")),
        sa.CheckConstraint("kg >= 0", name=op.f(f"ck_{STOCK}_kg_non_negative")),
        sa.ForeignKeyConstraint(
            ["product_id"], [ref(PRODUCTS, "id")], name=op.f(f"fk_{STOCK}_product_id_{PRODUCTS}")
        ),
        sa.PrimaryKeyConstraint("id", name=op.f(f"pk_{STOCK}")),
        sa.UniqueConstraint("date", "product_id", name=op.f(f"uq_{STOCK}_date")),
        schema=app_schema(),
    )


def downgrade() -> None:
    op.drop_table(STOCK, schema=app_schema())
