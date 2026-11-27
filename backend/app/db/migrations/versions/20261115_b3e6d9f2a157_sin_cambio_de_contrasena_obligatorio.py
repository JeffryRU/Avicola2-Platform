"""sin cambio de contraseña obligatorio al primer inicio

Revision ID: b3e6d9f2a157
Revises: a8d2f5c1e946
Create Date: 2026-11-15 10:00:00.000000

La app ya no obliga a cambiar la contraseña inicial: se quita la marca de las cuentas que la
tenían. La columna se conserva (la API la sigue enviando, siempre en falso) para no romper
versiones anteriores de la app móvil.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

from app.shared.infrastructure.database.metadata import TABLES
from app.shared.infrastructure.database.migrations import app_schema

revision: str = "b3e6d9f2a157"
down_revision: str | Sequence[str] | None = "a8d2f5c1e946"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

SELLERS = TABLES["sellers"]


def upgrade() -> None:
    sellers = sa.table(
        SELLERS, sa.column("must_change_password", sa.Boolean()), schema=app_schema()
    )
    op.execute(sellers.update().values(must_change_password=False))


def downgrade() -> None:
    # No se puede saber qué cuentas tenían la marca: se dejan como están.
    pass
