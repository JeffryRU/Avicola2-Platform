"""Modelos de la base transaccional de la app (ver docs/architecture.md §4)."""

from datetime import date, datetime
from typing import Any

from sqlalchemy import JSON, Date, DateTime, ForeignKey, Numeric, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

# Esquema y nombres de tabla salen de config/tables.yaml (fuente única).
from app.shared.infrastructure.database.metadata import APP_SCHEMA, TABLES, Base

__all__ = ["APP_SCHEMA", "Base"]


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class User(TimestampMixin, Base):
    __tablename__ = TABLES["users"]

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
    __tablename__ = TABLES["saca_plans"]

    id: Mapped[int] = mapped_column(primary_key=True)
    date: Mapped[date] = mapped_column(Date, index=True)
    suggested_kg: Mapped[float | None] = mapped_column(Numeric(12, 2, asdecimal=False))
    suggested_birds: Mapped[int | None]
    planned_kg: Mapped[float | None] = mapped_column(Numeric(12, 2, asdecimal=False))
    # Estado como varchar validado desde la configuración (settings.saca_plan_statuses).
    status: Mapped[str] = mapped_column(String(32), default="draft")
    created_by: Mapped[int | None] = mapped_column(ForeignKey(TABLES.fk("users")))
    approved_by: Mapped[int | None] = mapped_column(ForeignKey(TABLES.fk("users")))
    notes: Mapped[str | None] = mapped_column(Text)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class SacaPlanComment(TimestampMixin, Base):
    __tablename__ = TABLES["saca_plan_comments"]

    id: Mapped[int] = mapped_column(primary_key=True)
    plan_id: Mapped[int] = mapped_column(ForeignKey(TABLES.fk("saca_plans"), ondelete="CASCADE"))
    author_id: Mapped[int | None] = mapped_column(ForeignKey(TABLES.fk("users")))
    body: Mapped[str] = mapped_column(Text)


class IngestionLog(TimestampMixin, Base):
    __tablename__ = TABLES["ingestion_log"]

    id: Mapped[int] = mapped_column(primary_key=True)
    file_name: Mapped[str] = mapped_column(String(255))
    source: Mapped[str] = mapped_column(String(32))  # upload | inbox | message | synthetic
    rows_ok: Mapped[int] = mapped_column(default=0)
    rows_error: Mapped[int] = mapped_column(default=0)
    errors_json: Mapped[list[dict[str, Any]] | None] = mapped_column(JSON)
    # ok | partial | failed | needs_mapping
    status: Mapped[str] = mapped_column(String(32), index=True)
    bronze_path: Mapped[str | None] = mapped_column(String(512))
    source_signature: Mapped[str | None] = mapped_column(String(64), index=True)
    # Filas cargadas por tabla y versión Delta resultante: {"orders": {"rows": 60, "version": 3}}
    tables_json: Mapped[dict[str, Any] | None] = mapped_column(JSON)


class ColumnMapping(TimestampMixin, Base):
    __tablename__ = TABLES["column_mappings"]

    id: Mapped[int] = mapped_column(primary_key=True)
    source_signature: Mapped[str] = mapped_column(String(128), unique=True)
    # Encabezados tal como venían en el archivo (para mostrarlos al confirmar).
    source_columns: Mapped[list[str] | None] = mapped_column(JSON)
    # Encabezado normalizado → campo. Mientras está pendiente, es la propuesta (alias o LLM).
    mapping_json: Mapped[dict[str, str] | None] = mapped_column(JSON)
    missing_fields: Mapped[list[str] | None] = mapped_column(JSON)
    status: Mapped[str] = mapped_column(String(32), default="pending")  # pending | confirmed
    proposed_by: Mapped[str | None] = mapped_column(String(16))  # alias | llm | user
    sample_file: Mapped[str | None] = mapped_column(String(255))
    confirmed_by: Mapped[int | None] = mapped_column(ForeignKey(TABLES.fk("users")))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class Alert(TimestampMixin, Base):
    __tablename__ = TABLES["alerts"]

    id: Mapped[int] = mapped_column(primary_key=True)
    date: Mapped[date] = mapped_column(Date, index=True)
    type: Mapped[str] = mapped_column(String(64))
    message: Mapped[str] = mapped_column(Text)
    severity: Mapped[str] = mapped_column(String(16))  # info | warning | critical
    acknowledged_by: Mapped[int | None] = mapped_column(ForeignKey(TABLES.fk("users")))
