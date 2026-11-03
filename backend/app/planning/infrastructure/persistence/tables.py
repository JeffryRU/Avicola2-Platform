"""Tablas de la planificación (SQLAlchemy Core, tipos portables entre motores).

Los nombres físicos salen de config/tables.yaml.
"""

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Column,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Table,
    UniqueConstraint,
    Uuid,
    false,
    func,
)

from app.shared.infrastructure.database.metadata import TABLES, metadata

sellers = Table(
    TABLES["sellers"],
    metadata,
    Column("id", Integer, primary_key=True, autoincrement=True),
    Column("username", String(50), nullable=False, unique=True),
    Column("name", String(100), nullable=False),
    Column("zone", String(50)),
    Column("password_hash", String(200), nullable=False),
    # seller | supervisor: varchar validado por la app (domain/models.ROLES), no ENUM.
    Column("role", String(20), nullable=False, server_default="seller"),
    # Seguridad: cambio obligatorio (contraseña temporal), bloqueo por intentos y versión
    # de sesión (al subirla se invalidan los tokens emitidos antes).
    Column("must_change_password", Boolean, nullable=False, server_default=false()),
    Column("failed_logins", Integer, nullable=False, server_default="0"),
    Column("locked_until", DateTime(timezone=True)),
    Column("token_version", Integer, nullable=False, server_default="0"),
    Column("is_active", Boolean, nullable=False, default=True),
    Column("created_at", DateTime(timezone=True), nullable=False, server_default=func.now()),
)

products = Table(
    TABLES["products"],
    metadata,
    Column("id", String(10), primary_key=True),
    Column("category", String(30), nullable=False),
    Column("subcategory", String(30)),
    Column("name", String(60), nullable=False),
    Column("kg_per_unit", Numeric(6, 2, asdecimal=False), nullable=False),
    Column("sort_order", Integer, nullable=False, default=0),
    Column("is_active", Boolean, nullable=False, default=True),
)

projections = Table(
    TABLES["projections"],
    metadata,
    Column("id", Uuid, primary_key=True),
    Column("submission_id", Uuid, nullable=False, index=True),
    Column("seller_id", Integer, ForeignKey(TABLES.fk("sellers")), nullable=False),
    Column("date", Date, nullable=False),
    Column("category", String(30), nullable=False),
    # varchar validado por la app, no ENUM (CLAUDE.md).
    Column("status", String(15), nullable=False),
    Column("total_units", Integer, nullable=False),
    Column("total_kg", Numeric(10, 2, asdecimal=False), nullable=False),
    Column("submitted_at", DateTime(timezone=True), nullable=False),
    Column("updated_at", DateTime(timezone=True)),
    UniqueConstraint("seller_id", "date", "category"),
)

projection_lines = Table(
    TABLES["projection_lines"],
    metadata,
    Column(
        "projection_id",
        Uuid,
        ForeignKey(TABLES.fk("projections"), ondelete="CASCADE"),
        primary_key=True,
    ),
    Column("product_id", String(10), ForeignKey(TABLES.fk("products")), primary_key=True),
    Column("units", Integer, nullable=False),
    Column("kg", Numeric(10, 2, asdecimal=False), nullable=False),
    CheckConstraint("units >= 0", name="units_non_negative"),
)

notifications = Table(
    TABLES["notifications"],
    metadata,
    Column("id", Integer, primary_key=True, autoincrement=True),
    Column("seller_id", Integer, ForeignKey(TABLES.fk("sellers")), nullable=False),
    # varchar validado por la app (domain/notifications.KINDS), no ENUM.
    Column("kind", String(30), nullable=False),
    Column("title", String(120), nullable=False),
    Column("body", String(500), nullable=False),
    Column("link", String(200)),
    # Sin restricción UNIQUE: SQL Server solo admite un NULL por columna única. El repositorio
    # comprueba el duplicado antes de insertar.
    Column("dedupe_key", String(100)),
    Column("created_at", DateTime(timezone=True), nullable=False),
    Column("read_at", DateTime(timezone=True)),
    Index(None, "seller_id", "created_at"),
)
