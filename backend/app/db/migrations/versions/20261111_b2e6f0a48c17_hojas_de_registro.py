"""hojas de registro de las proyecciones (INS-06)

Revision ID: b2e6f0a48c17
Revises: a7d4e9c15b36
Create Date: 2026-11-11 00:10:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

from app.shared.infrastructure.database.metadata import TABLES
from app.shared.infrastructure.database.migrations import app_schema

revision: str = "b2e6f0a48c17"
down_revision: str | Sequence[str] | None = "a7d4e9c15b36"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

PROJECTIONS, CHANGES = TABLES["projections"], TABLES["projection_changes"]


def upgrade() -> None:
    # Las proyecciones ya guardadas quedan como hoja 1 (no se reconstruye cuántas veces
    # se corrigieron antes); los cambios anteriores quedan sin número de hoja.
    op.add_column(
        PROJECTIONS,
        sa.Column("sheet", sa.Integer(), nullable=False, server_default="1"),
        schema=app_schema(),
    )
    op.add_column(CHANGES, sa.Column("sheet", sa.Integer(), nullable=True), schema=app_schema())


def downgrade() -> None:
    op.drop_column(CHANGES, "sheet", schema=app_schema())
    op.drop_column(PROJECTIONS, "sheet", schema=app_schema())
