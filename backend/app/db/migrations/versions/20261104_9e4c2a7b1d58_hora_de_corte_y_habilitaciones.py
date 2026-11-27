"""hora de corte (ajustes) y habilitaciones de edición

Revision ID: 9e4c2a7b1d58
Revises: 5b7e3d1f0a62
Create Date: 2026-11-04 12:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

from app.shared.infrastructure.database.metadata import TABLES
from app.shared.infrastructure.database.migrations import app_schema, ref

revision: str = "9e4c2a7b1d58"
down_revision: str | Sequence[str] | None = "5b7e3d1f0a62"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

SETTINGS, UNLOCKS, SELLERS = TABLES["settings"], TABLES["edit_unlocks"], TABLES["sellers"]


def upgrade() -> None:
    op.create_table(
        SETTINGS,
        sa.Column("key", sa.String(length=50), nullable=False),
        sa.Column("value", sa.String(length=200), nullable=False),
        sa.Column("updated_by", sa.String(length=50), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("key", name=op.f(f"pk_{SETTINGS}")),
        schema=app_schema(),
    )
    op.create_table(
        UNLOCKS,
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("seller_id", sa.Integer(), nullable=False),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("reason", sa.String(length=300), nullable=False),
        sa.Column("status", sa.String(length=15), nullable=False),
        sa.Column("requested_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("decided_by", sa.String(length=50), nullable=True),
        sa.Column("decided_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(
            ["seller_id"], [ref(SELLERS, "id")], name=op.f(f"fk_{UNLOCKS}_seller_id_{SELLERS}")
        ),
        sa.PrimaryKeyConstraint("id", name=op.f(f"pk_{UNLOCKS}")),
        schema=app_schema(),
    )
    op.create_index(
        op.f(f"ix_{UNLOCKS}_seller_id"), UNLOCKS, ["seller_id", "date"], schema=app_schema()
    )


def downgrade() -> None:
    op.drop_index(op.f(f"ix_{UNLOCKS}_seller_id"), table_name=UNLOCKS, schema=app_schema())
    op.drop_table(UNLOCKS, schema=app_schema())
    op.drop_table(SETTINGS, schema=app_schema())
