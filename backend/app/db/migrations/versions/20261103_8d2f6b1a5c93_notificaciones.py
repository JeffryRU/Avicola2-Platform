"""notificaciones por usuario (recordatorios, proyecciones enviadas y avisos de n8n)

Revision ID: 8d2f6b1a5c93
Revises: 3f8a1c2e9b47
Create Date: 2026-11-03 12:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

from app.shared.infrastructure.database.metadata import TABLES
from app.shared.infrastructure.database.migrations import app_schema, ref

revision: str = "8d2f6b1a5c93"
down_revision: str | Sequence[str] | None = "3f8a1c2e9b47"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

NOTIFICATIONS, SELLERS = TABLES["notifications"], TABLES["sellers"]


def upgrade() -> None:
    op.create_table(
        NOTIFICATIONS,
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("seller_id", sa.Integer(), nullable=False),
        sa.Column("kind", sa.String(length=30), nullable=False),
        sa.Column("title", sa.String(length=120), nullable=False),
        sa.Column("body", sa.String(length=500), nullable=False),
        sa.Column("link", sa.String(length=200), nullable=True),
        sa.Column("dedupe_key", sa.String(length=100), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("read_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(
            ["seller_id"],
            [ref(SELLERS, "id")],
            name=op.f(f"fk_{NOTIFICATIONS}_seller_id_{SELLERS}"),
        ),
        sa.PrimaryKeyConstraint("id", name=op.f(f"pk_{NOTIFICATIONS}")),
        schema=app_schema(),
    )
    op.create_index(
        op.f(f"ix_{NOTIFICATIONS}_seller_id"),
        NOTIFICATIONS,
        ["seller_id", "created_at"],
        schema=app_schema(),
    )


def downgrade() -> None:
    op.drop_index(
        op.f(f"ix_{NOTIFICATIONS}_seller_id"),
        table_name=NOTIFICATIONS,
        schema=app_schema(),
    )
    op.drop_table(NOTIFICATIONS, schema=app_schema())
