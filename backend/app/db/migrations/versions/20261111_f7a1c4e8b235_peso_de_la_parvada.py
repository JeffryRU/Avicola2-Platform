"""peso promedio de la parvada por tipo y día

Revision ID: f7a1c4e8b235
Revises: e5c9b3a7d120
Create Date: 2026-11-11 15:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

from app.shared.infrastructure.database.metadata import TABLES
from app.shared.infrastructure.database.migrations import app_schema

revision: str = "f7a1c4e8b235"
down_revision: str | Sequence[str] | None = "e5c9b3a7d120"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

WEIGHTS = TABLES["production_weights"]


def upgrade() -> None:
    op.create_table(
        WEIGHTS,
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("group", sa.String(length=60), nullable=False),
        sa.Column("avg_kg", sa.Numeric(precision=6, scale=3, asdecimal=False), nullable=False),
        sa.CheckConstraint("avg_kg > 0", name=op.f(f"ck_{WEIGHTS}_avg_kg_positive")),
        sa.PrimaryKeyConstraint("id", name=op.f(f"pk_{WEIGHTS}")),
        sa.UniqueConstraint("date", "group", name=op.f(f"uq_{WEIGHTS}_date")),
        schema=app_schema(),
    )


def downgrade() -> None:
    op.drop_table(WEIGHTS, schema=app_schema())
