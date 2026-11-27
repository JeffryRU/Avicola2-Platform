"""historial, canales (Telegram y WhatsApp) y borradores de fotos del asistente

Revision ID: f2c8a4d6b931
Revises: e1b7d3a9c524
Create Date: 2026-11-26 10:00:00.000000

ADR 0024: conversaciones y mensajes, vinculaciones de chat, códigos de vinculación y borradores.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

from app.shared.infrastructure.database.metadata import TABLES
from app.shared.infrastructure.database.migrations import app_schema, ref

revision: str = "f2c8a4d6b931"
down_revision: str | Sequence[str] | None = "e1b7d3a9c524"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

CONVERSATIONS = TABLES["assistant_conversations"]
MESSAGES = TABLES["assistant_messages"]
LINKS = TABLES["assistant_channel_links"]
CODES = TABLES["assistant_link_codes"]
DRAFTS = TABLES["assistant_drafts"]


def upgrade() -> None:
    schema = app_schema()
    op.create_table(
        CONVERSATIONS,
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("username", sa.String(length=50), nullable=False),
        sa.Column("channel", sa.String(length=10), nullable=False),
        sa.Column("title", sa.String(length=120), server_default="", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("archived", sa.Boolean(), server_default=sa.false(), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f(f"pk_{CONVERSATIONS}")),
        schema=schema,
    )
    op.create_index(
        op.f(f"ix_{CONVERSATIONS}_username"),
        CONVERSATIONS,
        ["username", "updated_at"],
        schema=schema,
    )
    op.create_table(
        MESSAGES,
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("conversation_id", sa.Uuid(), nullable=False),
        sa.Column("role", sa.String(length=10), nullable=False),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column("blocks", sa.Text(), nullable=True),
        sa.Column("suggestions", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["conversation_id"],
            [ref(CONVERSATIONS, "id")],
            name=op.f(f"fk_{MESSAGES}_conversation_id_{CONVERSATIONS}"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f(f"pk_{MESSAGES}")),
        schema=schema,
    )
    op.create_index(
        op.f(f"ix_{MESSAGES}_conversation_id"),
        MESSAGES,
        ["conversation_id", "created_at"],
        schema=schema,
    )
    op.create_table(
        LINKS,
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("channel", sa.String(length=10), nullable=False),
        sa.Column("sender", sa.String(length=64), nullable=False),
        sa.Column("username", sa.String(length=50), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f(f"pk_{LINKS}")),
        sa.UniqueConstraint("channel", "sender", name=op.f(f"uq_{LINKS}_channel")),
        schema=schema,
    )
    op.create_index(op.f(f"ix_{LINKS}_username"), LINKS, ["username"], schema=schema)
    op.create_table(
        CODES,
        sa.Column("code", sa.String(length=8), nullable=False),
        sa.Column("username", sa.String(length=50), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("code", name=op.f(f"pk_{CODES}")),
        schema=schema,
    )
    op.create_index(op.f(f"ix_{CODES}_username"), CODES, ["username"], schema=schema)
    op.create_table(
        DRAFTS,
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("username", sa.String(length=50), nullable=False),
        sa.Column("channel", sa.String(length=10), nullable=False),
        sa.Column("kind", sa.String(length=15), nullable=False),
        sa.Column("payload", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("status", sa.String(length=10), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f(f"pk_{DRAFTS}")),
        schema=schema,
    )
    op.create_index(op.f(f"ix_{DRAFTS}_username"), DRAFTS, ["username", "status"], schema=schema)


def downgrade() -> None:
    schema = app_schema()
    op.drop_index(op.f(f"ix_{DRAFTS}_username"), table_name=DRAFTS, schema=schema)
    op.drop_table(DRAFTS, schema=schema)
    op.drop_index(op.f(f"ix_{CODES}_username"), table_name=CODES, schema=schema)
    op.drop_table(CODES, schema=schema)
    op.drop_index(op.f(f"ix_{LINKS}_username"), table_name=LINKS, schema=schema)
    op.drop_table(LINKS, schema=schema)
    op.drop_index(op.f(f"ix_{MESSAGES}_conversation_id"), table_name=MESSAGES, schema=schema)
    op.drop_table(MESSAGES, schema=schema)
    op.drop_index(op.f(f"ix_{CONVERSATIONS}_username"), table_name=CONVERSATIONS, schema=schema)
    op.drop_table(CONVERSATIONS, schema=schema)
