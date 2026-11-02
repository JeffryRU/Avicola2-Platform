"""Raíz de composición de la planificación: el único lugar que conecta puertos con adaptadores.

Para cambiar un adaptador (otra fuente de ventas, un forecaster de ML, otro motor de base) se
toca solo este archivo.
"""

from dataclasses import dataclass

from sqlalchemy.orm import Session

from app.core.config import Settings
from app.planning.application import use_cases as uc
from app.planning.infrastructure.clock import ZoneClock
from app.planning.infrastructure.forecast import WeekdayAverageForecaster
from app.planning.infrastructure.persistence.repositories import (
    SqlProductRepository,
    SqlProjectionRepository,
    SqlSellerRepository,
)
from app.planning.infrastructure.persistence.status import SqlStatusProbe
from app.planning.infrastructure.sales import SimulatedSalesSource
from app.planning.infrastructure.security import JwtTokenService, ScryptPasswordHasher
from app.shared.infrastructure.database.engine import physical_schema
from app.shared.infrastructure.database.metadata import APP_SCHEMA


@dataclass(frozen=True)
class PlanningUseCases:
    authenticate: uc.Authenticate
    current_seller: uc.CurrentSeller
    get_catalog: uc.GetCatalog
    list_sellers: uc.ListSellers
    list_projections: uc.ListProjections
    submit_projection: uc.SubmitProjection
    get_sales: uc.GetSales
    suggest_projection: uc.SuggestProjection
    status: SqlStatusProbe


def build_use_cases(session: Session, settings: Settings) -> PlanningUseCases:
    products = SqlProductRepository(session)
    sellers = SqlSellerRepository(session)
    projections = SqlProjectionRepository(session)
    clock = ZoneClock(settings.tz)
    tokens = JwtTokenService(settings.auth_secret, settings.auth_token_ttl_hours)
    forecaster = WeekdayAverageForecaster(projections, settings.planning_suggestion_weeks)
    schema = physical_schema(settings.database_url, APP_SCHEMA, settings.db_schema)
    return PlanningUseCases(
        authenticate=uc.Authenticate(sellers, ScryptPasswordHasher(), tokens),
        current_seller=uc.CurrentSeller(sellers, tokens),
        get_catalog=uc.GetCatalog(products),
        list_sellers=uc.ListSellers(sellers),
        list_projections=uc.ListProjections(projections),
        submit_projection=uc.SubmitProjection(
            products, projections, clock, settings.planning_max_days
        ),
        get_sales=uc.GetSales(SimulatedSalesSource(projections, clock)),
        suggest_projection=uc.SuggestProjection(products, forecaster, settings.planning_max_days),
        status=SqlStatusProbe(session, schema),
    )
