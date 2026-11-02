"""seguridad de cuentas: rol, cambio obligatorio, bloqueo por intentos y versión de sesión

Revision ID: 3f8a1c2e9b47
Revises: 7c1e2a9d4b10
Create Date: 2026-11-03 09:00:00.000000

Columnas nuevas en la tabla de vendedores (nombre físico en config/tables.yaml).
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

from app.shared.infrastructure.database.metadata import TABLES
from app.shared.infrastructure.database.migrations import app_schema

revision: str = "3f8a1c2e9b47"
down_revision: str | Sequence[str] | None = "7c1e2a9d4b10"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

SELLERS = TABLES["sellers"]


def upgrade() -> None:
    with op.batch_alter_table(SELLERS, schema=app_schema()) as batch:
        batch.add_column(
            sa.Column("role", sa.String(length=20), server_default="seller", nullable=False)
        )
        batch.add_column(
            sa.Column(
                "must_change_password", sa.Boolean(), server_default=sa.false(), nullable=False
            )
        )
        batch.add_column(
            sa.Column("failed_logins", sa.Integer(), server_default="0", nullable=False)
        )
        batch.add_column(sa.Column("locked_until", sa.DateTime(timezone=True), nullable=True))
        batch.add_column(
            sa.Column("token_version", sa.Integer(), server_default="0", nullable=False)
        )


def downgrade() -> None:
    with op.batch_alter_table(SELLERS, schema=app_schema()) as batch:
        for column in (
            "token_version",
            "locked_until",
            "failed_logins",
            "must_change_password",
            "role",
        ):
            batch.drop_column(column)
