"""API HTTP de la planificación de demanda (adaptador de entrada de FastAPI)."""

from dataclasses import asdict
from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, Query, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.planning.application.use_cases import DayUnits
from app.planning.bootstrap import PlanningUseCases, build_use_cases
from app.planning.domain.models import Projection, Seller
from app.planning.infrastructure.http import schemas as s
from app.shared.domain.errors import AuthenticationError
from app.shared.infrastructure.database.session import get_session


def get_use_cases(session: Annotated[Session, Depends(get_session)]) -> PlanningUseCases:
    return build_use_cases(session, get_settings())


UseCases = Annotated[PlanningUseCases, Depends(get_use_cases)]
_bearer = HTTPBearer(auto_error=False)


def current_seller(
    use_cases: UseCases,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
) -> Seller:
    if credentials is None:
        raise AuthenticationError("Inicia sesión para continuar.")
    return use_cases.current_seller(credentials.credentials)


CurrentSeller = Annotated[Seller, Depends(current_seller)]
public = APIRouter(prefix="/api", tags=["planning"])
router = APIRouter(prefix="/api", tags=["planning"], dependencies=[Depends(current_seller)])


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


@public.get("/status")
def api_status(use_cases: UseCases) -> s.StatusOut:
    """Conexión con la base y existencia de las tablas (pantalla Conexión)."""
    return use_cases.status.status()


@public.post("/auth/login")
def login(use_cases: UseCases, body: s.LoginIn) -> s.LoginOut:
    session = use_cases.authenticate(body.username, body.password)
    return s.LoginOut(token=session.token, seller=s.SellerOut(**asdict(session.seller)))


@router.get("/auth/me")
def me(seller: CurrentSeller) -> s.SellerOut:
    return s.SellerOut(**asdict(seller))


@router.get("/catalog")
def catalog(use_cases: UseCases) -> list[s.ProductOut]:
    return [s.ProductOut(**asdict(p)) for p in use_cases.get_catalog()]


@router.get("/sellers")
def sellers(use_cases: UseCases) -> list[s.SellerOut]:
    return [s.SellerOut(**asdict(v)) for v in use_cases.list_sellers()]


DateFrom = Annotated[date, Query()]
DateTo = Annotated[date, Query()]
SellerFilter = Annotated[str | None, Query(max_length=50)]


@router.get("/projections")
def list_projections(
    use_cases: UseCases, date_from: DateFrom, date_to: DateTo, seller: SellerFilter = None
) -> list[s.ProjectionOut]:
    return [_projection_out(p) for p in use_cases.list_projections(date_from, date_to, seller)]


@router.post("/projections", status_code=status.HTTP_201_CREATED)
def submit_projection(
    use_cases: UseCases, seller: CurrentSeller, body: s.SubmissionIn
) -> s.SubmissionOut:
    """El vendedor sale del token, nunca del cuerpo de la petición."""
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
    use_cases: UseCases, date_from: DateFrom, date_to: DateTo, seller: SellerFilter = None
) -> list[s.DailyUnitsOut]:
    return [s.DailyUnitsOut(**asdict(d)) for d in use_cases.get_sales(date_from, date_to, seller)]


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
