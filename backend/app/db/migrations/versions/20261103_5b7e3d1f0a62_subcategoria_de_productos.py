"""subcategoría de productos (Brasa chica/mediana/grande)

Revision ID: 5b7e3d1f0a62
Revises: 8d2f6b1a5c93
Create Date: 2026-11-03 18:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

from app.shared.infrastructure.database.metadata import TABLES
from app.shared.infrastructure.database.migrations import app_schema

revision: str = "5b7e3d1f0a62"
down_revision: str | Sequence[str] | None = "8d2f6b1a5c93"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

PRODUCTS = TABLES["products"]


def upgrade() -> None:
    op.add_column(
        PRODUCTS, sa.Column("subcategory", sa.String(length=30), nullable=True), schema=app_schema()
    )


def downgrade() -> None:
    op.drop_column(PRODUCTS, "subcategory", schema=app_schema())
