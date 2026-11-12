"""stock por lote y ubicación; calidad de los productos

Revision ID: a8d2f5c1e946
Revises: f7a1c4e8b235
Create Date: 2026-11-12 10:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

from app.shared.infrastructure.database.metadata import TABLES
from app.shared.infrastructure.database.migrations import app_schema

revision: str = "a8d2f5c1e946"
down_revision: str | Sequence[str] | None = "f7a1c4e8b235"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

STOCK, PRODUCTS = TABLES["dispatch_stock"], TABLES["products"]


def upgrade() -> None:
    with op.batch_alter_table(PRODUCTS, schema=app_schema()) as batch:
        batch.add_column(
            sa.Column("quality", sa.String(length=1), nullable=False, server_default="A")
        )
    with op.batch_alter_table(STOCK, schema=app_schema()) as batch:
        batch.add_column(
            sa.Column("location", sa.String(length=60), nullable=False, server_default="General")
        )
        # El stock ya registrado no tenía lote: se toma el propio día.
        batch.add_column(sa.Column("lot_date", sa.Date(), nullable=True))
    stock = sa.table(STOCK, sa.column("date"), sa.column("lot_date"), schema=app_schema())
    op.execute(stock.update().values(lot_date=stock.c.date))
    with op.batch_alter_table(STOCK, schema=app_schema()) as batch:
        batch.alter_column("lot_date", existing_type=sa.Date(), nullable=False)
        batch.drop_constraint(op.f(f"uq_{STOCK}_date"), type_="unique")
        batch.create_unique_constraint(
            op.f(f"uq_{STOCK}_date"), ["date", "location", "product_id", "lot_date"]
        )


def downgrade() -> None:
    with op.batch_alter_table(STOCK, schema=app_schema()) as batch:
        batch.drop_constraint(op.f(f"uq_{STOCK}_date"), type_="unique")
        batch.drop_column("lot_date")
        batch.drop_column("location")
        batch.create_unique_constraint(op.f(f"uq_{STOCK}_date"), ["date", "product_id"])
    with op.batch_alter_table(PRODUCTS, schema=app_schema()) as batch:
        batch.drop_column("quality")
