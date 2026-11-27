"""Herramientas MCP de la planificación (ADR 0017): solo lectura, sin lógica propia.

Cada herramienta llama al mismo caso de uso que el router HTTP, con el usuario del token, y
solo cambia el formato de la respuesta (claves en español, nombres de producto, sin ceros).
Los permisos los comprueban los casos de uso, como en la API: un vendedor solo ve lo suyo.

Las descripciones las leen los agentes para elegir la herramienta: deben ser claras.
"""

import secrets
from collections.abc import Callable, Iterable
from dataclasses import dataclass
from datetime import date, datetime
from typing import Annotated, Any

from mcp.server.mcpserver import MCPServer
from mcp.types import ToolAnnotations
from pydantic import Field

from app.core.config import get_settings
from app.planning.bootstrap import PlanningUseCases, build_use_cases
from app.planning.domain.models import Seller
from app.planning.domain.permissions import AI_AGENT, Permission, permissions_of
from app.shared.domain.errors import AuthenticationError
from app.shared.infrastructure.database.session import SessionLocal
from app.shared.infrastructure.mcp.server import (
    TICKET_PREFIX,
    Identity,
    compact_json,
    current_identity,
    domain_errors,
)

# El agente de servicio (token MCP_AGENT_TOKEN) no es una cuenta: «:» no cabe en un usuario
# real (ver domain/accounts.py), así que no se confunde con nadie en el log ni en el límite.
AGENT = Seller(username="agente:n8n", name="Agente de IA (n8n)", role=AI_AGENT)
# Tope de filas por respuesta: protege el contexto (y el costo) del agente.
MAX_ROWS = 200
READ_ONLY = ToolAnnotations(read_only_hint=True, destructive_hint=False, idempotent_hint=True)

Day = Annotated[date, Field(description="Fecha en formato AAAA-MM-DD (zona America/Lima).")]
DateFrom = Annotated[date, Field(description="Primer día del rango, AAAA-MM-DD.")]
DateTo = Annotated[date, Field(description="Último día del rango (incluido), AAAA-MM-DD.")]
SellerFilter = Annotated[
    str | None,
    Field(
        max_length=50,
        description=(
            "Usuario del vendedor (p. ej. «rnavarro»; ver listar_vendedores). Vacío = todos los "
            "que puedes ver. Un vendedor siempre ve solo lo suyo, aunque pida a otro."
        ),
    ),
]


def _is_agent_token(token: str) -> bool:
    expected = get_settings().mcp_agent_token
    return bool(expected) and secrets.compare_digest(token.encode(), expected.encode())


def viewer_for(token: str, use_cases: PlanningUseCases) -> Seller:
    """Quién consulta: el agente de servicio o el dueño del token de sesión (si sigue válido)."""
    if _is_agent_token(token):
        return AGENT
    if token.startswith(TICKET_PREFIX):
        # Pase del asistente: consulta como quien preguntó en el chat (ADR 0022).
        return use_cases.ticket_account(token.removeprefix(TICKET_PREFIX)).seller
    return use_cases.current_account(token).seller


def _identity(seller: Seller, may_delegate: bool = False) -> Identity:
    permissions = frozenset(p.value for p in permissions_of(seller.role))
    return Identity(seller.username, seller.role, permissions, may_delegate=may_delegate)


def identify(token: str) -> Identity | None:
    """Verificación del token para el SDK (en cada petición HTTP al MCP). Un pase del
    asistente no vale como token: solo llega por `identify_ticket`."""
    if token.startswith(TICKET_PREFIX):
        return None
    with SessionLocal() as session:
        try:
            seller = viewer_for(token, build_use_cases(session, get_settings()))
        except AuthenticationError:
            return None
    return _identity(seller, may_delegate=seller is AGENT)


def identify_ticket(ticket: str) -> Identity | None:
    """La persona dueña de un pase del asistente (si sigue vigente y su sesión es válida)."""
    with SessionLocal() as session:
        try:
            seller = build_use_cases(session, get_settings()).ticket_account(ticket).seller
        except AuthenticationError:
            return None
    return _identity(seller)


def sees_team(identity: Identity) -> bool:
    """Ve los datos de todo el equipo (lo usa la herramienta de cargas de la ingesta)."""
    return identity.can(Permission.VIEW_TEAM.value)


def _run(work: Callable[[PlanningUseCases, Seller], dict[str, Any]]) -> str:
    """Abre una sesión, vuelve a resolver al usuario del token y corre el caso de uso."""
    identity = current_identity()
    with SessionLocal() as session, domain_errors():
        use_cases = build_use_cases(session, get_settings())
        return compact_json(work(use_cases, viewer_for(identity.token, use_cases)))


def _capped(rows: list[dict[str, Any]], key: str, extra: dict[str, Any]) -> dict[str, Any]:
    result = {**extra, key: rows[:MAX_ROWS], "cantidad": len(rows)}
    if len(rows) > MAX_ROWS:
        result["aviso"] = (
            f"Solo se muestran {MAX_ROWS} de {len(rows)}. Acota el rango o filtra por vendedor."
        )
    return result


def _span(date_from: date, date_to: date) -> dict[str, str]:
    return {"desde": date_from.isoformat(), "hasta": date_to.isoformat()}


def _names(use_cases: PlanningUseCases) -> dict[str, str]:
    return {p.id: p.name for p in use_cases.get_catalog()}


def _units(units: dict[str, int], names: dict[str, str]) -> dict[str, int]:
    """Unidades por producto («Nombre (código)»), sin los que están en 0."""
    return {f"{names.get(pid, pid)} ({pid})": n for pid, n in units.items() if n}


@dataclass(frozen=True)
class _Tool:
    fn: Callable[..., str]
    title: str
    description: str


# --- Herramientas --------------------------------------------------------------------------


def listar_vendedores() -> str:
    def work(uc: PlanningUseCases, viewer: Seller) -> dict[str, Any]:
        sellers = uc.list_sellers(viewer)
        rows = [{"usuario": s.username, "nombre": s.name, "zona": s.zone} for s in sellers]
        return _capped(rows, "vendedores", {})

    return _run(work)


def proyecciones(fecha_desde: DateFrom, fecha_hasta: DateTo, vendedor: SellerFilter = None) -> str:
    def work(uc: PlanningUseCases, viewer: Seller) -> dict[str, Any]:
        found = uc.list_projections(viewer, fecha_desde, fecha_hasta, vendedor or None)
        names = _names(uc)
        rows = [
            {
                "vendedor": p.seller,
                "fecha": p.date.isoformat(),
                "categoria": p.category,
                "estado": p.status,
                "unidades_total": p.total_units,
                "kg_total": p.total_kg,
                "unidades_por_producto": _units(p.units, names),
                "enviada": p.submitted_at.isoformat(timespec="minutes"),
                "hoja": p.sheet,
            }
            for p in sorted(found, key=lambda p: (p.date, p.seller, p.category))
        ]
        totals = {
            "desde": fecha_desde.isoformat(),
            "hasta": fecha_hasta.isoformat(),
            "unidades_total": sum(p.total_units for p in found),
            "kg_total": round(sum(p.total_kg for p in found), 2),
        }
        return _capped(rows, "proyecciones", totals)

    return _run(work)


def confirmacion_del_equipo(fecha: Day) -> str:
    def work(uc: PlanningUseCases, viewer: Seller) -> dict[str, Any]:
        # La regla de la exportación: registró quien tiene al menos una proyección ese día.
        # Por usuario (dos vendedores pueden llamarse igual). Solo vendedores: el jefe de
        # despacho no proyecta.
        team = [s for s in uc.list_sellers(viewer) if s.is_seller]
        found = uc.list_projections(viewer, fecha, fecha, None)
        done, missing = [], []
        for person in team:
            own = [p for p in found if p.seller == person.username]
            who = {"usuario": person.username, "vendedor": person.name, "zona": person.zone}
            if not own:
                missing.append(who)
                continue
            categories = sorted({p.category for p in own})
            units = sum(p.total_units for p in own)
            done.append({**who, "categorias": categories, "unidades": units})
        return {
            "fecha": fecha.isoformat(),
            "vendedores": len(team),
            "registraron": len(done),
            "con_proyeccion": done[:MAX_ROWS],
            "sin_proyeccion": missing[:MAX_ROWS],
        }

    return _run(work)


def saca_sugerida(fecha: Day) -> str:
    def work(uc: PlanningUseCases, viewer: Seller) -> dict[str, Any]:
        plan = uc.calculate_saca(viewer, fecha)
        return {
            "calculada_el": plan.date.isoformat(),
            "pedidos_del": plan.orders_date.isoformat(),
            "proyeccion_del": plan.projection_date.isoformat(),
            "pedido_a_granja_aves": plan.farm_order,
            "por_tipo": [
                {
                    "tipo": g.name,
                    "stock": g.stock,
                    "stock_calidad_b": g.stock_b,
                    "pedidos": g.ordered,
                    "proyectado": g.projected,
                    "plus": g.plus,
                    "pedido_a_granja": g.farm_order,
                }
                for g in plan.groups
            ],
            "stock_productos": plan.stock,
            "stock_calidad_b": plan.stock_b,
            "plus_total": plan.plus,
            "stock_antiguo_no_contado": plan.stock_old,
            "dias_de_lote_que_cuentan": plan.stock_lot_days,
            "kg_producto": plan.request_kg,
            "kg_vivos_estimados": plan.live_kg,
            "stock_del": plan.stock_date.isoformat() if plan.stock_date else None,
            "vendedores_con_proyeccion": plan.sellers_registered,
            "vendedores_activos": plan.sellers_total,
            "hay_pedidos_cargados": plan.orders_available,
        }

    return _run(work)


def stock(fecha_desde: DateFrom, fecha_hasta: DateTo) -> str:
    def work(uc: PlanningUseCases, viewer: Seller) -> dict[str, Any]:
        days = uc.list_stock(viewer, fecha_desde, fecha_hasta)
        names = {p.id: p.name for p in uc.stock_options(viewer).items}
        rows = [
            {
                "fecha": d.date.isoformat(),
                "unidades_total": d.total_units,
                "kg_total": d.total_kg,
                "lineas": [
                    {
                        "producto": f"{names.get(line.product_id, line.product_id)} "
                        f"({line.product_id})",
                        "unidades": line.units,
                        "kg": line.kg,
                        "ubicacion": line.location,
                        "lote": (line.lot_date or d.date).isoformat(),
                    }
                    for line in d.lines
                    if line.units
                ],
                "registrado_por": d.recorded_by,
            }
            for d in days
        ]
        return _capped(rows, "dias", _span(fecha_desde, fecha_hasta))

    return _run(work)


def produccion(fecha_desde: DateFrom, fecha_hasta: DateTo) -> str:
    def work(uc: PlanningUseCases, viewer: Seller) -> dict[str, Any]:
        days = uc.list_production(viewer, fecha_desde, fecha_hasta)
        names = _names(uc)
        rows = [
            {
                "fecha": d.date.isoformat(),
                "aves_pedidas": d.ordered,
                "aves_llegadas": d.produced,
                "calidad_b": d.quality_b,
                "peso_vivo_promedio_kg": d.weights,
                "por_producto": [
                    {
                        "producto": f"{names.get(line.product_id, line.product_id)} "
                        f"({line.product_id})",
                        "pedidas": line.ordered,
                        "llegadas": line.produced,
                        "calidad_b": line.quality_b,
                    }
                    for line in d.lines
                ],
                "registrado_por": d.recorded_by,
            }
            for d in days
        ]
        return _capped(rows, "dias", _span(fecha_desde, fecha_hasta))

    return _run(work)


def pedido_real(fecha_desde: DateFrom, fecha_hasta: DateTo, vendedor: SellerFilter = None) -> str:
    def work(uc: PlanningUseCases, viewer: Seller) -> dict[str, Any]:
        found = uc.get_sales(viewer, fecha_desde, fecha_hasta, vendedor or None)
        names = _names(uc)
        rows = [
            {
                "vendedor": d.seller,
                "fecha": d.date.isoformat(),
                "unidades": _units(d.units, names),
                "total_unidades": sum(d.units.values()),
            }
            for d in sorted(found, key=lambda d: (d.date, d.seller))
            if any(d.units.values())
        ]
        return _capped(rows, "pedidos", _span(fecha_desde, fecha_hasta))

    return _run(work)


_WEEKDAYS = ("lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo")


def _when(moment: datetime) -> str:
    """«viernes 20/11 a las 14:00»: los agentes leen mal las fechas ISO con zona."""
    return f"{_WEEKDAYS[moment.weekday()]} {moment:%d/%m} a las {moment:%H:%M}"


def reglas_de_registro() -> str:
    def work(uc: PlanningUseCases, viewer: Seller) -> dict[str, Any]:
        window = uc.editing_window(viewer)
        policy = window.policy
        same_day = policy.days_before == 0
        rule = (
            f"Cada día se registra hasta las {policy.cutoff:%H:%M} del mismo día."
            if same_day
            else f"Cada día se registra hasta las {policy.cutoff:%H:%M} de "
            f"{policy.days_before} día(s) antes."
        )
        return {
            "regla": rule
            if policy.enabled
            else "No hay hora de corte: se puede registrar siempre.",
            "hora_de_corte": f"{policy.cutoff:%H:%M}",
            "dias_antes_del_corte": policy.days_before,
            "se_registra_desde_dentro_de_dias": policy.starts_in,
            "dias_que_se_pueden_registrar": policy.open_days,
            "corte_activo": policy.enabled,
            "dias": [
                {
                    "fecha": d.date.isoformat(),
                    "dia": f"{_WEEKDAYS[d.date.weekday()]} {d.date:%d/%m}",
                    "cierra": _when(d.closes_at),
                    "abierto": d.open,
                    "habilitacion": d.unlock.status if d.unlock else None,
                }
                for d in window.days
            ],
        }

    return _run(work)


def productos() -> str:
    def work(uc: PlanningUseCases, _viewer: Seller) -> dict[str, Any]:
        rows = [
            {
                "codigo": p.id,
                "nombre": p.name,
                "categoria": p.category,
                "grupo": p.subcategory,
                "kg_por_unidad": p.kg_per_unit,
                "se_proyecta": p.is_projectable,
            }
            for p in uc.get_catalog()
        ]
        return _capped(rows, "productos", {})

    return _run(work)


TOOLS: tuple[_Tool, ...] = (
    _Tool(
        pedido_real,
        "Pedido real (ARIS)",
        "Pedido real despachado según ARIS (unidades por producto) entre dos fechas, de un "
        "vendedor o de todos los que puedes ver. Sirve para comparar con lo proyectado "
        "(herramienta proyecciones). Los días sin pedido no aparecen; el último día cargado "
        "puede estar incompleto. Un vendedor solo ve lo suyo.",
    ),
    _Tool(
        reglas_de_registro,
        "Reglas para registrar la proyección",
        "Hora de corte, cuántos días antes cierra cada día, qué días se pueden registrar y, "
        "día por día, hasta cuándo («cierra», hora de Lima) y si sigue abierto o tiene "
        "habilitación. Úsala para «¿a qué hora cierra?», «¿qué días puedo registrar?» o "
        "«¿todavía puedo registrar mañana?». La puede usar cualquiera.",
    ),
    _Tool(
        productos,
        "Productos",
        "Catálogo de productos: código, nombre, categoría, grupo (Brasa chica, mediana, "
        "grande) y kg por unidad. Úsala para pasar de unidades a kg o para saber qué se "
        "proyecta. La puede usar cualquiera.",
    ),
    _Tool(
        listar_vendedores,
        "Vendedores",
        "Lista los vendedores activos que puedes ver: usuario, nombre y zona. Úsala para "
        "pasar de un nombre («Rosa Navarro») al usuario que piden las demás herramientas. "
        "Un vendedor solo se ve a sí mismo.",
    ),
    _Tool(
        proyecciones,
        "Proyecciones por vendedor y día",
        "Proyecciones de venta registradas (unidades y kg por producto) entre dos fechas, de "
        "un vendedor o de todos los que puedes ver. Cada fila es un vendedor, un día y una "
        "categoría; vale la última hoja enviada. Si la lista está vacía, nadie registró en ese "
        "rango. Máximo 400 días por consulta.",
    ),
    _Tool(
        confirmacion_del_equipo,
        "Quién registró su proyección",
        "Para un día: qué vendedores ya registraron su proyección (con unidades y categorías) "
        "y quiénes no («sin_proyeccion»). Cada persona trae su usuario, nombre y zona. Un "
        "vendedor solo ve su propio estado.",
    ),
    _Tool(
        saca_sugerida,
        "Saca sugerida",
        "Cálculo de saca hecho el día `fecha` (normalmente hoy): cuántas aves pedir a granja "
        "por tipo. Fórmula: stock − pedidos de mañana + proyección de pasado mañana + plus. "
        "Incluye cuántos vendedores registraron y si hay pedidos cargados; si faltan, el "
        "cálculo está incompleto y hay que decirlo. Solo supervisores.",
    ),
    _Tool(
        stock,
        "Stock de despacho",
        "Stock de despacho registrado por día entre dos fechas (solo los días con registro), "
        "por producto, lote y ubicación. Del más reciente al más antiguo. Solo supervisores y "
        "jefe de despacho.",
    ),
    _Tool(
        produccion,
        "Producción diaria",
        "Producción registrada por día entre dos fechas: aves pedidas a granja, aves que "
        "llegaron, calidad B y peso vivo promedio por tipo. Del más reciente al más antiguo. "
        "Solo supervisores y jefe de despacho.",
    ),
)


def register(server: MCPServer, tools: Iterable[_Tool] = TOOLS) -> None:
    for tool in tools:
        server.add_tool(
            tool.fn,
            name=tool.fn.__name__,
            title=tool.title,
            description=tool.description,
            annotations=READ_ONLY,
            structured_output=False,
        )
