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
    Text,
    UniqueConstraint,
    Uuid,
    false,
    func,
)

from app.planning.domain.models import QUALITY_A
from app.planning.domain.permissions import SELLER
from app.planning.domain.stock import DEFAULT_LOCATION
from app.shared.infrastructure.database.metadata import TABLES, metadata

sellers = Table(
    TABLES["sellers"],
    metadata,
    Column("id", Integer, primary_key=True, autoincrement=True),
    Column("username", String(50), nullable=False, unique=True),
    Column("name", String(100), nullable=False),
    Column("zone", String(50)),
    Column("password_hash", String(200), nullable=False),
    # Rol: varchar validado por la app (domain/permissions.ROLES), no ENUM.
    Column("role", String(20), nullable=False, server_default=SELLER),
    # Seguridad: cambio obligatorio (contraseña temporal), bloqueo por intentos y versión
    # de sesión (al subirla se invalidan los tokens emitidos antes).
    Column("must_change_password", Boolean, nullable=False, server_default=false()),
    Column("failed_logins", Integer, nullable=False, server_default="0"),
    Column("locked_until", DateTime(timezone=True)),
    Column("token_version", Integer, nullable=False, server_default="0"),
    Column("is_active", Boolean, nullable=False, default=True),
    Column("created_at", DateTime(timezone=True), nullable=False, server_default=func.now()),
    # Preferencias de la interfaz (domain/preferences.py), en JSON (texto: portable entre motores).
    Column("preferences", Text),
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
    # «A» o «B» (calidad B: solo para el stock de despacho).
    Column("quality", String(1), nullable=False, default=QUALITY_A, server_default=QUALITY_A),
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
    # Hoja de registro vigente (1, 2, ...): cada registro que cambia las unidades abre una nueva.
    Column("sheet", Integer, nullable=False, server_default="1"),
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

settings = Table(
    TABLES["settings"],
    metadata,
    Column("key", String(50), primary_key=True),
    Column("value", String(200), nullable=False),
    Column("updated_by", String(50)),
    Column("updated_at", DateTime(timezone=True)),
)

# Saca guardada de cada día (lo que se vio y se pidió a granja), para consultarla después.
saca_snapshots = Table(
    TABLES["saca_snapshots"],
    metadata,
    Column("date", Date, primary_key=True),
    Column("saved_at", DateTime(timezone=True), nullable=False),
    Column("saved_by", String(50), nullable=False),
    Column("farm_order", Integer, nullable=False),
    # La saca completa en JSON (texto: portable entre motores), tal como la envía la API.
    Column("payload", Text, nullable=False),
)

# Modelo de demanda (ADR 0020): la última corrida (métricas en JSON) y sus predicciones por
# modelo, vendedor y día (unidades por producto en JSON).
model_runs = Table(
    TABLES["model_runs"],
    metadata,
    Column("id", Integer, primary_key=True, autoincrement=True),
    Column("trained_at", DateTime(timezone=True), nullable=False),
    Column("summary", Text, nullable=False),
)

model_predictions = Table(
    TABLES["model_predictions"],
    metadata,
    Column("id", Integer, primary_key=True, autoincrement=True),
    Column("model", String(20), nullable=False),
    Column("seller", String(50), nullable=False),
    Column("date", Date, nullable=False),
    Column("units", Text, nullable=False),
    Index(f"ix_{TABLES['model_predictions']}_model_date", "model", "date"),
)

edit_unlocks = Table(
    TABLES["edit_unlocks"],
    metadata,
    Column("id", Integer, primary_key=True, autoincrement=True),
    Column("seller_id", Integer, ForeignKey(TABLES.fk("sellers")), nullable=False),
    Column("date", Date, nullable=False),
    Column("reason", String(300), nullable=False),
    # requested | approved | rejected | closed (domain/editing.UNLOCK_STATUSES), no ENUM.
    Column("status", String(15), nullable=False),
    Column("requested_at", DateTime(timezone=True), nullable=False),
    Column("decided_by", String(50)),
    Column("decided_at", DateTime(timezone=True)),
    Index(None, "seller_id", "date"),
)

projection_changes = Table(
    TABLES["projection_changes"],
    metadata,
    Column("id", Integer, primary_key=True, autoincrement=True),
    Column("seller_id", Integer, ForeignKey(TABLES.fk("sellers")), nullable=False),
    Column("date", Date, nullable=False),
    Column("category", String(30), nullable=False),
    Column("author", String(50), nullable=False),
    # created | updated (domain/history.ACTIONS), no ENUM.
    Column("action", String(10), nullable=False),
    # Unidades por producto en JSON (texto: portable entre motores).
    Column("before_units", Text),
    Column("after_units", Text, nullable=False),
    Column("before_total", Integer),
    Column("after_total", Integer, nullable=False),
    Column("after_cutoff", Boolean, nullable=False, default=False),
    # Hoja que dejó el cambio; NULL en los cambios anteriores a las hojas de registro.
    Column("sheet", Integer),
    Column("changed_at", DateTime(timezone=True), nullable=False),
    # Día del cambio en la zona del negocio (para filtrar sin depender del motor).
    Column("changed_on", Date, nullable=False),
    Index(None, "seller_id", "changed_on"),
)

dispatch_stock = Table(
    TABLES["dispatch_stock"],
    metadata,
    Column("id", Integer, primary_key=True, autoincrement=True),
    Column("date", Date, nullable=False),
    Column("product_id", String(10), ForeignKey(TABLES.fk("products")), nullable=False),
    Column("units", Integer, nullable=False),
    Column("kg", Numeric(10, 2, asdecimal=False), nullable=False),
    # Dónde está el stock y de qué lote es (el lote es la fecha de beneficio).
    Column("location", String(60), nullable=False, server_default=DEFAULT_LOCATION),
    Column("lot_date", Date, nullable=False),
    Column("recorded_by", String(50), nullable=False),
    Column("recorded_at", DateTime(timezone=True), nullable=False),
    UniqueConstraint("date", "location", "product_id", "lot_date"),
    CheckConstraint("units >= 0", name="units_non_negative"),
    CheckConstraint("kg >= 0", name="kg_non_negative"),
)

production = Table(
    TABLES["production"],
    metadata,
    Column("id", Integer, primary_key=True, autoincrement=True),
    Column("date", Date, nullable=False),
    Column("product_id", String(10), ForeignKey(TABLES.fk("products")), nullable=False),
    # Aves pedidas a granja en ese rango (con decimales: el pedido se reparte en porcentajes).
    Column("ordered", Numeric(12, 2, asdecimal=False), nullable=False),
    Column("produced", Integer, nullable=False),
    Column("quality_b", Integer, nullable=False),
    Column("recorded_by", String(50), nullable=False),
    Column("recorded_at", DateTime(timezone=True), nullable=False),
    UniqueConstraint("date", "product_id"),
    CheckConstraint("ordered >= 0 AND produced >= 0", name="amounts_non_negative"),
    CheckConstraint("quality_b >= 0 AND quality_b <= produced", name="quality_b_within_produced"),
)

# Peso vivo promedio (kg) de la parvada de cada tipo en un día de producción.
production_weights = Table(
    TABLES["production_weights"],
    metadata,
    Column("id", Integer, primary_key=True, autoincrement=True),
    Column("date", Date, nullable=False),
    Column("group", String(60), nullable=False),
    Column("avg_kg", Numeric(6, 3, asdecimal=False), nullable=False),
    UniqueConstraint("date", "group"),
    CheckConstraint("avg_kg > 0", name="avg_kg_positive"),
)

# Historia del negocio, tal como sale de ARIS y de las tiendas (`cli historia`). Solo lectura
# para la app: sirve de base a los pedidos confirmados y a la predicción de la demanda.
dispatch_orders = Table(
    TABLES["dispatch_orders"],
    metadata,
    Column("id", Integer, primary_key=True, autoincrement=True),
    Column("order_number", Integer, nullable=False),
    Column("customer", String(200), nullable=False),
    Column("material_code", String(30)),
    Column("material", String(200), nullable=False),
    Column("ordered_kg", Numeric(12, 2, asdecimal=False), nullable=False),
    Column("dispatched_kg", Numeric(12, 2, asdecimal=False), nullable=False),
    Column("ordered_units", Numeric(12, 2, asdecimal=False), nullable=False),
    Column("dispatched_units", Numeric(12, 2, asdecimal=False), nullable=False),
    Column("zone", String(60)),
    Column("registered_on", Date, nullable=False),
    Column("delivery_date", Date, nullable=False),
    Column("seller", String(60)),
    Index(None, "delivery_date", "material_code"),
)

store_sales = Table(
    TABLES["store_sales"],
    metadata,
    Column("id", Integer, primary_key=True, autoincrement=True),
    # Identificador de la línea en el sistema de tiendas: el export la repite y aquí va una vez.
    Column("source_line_id", Integer, nullable=False, unique=True),
    Column("document", String(30), nullable=False),
    Column("document_type", String(20), nullable=False),
    Column("grouping", String(30)),
    Column("date", Date, nullable=False),
    Column("store_code", String(20), nullable=False),
    Column("store", String(120), nullable=False),
    Column("material_code", String(30), nullable=False),
    Column("material", String(200), nullable=False),
    Column("quantity", Numeric(14, 3, asdecimal=False), nullable=False),
    Column("unit", String(10)),
    Column("unit_price", Numeric(12, 4, asdecimal=False), nullable=False),
    Index(None, "date", "material_code"),
)

# Asistente (ADR 0024): conversaciones y mensajes guardados, vinculaciones de Telegram y WhatsApp,
# códigos de vinculación de un solo uso y borradores de fotos por confirmar. Los JSON van en texto
# (portable entre motores).
assistant_conversations = Table(
    TABLES["assistant_conversations"],
    metadata,
    Column("id", Uuid, primary_key=True),
    Column("username", String(50), nullable=False),
    # app | telegram | whatsapp (domain/conversations.ALL_CHANNELS), no ENUM.
    Column("channel", String(10), nullable=False),
    Column("title", String(120), nullable=False, server_default=""),
    Column("created_at", DateTime(timezone=True), nullable=False),
    Column("updated_at", DateTime(timezone=True), nullable=False),
    Column("archived", Boolean, nullable=False, server_default=false()),
    Index(None, "username", "updated_at"),
)

assistant_messages = Table(
    TABLES["assistant_messages"],
    metadata,
    Column("id", Uuid, primary_key=True),
    Column(
        "conversation_id",
        Uuid,
        ForeignKey(TABLES.fk("assistant_conversations"), ondelete="CASCADE"),
        nullable=False,
    ),
    Column("role", String(10), nullable=False),
    Column("text", Text, nullable=False),
    Column("blocks", Text),
    Column("suggestions", Text),
    Column("created_at", DateTime(timezone=True), nullable=False),
    Index(None, "conversation_id", "created_at"),
)

assistant_channel_links = Table(
    TABLES["assistant_channel_links"],
    metadata,
    Column("id", Integer, primary_key=True, autoincrement=True),
    Column("channel", String(10), nullable=False),
    # Id de chat (Telegram) o número sin «+» (WhatsApp).
    Column("sender", String(64), nullable=False),
    Column("username", String(50), nullable=False),
    Column("created_at", DateTime(timezone=True), nullable=False),
    UniqueConstraint("channel", "sender"),
    Index(None, "username"),
)

assistant_link_codes = Table(
    TABLES["assistant_link_codes"],
    metadata,
    Column("code", String(8), primary_key=True),
    Column("username", String(50), nullable=False),
    Column("created_at", DateTime(timezone=True), nullable=False),
    Column("expires_at", DateTime(timezone=True), nullable=False),
    Index(None, "username"),
)

assistant_drafts = Table(
    TABLES["assistant_drafts"],
    metadata,
    Column("id", Uuid, primary_key=True),
    Column("username", String(50), nullable=False),
    Column("channel", String(10), nullable=False),
    # projection | stock
    Column("kind", String(15), nullable=False),
    Column("payload", Text, nullable=False),
    Column("created_at", DateTime(timezone=True), nullable=False),
    Column("expires_at", DateTime(timezone=True), nullable=False),
    # pending | confirmed | discarded | expired (domain/channels), no ENUM.
    Column("status", String(10), nullable=False),
    Index(None, "username", "status"),
)
