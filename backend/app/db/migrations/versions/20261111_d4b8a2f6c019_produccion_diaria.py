"""producción diaria por producto

Revision ID: d4b8a2f6c019
Revises: b2e6f0a48c17
Create Date: 2026-11-11 13:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

from app.shared.infrastructure.database.metadata import TABLES
from app.shared.infrastructure.database.migrations import app_schema, ref

revision: str = "d4b8a2f6c019"
down_revision: str | Sequence[str] | None = "b2e6f0a48c17"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

PRODUCTION, PRODUCTS = TABLES["production"], TABLES["products"]


def upgrade() -> None:
    op.create_table(
        PRODUCTION,
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("product_id", sa.String(length=10), nullable=False),
        sa.Column("ordered", sa.Numeric(precision=12, scale=2, asdecimal=False), nullable=False),
        sa.Column("produced", sa.Integer(), nullable=False),
        sa.Column("quality_b", sa.Integer(), nullable=False),
        sa.Column("recorded_by", sa.String(length=50), nullable=False),
        sa.Column("recorded_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "ordered >= 0 AND produced >= 0", name=op.f(f"ck_{PRODUCTION}_amounts_non_negative")
        ),
        sa.CheckConstraint(
            "quality_b >= 0 AND quality_b <= produced",
            name=op.f(f"ck_{PRODUCTION}_quality_b_within_produced"),
        ),
        sa.ForeignKeyConstraint(
            ["product_id"],
            [ref(PRODUCTS, "id")],
            name=op.f(f"fk_{PRODUCTION}_product_id_{PRODUCTS}"),
        ),
        sa.PrimaryKeyConstraint("id", name=op.f(f"pk_{PRODUCTION}")),
        sa.UniqueConstraint("date", "product_id", name=op.f(f"uq_{PRODUCTION}_date")),
        schema=app_schema(),
    )


def downgrade() -> None:
    op.drop_table(PRODUCTION, schema=app_schema())
