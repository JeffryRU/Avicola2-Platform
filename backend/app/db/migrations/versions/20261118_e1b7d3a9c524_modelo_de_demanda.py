"""modelo de demanda: corridas y predicciones

Revision ID: e1b7d3a9c524
Revises: d8a2c6f4e913
Create Date: 2026-11-18 10:00:00.000000

La última corrida del modelo de demanda (métricas) y sus predicciones por modelo, vendedor y día.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

from app.shared.infrastructure.database.metadata import TABLES
from app.shared.infrastructure.database.migrations import app_schema

revision: str = "e1b7d3a9c524"
down_revision: str | Sequence[str] | None = "d8a2c6f4e913"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

RUNS, PREDICTIONS = TABLES["model_runs"], TABLES["model_predictions"]


def upgrade() -> None:
    op.create_table(
        RUNS,
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("trained_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("summary", sa.Text(), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f(f"pk_{RUNS}")),
        schema=app_schema(),
    )
    op.create_table(
        PREDICTIONS,
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("model", sa.String(length=20), nullable=False),
        sa.Column("seller", sa.String(length=50), nullable=False),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("units", sa.Text(), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f(f"pk_{PREDICTIONS}")),
        schema=app_schema(),
    )
    op.create_index(
        f"ix_{PREDICTIONS}_model_date", PREDICTIONS, ["model", "date"], schema=app_schema()
    )


def downgrade() -> None:
    op.drop_index(f"ix_{PREDICTIONS}_model_date", table_name=PREDICTIONS, schema=app_schema())
    op.drop_table(PREDICTIONS, schema=app_schema())
    op.drop_table(RUNS, schema=app_schema())
