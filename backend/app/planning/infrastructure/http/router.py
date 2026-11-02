"""API HTTP de la planificación de demanda (adaptador de entrada de FastAPI).

La sesión viaja en una cookie HttpOnly (`nv_session`): el JavaScript de la página no puede
leer el token, y no aparece en el cuerpo de ninguna respuesta ni en el almacenamiento local.
"""

from dataclasses import asdict
from datetime import date
from typing import Annotated

from fastapi import APIRouter, Cookie, Depends, Query, Response, status
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.planning.application.accounts import Session as AuthSession
from app.planning.application.use_cases import DayUnits
from app.planning.bootstrap import PlanningUseCases, build_use_cases
from app.planning.domain.models import Projection, Seller, SellerAccount
from app.planning.infrastructure.http import schemas as s
from app.shared.domain.errors import AuthenticationError, ForbiddenError
from app.shared.infrastructure.database.session import get_session

SESSION_COOKIE = "nv_session"
COOKIE_PATH = "/api"


def get_use_cases(session: Annotated[Session, Depends(get_session)]) -> PlanningUseCases:
    return build_use_cases(session, get_settings())


UseCases = Annotated[PlanningUseCases, Depends(get_use_cases)]
SessionToken = Annotated[str | None, Cookie(alias=SESSION_COOKIE)]


def current_account(use_cases: UseCases, token: SessionToken = None) -> SellerAccount:
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

public = APIRouter(prefix="/api", tags=["planning"])
router = APIRouter(prefix="/api", tags=["planning"], dependencies=[Depends(active_account)])
admin = APIRouter(prefix="/api/admin", tags=["admin"], dependencies=[Depends(active_account)])


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
    return s.AccountOut(
        seller=s.SellerOut(**asdict(account.seller)),
        must_change_password=account.must_change_password,
    )


def _admin_out(account: SellerAccount) -> s.AdminAccountOut:
    return s.AdminAccountOut(
        **asdict(account.seller),
        is_active=account.is_active,
        must_change_password=account.must_change_password,
        locked_until=account.locked_until,
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
    )


# --- Sesión ----------------------------------------------------------------------------


@public.post("/auth/login")
def login(use_cases: UseCases, body: s.LoginIn, response: Response) -> s.AccountOut:
    session = use_cases.authenticate(body.username, body.password)
    return _login_response(response, session, body.remember)


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
        seller, body.category, [DayUnits(d.date, d.units) for d in body.days], body.submission_id
    )
    return s.SubmissionOut(
        submission_id=saved[0].submission_id,
        days=len(saved),
        total_units=sum(p.total_units for p in saved),
        total_kg=round(sum(p.total_kg for p in saved), 2),
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
) -> s.SuggestionOut:
    result = use_cases.suggest_projection(seller, category, start, days)
    method = use_cases.suggest_projection.forecaster.name
    return s.SuggestionOut(method=method, days=[s.DailyUnitsOut(**asdict(d)) for d in result])


# --- Administración de cuentas (supervisor) --------------------------------------------


@admin.get("/accounts")
def list_accounts(use_cases: UseCases, actor: ActiveAccount) -> list[s.AdminAccountOut]:
    return [_admin_out(a) for a in use_cases.list_accounts(actor)]


@admin.post("/accounts", status_code=status.HTTP_201_CREATED)
def create_account(
    use_cases: UseCases, actor: ActiveAccount, body: s.CreateAccountIn
) -> s.NewCredentialsOut:
    created = use_cases.create_account(actor, body.username, body.name, body.zone, body.role)
    return s.NewCredentialsOut(
        account=_admin_out(created.account), temporary_password=created.temporary_password
    )


@admin.post("/accounts/{username}/reset-password")
def reset_password(use_cases: UseCases, actor: ActiveAccount, username: str) -> s.NewCredentialsOut:
    """Recuperación de contraseña: genera una temporal que el vendedor cambia al entrar."""
    reset = use_cases.reset_password(actor, username)
    return s.NewCredentialsOut(
        account=_admin_out(reset.account), temporary_password=reset.temporary_password
    )


@admin.patch("/accounts/{username}")
def set_active(
    use_cases: UseCases, actor: ActiveAccount, username: str, body: s.SetActiveIn
) -> s.AdminAccountOut:
    return _admin_out(use_cases.set_account_active(actor, username, body.active))
