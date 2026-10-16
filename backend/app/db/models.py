"""Modelos de la base transaccional de la app (ver docs/architecture.md §4)."""

from datetime import date, datetime
from typing import Any

from sqlalchemy import JSON, Date, DateTime, ForeignKey, MetaData, Numeric, String, Text, func
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

APP_SCHEMA = "app"


class Base(DeclarativeBase):
    """Base declarativa con convención de nombres para que Alembic genere nombres estables."""

    # Esquema `app`: en Supabase, `public` queda expuesto por la Data API; `app` no.
    metadata = MetaData(
        schema=APP_SCHEMA,
        naming_convention={
            "ix": "ix_%(column_0_label)s",
            "uq": "uq_%(table_name)s_%(column_0_name)s",
            "ck": "ck_%(table_name)s_%(constraint_name)s",
            "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
            "pk": "pk_%(table_name)s",
        },
    )


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class User(TimestampMixin, Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    email: Mapped[str] = mapped_column(String(255), unique=True)
    # comercial | produccion | distribucion | canal | admin (validado en la app, no ENUM).
    role: Mapped[str] = mapped_column(String(32))
    # Obligatorio cuando role == "canal": limita qué datos ve y edita el usuario.
    channel: Mapped[str | None] = mapped_column(String(64))
    password_hash: Mapped[str] = mapped_column(String(255))
    is_active: Mapped[bool] = mapped_column(default=True)


class SacaPlan(TimestampMixin, Base):
    __tablename__ = "saca_plans"

    id: Mapped[int] = mapped_column(primary_key=True)
    date: Mapped[date] = mapped_column(Date, index=True)
    suggested_kg: Mapped[float | None] = mapped_column(Numeric(12, 2, asdecimal=False))
    suggested_birds: Mapped[int | None]
    planned_kg: Mapped[float | None] = mapped_column(Numeric(12, 2, asdecimal=False))
    # Estado como varchar validado desde la configuración (settings.saca_plan_statuses).
    status: Mapped[str] = mapped_column(String(32), default="draft")
    created_by: Mapped[int | None] = mapped_column(ForeignKey("app.users.id"))
    approved_by: Mapped[int | None] = mapped_column(ForeignKey("app.users.id"))
    notes: Mapped[str | None] = mapped_column(Text)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class SacaPlanComment(TimestampMixin, Base):
    __tablename__ = "saca_plan_comments"

    id: Mapped[int] = mapped_column(primary_key=True)
    plan_id: Mapped[int] = mapped_column(ForeignKey("app.saca_plans.id", ondelete="CASCADE"))
    author_id: Mapped[int | None] = mapped_column(ForeignKey("app.users.id"))
    body: Mapped[str] = mapped_column(Text)


class IngestionLog(TimestampMixin, Base):
    __tablename__ = "ingestion_log"

    id: Mapped[int] = mapped_column(primary_key=True)
    file_name: Mapped[str] = mapped_column(String(255))
    source: Mapped[str] = mapped_column(String(32))  # excel | message | upload
    rows_ok: Mapped[int] = mapped_column(default=0)
    rows_error: Mapped[int] = mapped_column(default=0)
    errors_json: Mapped[list[dict[str, Any]] | None] = mapped_column(JSON)
    status: Mapped[str] = mapped_column(String(32))


class ColumnMapping(TimestampMixin, Base):
    __tablename__ = "column_mappings"

    id: Mapped[int] = mapped_column(primary_key=True)
    source_signature: Mapped[str] = mapped_column(String(128), unique=True)
    mapping_json: Mapped[dict[str, str]] = mapped_column(JSON)
    status: Mapped[str] = mapped_column(String(32), default="pending")  # pending | confirmed
    confirmed_by: Mapped[int | None] = mapped_column(ForeignKey("app.users.id"))


class Alert(TimestampMixin, Base):
    __tablename__ = "alerts"

    id: Mapped[int] = mapped_column(primary_key=True)
    date: Mapped[date] = mapped_column(Date, index=True)
    type: Mapped[str] = mapped_column(String(64))
    message: Mapped[str] = mapped_column(Text)
    severity: Mapped[str] = mapped_column(String(16))  # info | warning | critical
    acknowledged_by: Mapped[int | None] = mapped_column(ForeignKey("app.users.id"))
