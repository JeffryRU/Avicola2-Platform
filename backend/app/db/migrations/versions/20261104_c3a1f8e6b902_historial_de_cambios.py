"""historial de cambios de las proyecciones

Revision ID: c3a1f8e6b902
Revises: 9e4c2a7b1d58
Create Date: 2026-11-04 16:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

from app.shared.infrastructure.database.metadata import TABLES
from app.shared.infrastructure.database.migrations import app_schema, ref

revision: str = "c3a1f8e6b902"
down_revision: str | Sequence[str] | None = "9e4c2a7b1d58"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

CHANGES, SELLERS = TABLES["projection_changes"], TABLES["sellers"]


def upgrade() -> None:
    op.create_table(
        CHANGES,
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("seller_id", sa.Integer(), nullable=False),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("category", sa.String(length=30), nullable=False),
        sa.Column("author", sa.String(length=50), nullable=False),
        sa.Column("action", sa.String(length=10), nullable=False),
        sa.Column("before_units", sa.Text(), nullable=True),
        sa.Column("after_units", sa.Text(), nullable=False),
        sa.Column("before_total", sa.Integer(), nullable=True),
        sa.Column("after_total", sa.Integer(), nullable=False),
        sa.Column("after_cutoff", sa.Boolean(), nullable=False),
        sa.Column("changed_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("changed_on", sa.Date(), nullable=False),
        sa.ForeignKeyConstraint(
            ["seller_id"], [ref(SELLERS, "id")], name=op.f(f"fk_{CHANGES}_seller_id_{SELLERS}")
        ),
        sa.PrimaryKeyConstraint("id", name=op.f(f"pk_{CHANGES}")),
        schema=app_schema(),
    )
    op.create_index(
        op.f(f"ix_{CHANGES}_seller_id"), CHANGES, ["seller_id", "changed_on"], schema=app_schema()
    )


def downgrade() -> None:
    op.drop_index(op.f(f"ix_{CHANGES}_seller_id"), table_name=CHANGES, schema=app_schema())
    op.drop_table(CHANGES, schema=app_schema())
