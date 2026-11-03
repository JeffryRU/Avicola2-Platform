"""Raíz de composición de la planificación: el único lugar que conecta puertos con adaptadores.

Para cambiar un adaptador (otra fuente de ventas, un forecaster de ML, otro motor de base) se
toca solo este archivo.
"""

from dataclasses import dataclass

from sqlalchemy.orm import Session

from app.core.config import Settings
from app.planning.application import accounts as acc
from app.planning.application import notifications as nt
from app.planning.application import use_cases as uc
from app.planning.domain.accounts import LockoutPolicy
from app.planning.infrastructure.clock import ZoneClock
from app.planning.infrastructure.events import event_bus
from app.planning.infrastructure.forecast import WeekdayAverageForecaster
from app.planning.infrastructure.persistence.notifications import SqlNotificationRepository
from app.planning.infrastructure.persistence.repositories import (
    SqlProductRepository,
    SqlProjectionRepository,
    SqlSellerRepository,
)
from app.planning.infrastructure.persistence.status import SqlStatusProbe
from app.planning.infrastructure.sales import SimulatedSalesSource
from app.planning.infrastructure.security import (
    JwtTokenService,
    RandomTemporaryPasswords,
    ScryptPasswordHasher,
)
from app.shared.infrastructure.database.engine import physical_schema
from app.shared.infrastructure.database.metadata import APP_SCHEMA


@dataclass(frozen=True)
class PlanningUseCases:
    authenticate: acc.Authenticate
    current_account: acc.CurrentAccount
    change_password: acc.ChangePassword
    list_accounts: acc.ListAccounts
    create_account: acc.CreateAccount
    reset_password: acc.ResetPassword
    set_account_active: acc.SetAccountActive
    get_catalog: uc.GetCatalog
    list_sellers: uc.ListSellers
    list_projections: uc.ListProjections
    submit_projection: uc.SubmitProjection
    get_sales: uc.GetSales
    suggest_projection: uc.SuggestProjection
    status: SqlStatusProbe
    list_notifications: nt.ListNotifications
    mark_notifications_read: nt.MarkNotificationsRead
    send_projection_reminders: nt.SendProjectionReminders
    announce: nt.Announce


def build_use_cases(session: Session, settings: Settings) -> PlanningUseCases:
    products = SqlProductRepository(session)
    sellers = SqlSellerRepository(session)
    projections = SqlProjectionRepository(session)
    clock = ZoneClock(settings.tz)
    tokens = JwtTokenService(settings.auth_secret, settings.auth_token_ttl_hours)
    hasher, passwords = ScryptPasswordHasher(), RandomTemporaryPasswords()
    lockout = LockoutPolicy(settings.login_max_attempts, settings.login_lock_minutes)
    notifications = SqlNotificationRepository(session)
    notifier = nt.Notifier(notifications, event_bus, clock)
    forecaster = WeekdayAverageForecaster(projections, settings.planning_suggestion_weeks)
    schema = physical_schema(settings.database_url, APP_SCHEMA, settings.db_schema)
    return PlanningUseCases(
        authenticate=acc.Authenticate(sellers, hasher, tokens, clock, lockout),
        current_account=acc.CurrentAccount(sellers, tokens),
        change_password=acc.ChangePassword(sellers, hasher, tokens),
        list_accounts=acc.ListAccounts(sellers),
        create_account=acc.CreateAccount(sellers, hasher, passwords),
        reset_password=acc.ResetPassword(sellers, hasher, passwords, event_bus),
        set_account_active=acc.SetAccountActive(sellers, event_bus),
        get_catalog=uc.GetCatalog(products),
        list_sellers=uc.ListSellers(sellers),
        list_projections=uc.ListProjections(projections),
        submit_projection=uc.SubmitProjection(
            products,
            projections,
            clock,
            settings.planning_max_days,
            on_submitted=nt.NotifyProjectionSubmitted(sellers, notifier, event_bus),
        ),
        get_sales=uc.GetSales(SimulatedSalesSource(projections, clock)),
        suggest_projection=uc.SuggestProjection(products, forecaster, settings.planning_max_days),
        status=SqlStatusProbe(session, schema),
        list_notifications=nt.ListNotifications(notifications),
        mark_notifications_read=nt.MarkNotificationsRead(notifications, clock),
        send_projection_reminders=nt.SendProjectionReminders(sellers, projections, notifier, clock),
        announce=nt.Announce(sellers, notifier),
    )
