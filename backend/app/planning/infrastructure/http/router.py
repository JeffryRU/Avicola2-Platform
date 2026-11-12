"""API HTTP de la planificación de demanda (adaptador de entrada de FastAPI).

La sesión viaja en una cookie HttpOnly (`nv_session`): el JavaScript de la página no puede
leer el token, y no aparece en el cuerpo de ninguna respuesta ni en el almacenamiento local.

La app móvil no usa cookies: pide el token con `POST /api/auth/token` y lo envía en
`Authorization: Bearer <token>` (ADR 0009). El navegador nunca recibe el token en el cuerpo.
"""

from dataclasses import asdict
from datetime import date
from typing import Annotated, Literal

from fastapi import APIRouter, Cookie, Depends, Header, Query, Response, status
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.planning.application.accounts import Session as AuthSession
from app.planning.application.production import ProductionEntry
from app.planning.application.stock import StockEntry
from app.planning.application.use_cases import DayUnits
from app.planning.bootstrap import PlanningUseCases, build_use_cases
from app.planning.domain.editing import CutoffPolicy, EditUnlock
from app.planning.domain.models import Projection, Seller, SellerAccount
from app.planning.domain.permissions import (
    Permission,
    assignable_roles,
    can_manage,
    manageable_roles,
    permissions_of,
)
from app.planning.domain.production import (
    MIN_HISTORY_DAYS,
    DailyProduction,
    overall_error,
)
from app.planning.domain.stock import DailyStock
from app.planning.infrastructure.exporters import WRITERS, ExportFormat
from app.planning.infrastructure.http import schemas as s
from app.shared.domain.errors import AuthenticationError, ForbiddenError
from app.shared.infrastructure.database.session import get_session
from app.shared.infrastructure.http.params import DbIdPath
from app.shared.infrastructure.http.service_token import require_service_token

SESSION_COOKIE = "nv_session"
COOKIE_PATH = "/api"


def get_use_cases(session: Annotated[Session, Depends(get_session)]) -> PlanningUseCases:
    return build_use_cases(session, get_settings())


UseCases = Annotated[PlanningUseCases, Depends(get_use_cases)]
SessionCookie = Annotated[str | None, Cookie(alias=SESSION_COOKIE)]
AuthorizationHeader = Annotated[str | None, Header(alias="Authorization")]


def session_token(
    cookie: SessionCookie = None, authorization: AuthorizationHeader = None
) -> str | None:
    """Token de la sesión: `Authorization: Bearer` (app móvil) o la cookie (navegador).

    El encabezado no lo adjunta el navegador por su cuenta, así que no abre la puerta a CSRF.
    """
    if authorization:
        scheme, _, value = authorization.partition(" ")
        if scheme.lower() == "bearer" and value.strip():
            return value.strip()
    return cookie


SessionToken = Annotated[str | None, Depends(session_token)]


def current_account(use_cases: UseCases, token: SessionToken) -> SellerAccount:
    if not token:
        raise AuthenticationError("Inicia sesión para continuar.")
    return use_cases.current_account(token)


def active_account(account: Annotated[SellerAccount, Depends(current_account)]) -> SellerAccount:
    """Con contraseña temporal solo se puede cambiar la contraseña o cerrar sesión."""
    if account.must_change_password:
        raise ForbiddenError("Debes cambiar tu contraseña antes de continuar.")
    return account


def current_seller(account: Annotated[SellerAccount, Depends(active_account)]) -> Seller:
    return account.seller


Account = Annotated[SellerAccount, Depends(current_account)]
ActiveAccount = Annotated[SellerAccount, Depends(active_account)]
CurrentSeller = Annotated[Seller, Depends(current_seller)]


def requires(permission: Permission):
    """Primera barrera, a nivel de router: sin el permiso, ningún endpoint del grupo responde.
    Los casos de uso vuelven a comprobarlo (y las reglas sobre la cuenta destino)."""

    def check(account: ActiveAccount) -> SellerAccount:
        if not account.seller.can(permission):
            raise ForbiddenError("No tienes permiso para hacer esto.")
        return account

    return Depends(check)


public = APIRouter(prefix="/api", tags=["planning"])
router = APIRouter(prefix="/api", tags=["planning"], dependencies=[Depends(active_account)])
admin = APIRouter(
    prefix="/api/admin", tags=["admin"], dependencies=[requires(Permission.MANAGE_ACCOUNTS)]
)
editing_admin = APIRouter(
    prefix="/api/admin", tags=["admin"], dependencies=[requires(Permission.MANAGE_EDITING)]
)
production = APIRouter(
    prefix="/api/production",
    tags=["production"],
    dependencies=[requires(Permission.VIEW_PRODUCTION)],
)
saca = APIRouter(prefix="/api/saca", tags=["saca"], dependencies=[requires(Permission.VIEW_SACA)])
stock = APIRouter(
    prefix="/api/stock", tags=["stock"], dependencies=[requires(Permission.VIEW_STOCK)]
)


def _set_session_cookie(response: Response, token: str, remember: bool) -> None:
    settings = get_settings()
    response.set_cookie(
        SESSION_COOKIE,
        token,
        max_age=settings.auth_token_ttl_hours * 3600 if remember else None,
        path=COOKIE_PATH,
        httponly=True,
        secure=settings.cookie_secure,
        samesite="strict",
    )


def _account_out(account: SellerAccount) -> s.AccountOut:
    role = account.seller.role
    return s.AccountOut(
        seller=s.SellerOut(**asdict(account.seller)),
        must_change_password=account.must_change_password,
        permissions=[p.value for p in Permission if p in permissions_of(role)],
        manageable_roles=list(manageable_roles(role)),
    )


def _admin_out(account: SellerAccount, actor: SellerAccount) -> s.AdminAccountOut:
    own = account.seller.username == actor.seller.username
    actor_role, role = actor.seller.role, account.seller.role
    return s.AdminAccountOut(
        **asdict(account.seller),
        is_active=account.is_active,
        must_change_password=account.must_change_password,
        locked_until=account.locked_until,
        # La propia cuenta se gestiona desde Perfil, nunca desde Usuarios.
        can_manage=not own and can_manage(actor_role, role),
        assignable_roles=[] if own else list(assignable_roles(actor_role, role)),
    )


def _login_response(response: Response, session: AuthSession, remember: bool) -> s.AccountOut:
    _set_session_cookie(response, session.token, remember)
    return _account_out(session.account)


def _projection_out(p: Projection) -> s.ProjectionOut:
    return s.ProjectionOut(
        id=p.id,
        submission_id=p.submission_id,
        seller=p.seller,
        date=p.date,
        category=p.category,
        status=p.status,
        total_units=p.total_units,
        total_kg=p.total_kg,
        submitted_at=p.submitted_at,
        units=p.units,
        sheet=p.sheet,
    )


# --- Sesión ----------------------------------------------------------------------------


@public.post("/auth/login")
def login(use_cases: UseCases, body: s.LoginIn, response: Response) -> s.AccountOut:
    session = use_cases.authenticate(body.username, body.password)
    return _login_response(response, session, body.remember)


@public.post("/auth/token")
def issue_token(use_cases: UseCases, body: s.TokenLoginIn) -> s.TokenOut:
    """Login de la app móvil: el token va en el cuerpo y la app lo guarda cifrado."""
    session = use_cases.authenticate(body.username, body.password)
    account = _account_out(session.account)
    ttl = get_settings().auth_token_ttl_hours * 3600
    return s.TokenOut(**account.model_dump(), token=session.token, expires_in=ttl)


@public.post("/auth/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(response: Response) -> None:
    settings = get_settings()
    response.delete_cookie(
        SESSION_COOKIE,
        path=COOKIE_PATH,
        httponly=True,
        secure=settings.cookie_secure,
        samesite="strict",
    )


@public.get("/auth/me")
def me(account: Account) -> s.AccountOut:
    return _account_out(account)


@public.patch("/auth/profile")
def update_profile(use_cases: UseCases, account: Account, body: s.ProfileIn) -> s.AccountOut:
    """La persona edita su propio perfil (por ahora, el nombre visible)."""
    return _account_out(use_cases.update_profile(account, body.name))


@public.post("/auth/password")
def change_password(
    use_cases: UseCases, account: Account, body: s.ChangePasswordIn, response: Response
) -> s.AccountOut:
    """Cierra las demás sesiones de la cuenta y renueva la cookie de esta."""
    session = use_cases.change_password(account, body.current_password, body.new_password)
    return _login_response(response, session, body.remember)


# --- Planificación ---------------------------------------------------------------------


@router.get("/status")
def api_status(use_cases: UseCases) -> s.StatusOut:
    """Conexión con la base y existencia de las tablas (pantalla Conexión)."""
    return use_cases.status.status()


@router.get("/catalog")
def catalog(use_cases: UseCases) -> list[s.ProductOut]:
    return [s.ProductOut(**asdict(p)) for p in use_cases.get_catalog()]


@router.get("/sellers")
def sellers(use_cases: UseCases, viewer: CurrentSeller) -> list[s.SellerOut]:
    """Un vendedor solo se ve a sí mismo; el supervisor, a todos los vendedores."""
    return [s.SellerOut(**asdict(v)) for v in use_cases.list_sellers(viewer)]


DateFrom = Annotated[date, Query()]
DateTo = Annotated[date, Query()]
SellerFilter = Annotated[str | None, Query(max_length=50)]


@router.get("/projections")
def list_projections(
    use_cases: UseCases,
    viewer: CurrentSeller,
    date_from: DateFrom,
    date_to: DateTo,
    seller: SellerFilter = None,
) -> list[s.ProjectionOut]:
    found = use_cases.list_projections(viewer, date_from, date_to, seller)
    return [_projection_out(p) for p in found]


@router.post("/projections", status_code=status.HTTP_201_CREATED)
def submit_projection(
    use_cases: UseCases, seller: CurrentSeller, body: s.SubmissionIn
) -> s.SubmissionOut:
    """El vendedor sale de la sesión, nunca del cuerpo de la petición."""
    saved = use_cases.submit_projection(
        seller,
        body.category,
        [DayUnits(d.date, d.units) for d in body.days],
        body.submission_id,
        body.seller,
    )
    return s.SubmissionOut(
        submission_id=saved[0].submission_id,
        days=len(saved),
        total_units=sum(p.total_units for p in saved),
        total_kg=round(sum(p.total_kg for p in saved), 2),
    )


@router.get("/projections/history")
def projection_history(
    use_cases: UseCases,
    viewer: CurrentSeller,
    date_from: DateFrom,
    date_to: DateTo,
    seller: SellerFilter = None,
) -> list[s.ChangeOut]:
    """Quién cambió qué y cuándo: el vendedor, lo suyo; el supervisor, todo (o un vendedor)."""
    return [
        s.ChangeOut(
            id=c.id or 0,
            seller=c.seller,
            date=c.date,
            category=c.category,
            author=c.author,
            action=c.action,
            before=c.before,
            after=c.after,
            before_total=c.before_total,
            after_total=c.after_total,
            after_cutoff=c.after_cutoff,
            changed_at=c.changed_at,
            sheet=c.sheet,
        )
        for c in use_cases.list_changes(viewer, date_from, date_to, seller)
    ]


@router.get("/projections/export", response_class=Response)
def export_projections(
    use_cases: UseCases,
    viewer: CurrentSeller,
    date_from: DateFrom,
    date_to: DateTo,
    seller: SellerFilter = None,
    format: Annotated[ExportFormat, Query()] = "xlsx",  # noqa: A002 (nombre del parámetro HTTP)
) -> Response:
    """Las proyecciones en Excel, PDF o CSV (lo usa la app móvil; la web arma la misma tabla):
    el vendedor, lo suyo; el supervisor, el equipo o un vendedor. Incluye la venta real y
    quién no registró cada día."""
    table = use_cases.export_projections(viewer, date_from, date_to, seller)
    writer = WRITERS[format]
    name = f"proyecciones_{date_from.isoformat()}_{date_to.isoformat()}.{format}"
    return Response(
        writer.write(table),
        media_type=writer.media_type,
        headers={"Content-Disposition": f'attachment; filename="{name}"'},
    )


@router.get("/sales")
def sales(
    use_cases: UseCases,
    viewer: CurrentSeller,
    date_from: DateFrom,
    date_to: DateTo,
    seller: SellerFilter = None,
) -> list[s.DailyUnitsOut]:
    found = use_cases.get_sales(viewer, date_from, date_to, seller)
    return [s.DailyUnitsOut(**asdict(d)) for d in found]


@router.get("/suggestions")
def suggestions(
    use_cases: UseCases,
    seller: CurrentSeller,
    category: Annotated[str, Query(max_length=30)],
    start: Annotated[date, Query()],
    days: Annotated[int, Query(ge=1)] = 1,
    on_behalf: SellerFilter = None,
) -> s.SuggestionOut:
    result = use_cases.suggest_projection(seller, category, start, days, on_behalf)
    method = use_cases.suggest_projection.forecaster.name
    return s.SuggestionOut(method=method, days=[s.DailyUnitsOut(**asdict(d)) for d in result])


# --- Administración de cuentas (supervisor) --------------------------------------------


@admin.get("/accounts")
def list_accounts(use_cases: UseCases, actor: ActiveAccount) -> list[s.AdminAccountOut]:
    return [_admin_out(a, actor) for a in use_cases.list_accounts(actor)]


@admin.post("/accounts", status_code=status.HTTP_201_CREATED)
def create_account(
    use_cases: UseCases, actor: ActiveAccount, body: s.CreateAccountIn
) -> s.NewCredentialsOut:
    created = use_cases.create_account(actor, body.username, body.name, body.zone, body.role)
    return s.NewCredentialsOut(
        account=_admin_out(created.account, actor),
        temporary_password=created.temporary_password,
    )


@admin.post("/accounts/{username}/reset-password")
def reset_password(use_cases: UseCases, actor: ActiveAccount, username: str) -> s.NewCredentialsOut:
    """Recuperación de contraseña: genera una temporal que el vendedor cambia al entrar."""
    reset = use_cases.reset_password(actor, username)
    return s.NewCredentialsOut(
        account=_admin_out(reset.account, actor), temporary_password=reset.temporary_password
    )


@admin.patch("/accounts/{username}")
def set_active(
    use_cases: UseCases, actor: ActiveAccount, username: str, body: s.SetActiveIn
) -> s.AdminAccountOut:
    return _admin_out(use_cases.set_account_active(actor, username, body.active), actor)


@admin.put("/accounts/{username}/role", dependencies=[requires(Permission.CHANGE_ROLES)])
def change_role(
    use_cases: UseCases, actor: ActiveAccount, username: str, body: s.ChangeRoleIn
) -> s.AdminAccountOut:
    """Solo el supervisor general. La cuenta cambiada vuelve a iniciar sesión."""
    return _admin_out(use_cases.change_role(actor, username, body.role), actor)


# --- Notificaciones --------------------------------------------------------------------


def _notification_out(n) -> s.NotificationOut:
    return s.NotificationOut(
        id=n.id,
        kind=n.kind,
        title=n.title,
        body=n.body,
        link=n.link,
        created_at=n.created_at,
        read_at=n.read_at,
    )


@router.get("/notifications")
def list_notifications(
    use_cases: UseCases, account: ActiveAccount, limit: Annotated[int, Query(ge=1, le=100)] = 50
) -> s.NotificationsOut:
    page = use_cases.list_notifications(account, limit)
    return s.NotificationsOut(items=[_notification_out(n) for n in page.items], unread=page.unread)


@router.post("/notifications/read")
def mark_notifications_read(
    use_cases: UseCases, account: ActiveAccount, body: s.MarkReadIn
) -> s.MarkReadOut:
    return s.MarkReadOut(updated=use_cases.mark_notifications_read(account, body.ids))


# --- Llamadas de n8n (token de servicio) -----------------------------------------------

internal = APIRouter(
    prefix="/api/internal", tags=["internal"], dependencies=[Depends(require_service_token)]
)


@internal.post("/notifications")
def announce(use_cases: UseCases, body: s.AnnouncementIn) -> s.CreatedOut:
    """Aviso general desde n8n (ventas actualizadas, cambios de catálogo, etc.)."""
    return s.CreatedOut(created=use_cases.announce(body.audience, body.title, body.body, body.link))


@internal.post("/notifications/projection-reminders")
def projection_reminders(use_cases: UseCases) -> s.CreatedOut:
    """Recordatorio diario (cron de n8n): a cada vendedor sin proyección para hoy."""
    return s.CreatedOut(created=use_cases.send_projection_reminders())


@internal.post("/notifications/closing-soon")
def closing_soon(use_cases: UseCases) -> s.CreatedOut:
    """Aviso previo al corte a quien aún no registró (la API ya lo revisa cada minuto)."""
    return s.CreatedOut(created=use_cases.notify_closing_soon())


@internal.post("/notifications/missed-projections")
def missed_projections(use_cases: UseCases) -> s.CreatedOut:
    """Avisos de quién no registró pasado el corte (la API ya lo revisa cada minuto)."""
    return s.CreatedOut(created=use_cases.notify_missed_projections())


# --- Hora de corte y habilitaciones de edición -----------------------------------------


def _unlock_out(u: EditUnlock) -> s.UnlockOut:
    return s.UnlockOut(
        id=u.id or 0,  # siempre viene de la base, con id
        seller=u.seller,
        date=u.date,
        reason=u.reason,
        status=u.status,
        requested_at=u.requested_at,
        decided_by=u.decided_by,
        decided_at=u.decided_at,
    )


def _cutoff_out(policy: CutoffPolicy) -> s.CutoffOut:
    return s.CutoffOut(
        cutoff_time=f"{policy.cutoff:%H:%M}",
        days_before=policy.days_before,
        open_days=policy.open_days,
        starts_in=policy.starts_in,
        enabled=policy.enabled,
    )


@router.get("/editing")
def editing_window(use_cases: UseCases, viewer: CurrentSeller) -> s.EditingWindowOut:
    """Días que se pueden registrar, hasta cuándo y si hay habilitación (pantalla Registrar)."""
    window = use_cases.editing_window(viewer)
    return s.EditingWindowOut(
        policy=_cutoff_out(window.policy),
        days=[
            s.EditingDayOut(
                date=d.date,
                closes_at=d.closes_at,
                open=d.open,
                unlock=_unlock_out(d.unlock) if d.unlock else None,
            )
            for d in window.days
        ],
    )


@router.get("/editing/unlocks")
def list_unlocks(use_cases: UseCases, viewer: CurrentSeller) -> list[s.UnlockOut]:
    return [_unlock_out(u) for u in use_cases.list_unlocks(viewer)]


@router.post("/editing/unlocks", status_code=status.HTTP_201_CREATED)
def request_unlock(
    use_cases: UseCases, seller: CurrentSeller, body: s.UnlockRequestIn
) -> s.UnlockOut:
    """El vendedor pide editar un día ya cerrado (el vendedor sale de la sesión)."""
    return _unlock_out(use_cases.request_unlock(seller, body.date, body.reason))


@editing_admin.post("/editing/unlocks/{unlock_id}")
def decide_unlock(
    use_cases: UseCases, actor: ActiveAccount, unlock_id: DbIdPath, body: s.UnlockDecisionIn
) -> s.UnlockOut:
    return _unlock_out(use_cases.decide_unlock(actor.seller, unlock_id, body.action))


@editing_admin.put("/editing/cutoff")
def update_cutoff(use_cases: UseCases, actor: ActiveAccount, body: s.CutoffIn) -> s.CutoffOut:
    return _cutoff_out(
        use_cases.update_cutoff(actor.seller, body.cutoff_time, body.days_before, body.enabled)
    )


@editing_admin.post("/editing/sellers/{username}/grant")
def grant_editing(
    use_cases: UseCases, actor: ActiveAccount, username: str, body: s.GrantEditingIn
) -> list[s.UnlockOut]:
    """El supervisor habilita la edición de un vendedor para los días elegidos."""
    return [_unlock_out(u) for u in use_cases.grant_editing(actor.seller, username, body.dates)]


@editing_admin.post("/editing/sellers/{username}/revoke")
def revoke_editing(use_cases: UseCases, actor: ActiveAccount, username: str) -> list[s.UnlockOut]:
    """El supervisor cierra las habilitaciones vigentes del vendedor."""
    return [_unlock_out(u) for u in use_cases.revoke_editing(actor.seller, username)]


# --- Stock de despacho -------------------------------------------------------------------


def _stock_out(day: DailyStock) -> s.StockDayOut:
    return s.StockDayOut(
        date=day.date,
        lines=[
            s.StockLineOut(
                product_id=line.product_id,
                units=line.units,
                kg=line.kg,
                location=line.location,
                lot_date=line.lot_date or day.date,
            )
            for line in day.lines
        ],
        total_units=day.total_units,
        total_kg=day.total_kg,
        recorded_by=day.recorded_by,
        recorded_at=day.recorded_at,
    )


@stock.get("/options")
def stock_options(use_cases: UseCases, viewer: CurrentSeller) -> s.StockOptionsOut:
    """Artículos (con calidad B) y ubicaciones para armar el formulario de stock."""
    options = use_cases.stock_options(viewer)
    return s.StockOptionsOut(
        items=[s.ProductOut(**asdict(p)) for p in options.items],
        locations=options.locations,
        lot_days=options.lot_days,
    )


@stock.get("")
def list_stock(
    use_cases: UseCases, viewer: CurrentSeller, date_from: DateFrom, date_to: DateTo
) -> list[s.StockDayOut]:
    """Stock registrado por día (solo los días con registro), del más reciente al más antiguo."""
    return [_stock_out(d) for d in use_cases.list_stock(viewer, date_from, date_to)]


@stock.put("/{day}", dependencies=[requires(Permission.MANAGE_STOCK)])
def register_stock(
    use_cases: UseCases, actor: CurrentSeller, day: date, body: s.StockIn
) -> s.StockDayOut:
    """El jefe de despacho registra (o corrige) el stock del día en una ubicación: unidades por
    producto y lote. Reemplaza lo de esa ubicación; las demás no se tocan."""
    entries = [StockEntry(line.product_id, line.units, line.lot_date) for line in body.lines]
    return _stock_out(use_cases.register_stock(actor, day, entries, body.location))


# --- Cálculo de saca ----------------------------------------------------------------------


@saca.get("")
def calculate_saca(
    use_cases: UseCases,
    viewer: CurrentSeller,
    day: Annotated[date, Query(alias="date")],
    method: Annotated[Literal["sum", "max"], Query()] = "sum",
) -> s.SacaOut:
    """Cuánto pedir a granja para el día. `method`: «sum» = proyección + pedidos confirmados −
    stock (la del negocio, por defecto); «max» = el mayor entre proyección y pedidos, menos stock.
    `groups` trae el pedido final por tipo, con su factor."""
    plan = use_cases.calculate_saca(viewer, day, method)
    totals = ("projected", "ordered", "demand", "stock", "request", "request_kg", "live_kg")
    arrival = plan.arrival
    return s.SacaOut(
        date=plan.date,
        lines=[
            s.SacaLineOut(
                product_id=line.product.id,
                projected=line.projected,
                ordered=line.ordered,
                demand=line.demand,
                stock=line.stock,
                request=line.request,
                request_kg=line.request_kg,
                expected=arrival.expected.get(line.product.id, 0) if arrival else None,
                expected_a=arrival.expected_a.get(line.product.id, 0) if arrival else None,
            )
            for line in plan.lines
        ],
        **{name: getattr(plan, name) for name in totals},
        yield_factor=plan.yield_factor,
        method=plan.method,
        farm_order=plan.farm_order,
        stock_b=plan.stock_b,
        stock_old=plan.stock_old,
        stock_lot_days=plan.stock_lot_days,
        groups=[
            s.SacaGroupOut(
                name=g.name,
                projected=g.projected,
                ordered=g.ordered,
                demand=g.demand,
                stock=g.stock,
                stock_b=g.stock_b,
                need=g.need,
                factor=g.factor,
                farm_order=g.farm_order,
            )
            for g in plan.groups
        ],
        stock_date=plan.stock_date,
        sellers_registered=plan.sellers_registered,
        sellers_total=plan.sellers_total,
        orders_available=plan.orders_available,
        forecast=s.SacaForecastOut(
            method=arrival.model,
            days=arrival.days,
            date_from=arrival.date_from,
            date_to=arrival.date_to,
        )
        if arrival
        else None,
    )


@saca.put("/factors", dependencies=[requires(Permission.MANAGE_EDITING)])
def set_saca_factors(
    use_cases: UseCases, actor: CurrentSeller, body: s.SacaFactorsIn
) -> s.SacaFactorsOut:
    """Un supervisor cambia por cuánto se multiplica lo que hace falta de cada tipo."""
    return s.SacaFactorsOut(factors=use_cases.set_saca_factors(actor, body.factors))


# --- Producción diaria --------------------------------------------------------------------


def _production_out(day: DailyProduction) -> s.ProductionDayOut:
    return s.ProductionDayOut(
        date=day.date,
        lines=[
            s.ProductionLineOut(
                product_id=line.product_id,
                ordered=line.ordered,
                produced=line.produced,
                quality_a=line.quality_a,
                quality_b=line.quality_b,
            )
            for line in day.lines
        ],
        ordered=day.ordered,
        produced=day.produced,
        quality_b=day.quality_b,
        weights=day.weights,
        recorded_by=day.recorded_by,
        recorded_at=day.recorded_at,
    )


@production.get("")
def list_production(
    use_cases: UseCases, viewer: CurrentSeller, date_from: DateFrom, date_to: DateTo
) -> list[s.ProductionDayOut]:
    """Producción registrada por día (solo los días con registro), del más reciente primero."""
    return [_production_out(d) for d in use_cases.list_production(viewer, date_from, date_to)]


def _second(pair: tuple[str, float]) -> float:
    return pair[1]


@production.get("/forecast")
def forecast_arrival(
    use_cases: UseCases,
    viewer: CurrentSeller,
    weight: Annotated[list[float] | None, Query(max_length=10)] = None,
) -> s.ArrivalForecastOut:
    """El modelo de llegada por rango, listo para proyectar, y su acierto en los últimos días.

    `weight` (repetido, en el orden de `groups`): peso promedio esperado de la parvada de cada
    tipo; 0 o ausente usa el último anotado."""
    forecast = use_cases.forecast_arrival(viewer, weight)
    fitted = forecast.fitted
    rates, checks = (fitted.rates, fitted.checks) if fitted else (None, [])
    products = [p.id for _, items in forecast.groups for p in items]
    return s.ArrivalForecastOut(
        available=rates is not None,
        method=fitted.model if fitted else "",
        candidates=[
            s.ForecastCandidateOut(name=name, error=error)
            for name, error in sorted((fitted.candidates if fitted else {}).items(), key=_second)
        ],
        weights_used=fitted.weights if fitted else {},
        min_days=MIN_HISTORY_DAYS,
        days=rates.days if rates else 0,
        date_from=rates.date_from if rates else None,
        date_to=rates.date_to if rates else None,
        groups=[
            s.ForecastGroupOut(
                name=name,
                last_ordered=forecast.last_request.get(name, 0.0),
                last_weight=forecast.last_weights.get(name),
                products=[
                    s.ForecastProductOut(
                        product_id=p.id,
                        share=round(rates.share.get(p.id, 0.0), 6) if rates else 0.0,
                        quality_a_rate=round(1 - rates.b_rate.get(p.id, 0.0), 6) if rates else 1.0,
                    )
                    for p in items
                ],
            )
            for name, items in forecast.groups
        ],
        accuracy=s.ForecastAccuracyOut(
            days=len(checks),
            error=round(overall_error(checks), 4),
            naive_error=round(overall_error(checks, naive=True), 4),
            by_day=[
                s.ForecastCheckOut(
                    date=c.date, error=round(c.error, 4), naive_error=round(c.naive_error, 4)
                )
                for c in checks
            ],
            by_product=[
                s.ForecastProductCheckOut(
                    product_id=p,
                    ordered=round(sum(c.ordered.get(p, 0.0) for c in checks), 2),
                    expected=sum(c.expected.get(p, 0) for c in checks),
                    produced=sum(c.produced.get(p, 0) for c in checks),
                )
                for p in products
            ],
        )
        if checks
        else None,
    )


@production.put("/{day}", dependencies=[requires(Permission.MANAGE_PRODUCTION)])
def register_production(
    use_cases: UseCases, actor: CurrentSeller, day: date, body: s.ProductionIn
) -> s.ProductionDayOut:
    """El jefe de despacho registra (o corrige) lo pedido a granja y lo que llegó, por producto."""
    entries = [
        ProductionEntry(line.product_id, line.ordered, line.produced, line.quality_b)
        for line in body.lines
    ]
    return _production_out(use_cases.register_production(actor, day, entries, body.weights))
