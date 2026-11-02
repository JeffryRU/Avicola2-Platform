"""planificación de demanda: vendedores, productos y proyecciones

Revision ID: 7c1e2a9d4b10
Revises: bbc5019d9393
Create Date: 2026-11-02 10:00:00.000000

Tipos portables (Postgres, SQL Server, SQLite...). Los nombres salen de config/tables.yaml.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

from app.shared.infrastructure.database.metadata import TABLES
from app.shared.infrastructure.database.migrations import app_schema, ref

revision: str = "7c1e2a9d4b10"
down_revision: str | Sequence[str] | None = "bbc5019d9393"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

SELLERS, PRODUCTS = TABLES["sellers"], TABLES["products"]
PROJECTIONS, LINES = TABLES["projections"], TABLES["projection_lines"]


def upgrade() -> None:
    op.create_table(
        SELLERS,
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("username", sa.String(length=50), nullable=False),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("zone", sa.String(length=50), nullable=True),
        sa.Column("password_hash", sa.String(length=200), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.PrimaryKeyConstraint("id", name=op.f(f"pk_{SELLERS}")),
        sa.UniqueConstraint("username", name=op.f(f"uq_{SELLERS}_username")),
        schema=app_schema(),
    )
    op.create_table(
        PRODUCTS,
        sa.Column("id", sa.String(length=10), nullable=False),
        sa.Column("category", sa.String(length=30), nullable=False),
        sa.Column("name", sa.String(length=60), nullable=False),
        sa.Column("kg_per_unit", sa.Numeric(precision=6, scale=2), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f(f"pk_{PRODUCTS}")),
        schema=app_schema(),
    )
    op.create_table(
        PROJECTIONS,
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("submission_id", sa.Uuid(), nullable=False),
        sa.Column("seller_id", sa.Integer(), nullable=False),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("category", sa.String(length=30), nullable=False),
        sa.Column("status", sa.String(length=15), nullable=False),
        sa.Column("total_units", sa.Integer(), nullable=False),
        sa.Column("total_kg", sa.Numeric(precision=10, scale=2), nullable=False),
        sa.Column("submitted_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(
            ["seller_id"],
            [ref(SELLERS)],
            name=op.f(f"fk_{PROJECTIONS}_seller_id_{SELLERS}"),
        ),
        sa.PrimaryKeyConstraint("id", name=op.f(f"pk_{PROJECTIONS}")),
        sa.UniqueConstraint(
            "seller_id", "date", "category", name=op.f(f"uq_{PROJECTIONS}_seller_id")
        ),
        schema=app_schema(),
    )
    op.create_index(
        op.f(f"ix_app_{PROJECTIONS}_submission_id"),
        PROJECTIONS,
        ["submission_id"],
        schema=app_schema(),
    )
    op.create_table(
        LINES,
        sa.Column("projection_id", sa.Uuid(), nullable=False),
        sa.Column("product_id", sa.String(length=10), nullable=False),
        sa.Column("units", sa.Integer(), nullable=False),
        sa.Column("kg", sa.Numeric(precision=10, scale=2), nullable=False),
        sa.CheckConstraint("units >= 0", name=op.f(f"ck_{LINES}_units_non_negative")),
        sa.ForeignKeyConstraint(
            ["product_id"],
            [ref(PRODUCTS)],
            name=op.f(f"fk_{LINES}_product_id_{PRODUCTS}"),
        ),
        sa.ForeignKeyConstraint(
            ["projection_id"],
            [ref(PROJECTIONS)],
            name=op.f(f"fk_{LINES}_projection_id_{PROJECTIONS}"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("projection_id", "product_id", name=op.f(f"pk_{LINES}")),
        schema=app_schema(),
    )


def downgrade() -> None:
    op.drop_table(LINES, schema=app_schema())
    op.drop_index(
        op.f(f"ix_app_{PROJECTIONS}_submission_id"),
        table_name=PROJECTIONS,
        schema=app_schema(),
    )
    op.drop_table(PROJECTIONS, schema=app_schema())
    op.drop_table(PRODUCTS, schema=app_schema())
    op.drop_table(SELLERS, schema=app_schema())
