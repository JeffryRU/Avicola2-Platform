"""preferencias de la interfaz por cuenta

Revision ID: c4f7a1e3b268
Revises: b3e6d9f2a157
Create Date: 2026-11-17 12:00:00.000000

Tema, color principal y accesibilidad de cada cuenta, en JSON (texto: portable entre motores).
Vacío hasta que la persona entra con una app que ya las sincroniza.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

from app.shared.infrastructure.database.metadata import TABLES
from app.shared.infrastructure.database.migrations import app_schema

revision: str = "c4f7a1e3b268"
down_revision: str | Sequence[str] | None = "b3e6d9f2a157"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

SELLERS = TABLES["sellers"]


def upgrade() -> None:
    with op.batch_alter_table(SELLERS, schema=app_schema()) as batch:
        batch.add_column(sa.Column("preferences", sa.Text(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table(SELLERS, schema=app_schema()) as batch:
        batch.drop_column("preferences")
