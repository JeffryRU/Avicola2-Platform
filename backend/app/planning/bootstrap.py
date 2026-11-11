"""Raíz de composición de la planificación: el único lugar que conecta puertos con adaptadores.

Para cambiar un adaptador (otra fuente de ventas, un forecaster de ML, otro motor de base) se
toca solo este archivo.
"""

from dataclasses import dataclass
from datetime import timedelta

from sqlalchemy.orm import Session

from app.core.config import Settings
from app.planning.application import accounts as acc
from app.planning.application import editing as ed
from app.planning.application import export as ex
from app.planning.application import notifications as nt
from app.planning.application import production as pr
from app.planning.application import saca as sc
from app.planning.application import stock as st
from app.planning.application import use_cases as uc
from app.planning.domain.accounts import LockoutPolicy
from app.planning.infrastructure.clock import ZoneClock
from app.planning.infrastructure.events import event_bus
from app.planning.infrastructure.forecast import OrderHistoryForecaster, WeekdayAverageForecaster
from app.planning.infrastructure.orders import NoConfirmedOrders
from app.planning.infrastructure.persistence.editing import (
    SqlSettingsRepository,
    SqlUnlockRepository,
)
from app.planning.infrastructure.persistence.history import SqlChangeLog
from app.planning.infrastructure.persistence.notifications import SqlNotificationRepository
from app.planning.infrastructure.persistence.order_history import SqlOrderHistory
from app.planning.infrastructure.persistence.production import SqlProductionRepository
from app.planning.infrastructure.persistence.repositories import (
    SqlProductRepository,
    SqlProjectionRepository,
    SqlSellerRepository,
)
from app.planning.infrastructure.persistence.status import SqlStatusProbe
from app.planning.infrastructure.persistence.stock import SqlStockRepository
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
    update_profile: acc.UpdateProfile
    list_accounts: acc.ListAccounts
    create_account: acc.CreateAccount
    reset_password: acc.ResetPassword
    set_account_active: acc.SetAccountActive
    change_role: acc.ChangeRole
    get_catalog: uc.GetCatalog
    list_sellers: uc.ListSellers
    list_projections: uc.ListProjections
    submit_projection: uc.SubmitProjection
    get_sales: uc.GetSales
    export_projections: ex.ExportProjections
    list_changes: uc.ListChanges
    suggest_projection: uc.SuggestProjection
    status: SqlStatusProbe
    list_notifications: nt.ListNotifications
    mark_notifications_read: nt.MarkNotificationsRead
    send_projection_reminders: nt.SendProjectionReminders
    notify_missed_projections: nt.NotifyMissedProjections
    notify_closing_soon: nt.NotifyClosingSoon
    announce: nt.Announce
    editing_window: ed.GetEditingWindow
    request_unlock: ed.RequestUnlock
    list_unlocks: ed.ListUnlocks
    decide_unlock: ed.DecideUnlock
    update_cutoff: ed.UpdateCutoff
    grant_editing: ed.GrantEditing
    revoke_editing: ed.RevokeEditing
    register_stock: st.RegisterStock
    list_stock: st.ListStock
    calculate_saca: sc.CalculateSaca
    register_production: pr.RegisterProduction
    list_production: pr.ListProduction
    forecast_arrival: pr.ForecastArrival


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
    forecaster = OrderHistoryForecaster(
        SqlOrderHistory(session),
        products,
        WeekdayAverageForecaster(projections, settings.planning_suggestion_weeks),
    )
    schema = physical_schema(settings.database_url, APP_SCHEMA, settings.db_schema)
    unlocks = SqlUnlockRepository(session)
    history = SqlChangeLog(session)
    stock = SqlStockRepository(session)
    production = SqlProductionRepository(session)
    sales = SimulatedSalesSource(projections, clock)
    editing = ed.EditingSettings(
        SqlSettingsRepository(session),
        settings.planning_cutoff_time,
        settings.planning_cutoff_days_before,
        settings.planning_max_days,
        settings.planning_starts_in_days,
        settings.planning_cutoff_enabled,
    )
    # Al aviso previo se le suma el intervalo de revisión: así sale con AL MENOS los minutos
    # configurados de anticipación aunque la revisión caiga justo después de entrar en ventana.
    minutes = settings.planning_closing_reminder_minutes
    closing_lead = timedelta(
        minutes=minutes, seconds=settings.planning_scheduler_seconds if minutes else 0
    )
    return PlanningUseCases(
        authenticate=acc.Authenticate(sellers, hasher, tokens, clock, lockout),
        current_account=acc.CurrentAccount(sellers, tokens),
        change_password=acc.ChangePassword(sellers, hasher, tokens),
        update_profile=acc.UpdateProfile(sellers),
        list_accounts=acc.ListAccounts(sellers),
        create_account=acc.CreateAccount(sellers, hasher, passwords),
        reset_password=acc.ResetPassword(sellers, hasher, passwords, event_bus),
        set_account_active=acc.SetAccountActive(sellers, event_bus),
        change_role=acc.ChangeRole(sellers, event_bus, notifications),
        get_catalog=uc.GetCatalog(products),
        list_sellers=uc.ListSellers(sellers),
        list_projections=uc.ListProjections(projections),
        submit_projection=uc.SubmitProjection(
            products,
            projections,
            clock,
            settings.planning_max_days,
            on_submitted=nt.NotifyProjectionSubmitted(sellers, notifier, event_bus),
            rules=ed.EditingRules(editing, unlocks),
            sellers=sellers,
            history=history,
        ),
        get_sales=uc.GetSales(sales),
        export_projections=ex.ExportProjections(products, projections, sales, sellers, clock),
        list_changes=uc.ListChanges(history),
        suggest_projection=uc.SuggestProjection(products, forecaster, settings.planning_max_days),
        status=SqlStatusProbe(session, schema),
        list_notifications=nt.ListNotifications(notifications),
        mark_notifications_read=nt.MarkNotificationsRead(notifications, clock),
        send_projection_reminders=nt.SendProjectionReminders(
            sellers, projections, notifier, clock, editing.policy
        ),
        notify_missed_projections=nt.NotifyMissedProjections(
            sellers, projections, unlocks, notifier, clock, editing.policy
        ),
        notify_closing_soon=nt.NotifyClosingSoon(
            sellers, projections, notifier, clock, editing.policy, closing_lead
        ),
        announce=nt.Announce(sellers, notifier),
        editing_window=ed.GetEditingWindow(editing, unlocks, clock),
        request_unlock=ed.RequestUnlock(editing, unlocks, sellers, notifier, event_bus, clock),
        list_unlocks=ed.ListUnlocks(unlocks, clock),
        decide_unlock=ed.DecideUnlock(unlocks, sellers, notifier, event_bus, clock),
        update_cutoff=ed.UpdateCutoff(editing, event_bus, clock),
        grant_editing=ed.GrantEditing(editing, unlocks, sellers, notifier, event_bus, clock),
        revoke_editing=ed.RevokeEditing(unlocks, sellers, notifier, event_bus, clock),
        register_stock=st.RegisterStock(products, stock, clock),
        list_stock=st.ListStock(stock),
        calculate_saca=sc.CalculateSaca(
            products,
            projections,
            stock,
            NoConfirmedOrders(),
            sellers,
            settings.yield_factor,
            production,
        ),
        register_production=pr.RegisterProduction(products, production, clock),
        list_production=pr.ListProduction(production),
        forecast_arrival=pr.ForecastArrival(products, production, clock),
    )
