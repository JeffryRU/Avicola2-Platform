"""sacas guardadas por día

Revision ID: d8a2c6f4e913
Revises: c4f7a1e3b268
Create Date: 2026-11-17 18:00:00.000000

La saca de cada día (lo que se vio y se pidió a granja) se guarda para consultarla después.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

from app.shared.infrastructure.database.metadata import TABLES
from app.shared.infrastructure.database.migrations import app_schema

revision: str = "d8a2c6f4e913"
down_revision: str | Sequence[str] | None = "c4f7a1e3b268"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

SNAPSHOTS = TABLES["saca_snapshots"]


def upgrade() -> None:
    op.create_table(
        SNAPSHOTS,
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("saved_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("saved_by", sa.String(length=50), nullable=False),
        sa.Column("farm_order", sa.Integer(), nullable=False),
        sa.Column("payload", sa.Text(), nullable=False),
        sa.PrimaryKeyConstraint("date", name=op.f(f"pk_{SNAPSHOTS}")),
        schema=app_schema(),
    )


def downgrade() -> None:
    op.drop_table(SNAPSHOTS, schema=app_schema())
