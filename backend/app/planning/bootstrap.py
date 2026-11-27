"""Raíz de composición de la planificación: el único lugar que conecta puertos con adaptadores.

Para cambiar un adaptador (otra fuente de ventas, un forecaster de ML, otro motor de base) se
toca solo este archivo.
"""

from dataclasses import dataclass
from datetime import timedelta
from functools import lru_cache
from pathlib import Path

from sqlalchemy.orm import Session

from app.core.config import Settings, get_settings
from app.planning.application import accounts as acc
from app.planning.application import aris as ar
from app.planning.application import assistant as asst
from app.planning.application import assistant_history as ah
from app.planning.application import channel_drafts as cd
from app.planning.application import channels as ch
from app.planning.application import editing as ed
from app.planning.application import export as ex
from app.planning.application import notifications as nt
from app.planning.application import production as pr
from app.planning.application import saca as sc
from app.planning.application import stock as st
from app.planning.application import use_cases as uc
from app.planning.domain.accounts import LockoutPolicy
from app.planning.domain.channels import FILE_MINUTES
from app.planning.infrastructure.aris_history import ArisHistory, ArisOrSimulatedSales
from app.planning.infrastructure.aris_import import SqlArisData
from app.planning.infrastructure.arrival_model import AdaptiveArrivalModel
from app.planning.infrastructure.assistant import N8nAssistant, load_guardrails, load_starters
from app.planning.infrastructure.assistant_tables import XlsxTableExporter
from app.planning.infrastructure.clock import ZoneClock
from app.planning.infrastructure.demand_model.store import SqlDemandModelStore
from app.planning.infrastructure.events import event_bus
from app.planning.infrastructure.forecast import (
    OrderHistoryForecaster,
    TeamHistoryForecaster,
    WeekdayAverageForecaster,
)
from app.planning.infrastructure.orders import LoadedOrders, LoadedStoreOrders
from app.planning.infrastructure.persistence.assistant import (
    SqlChannelLinkRepository,
    SqlConversationRepository,
    SqlDraftRepository,
)
from app.planning.infrastructure.persistence.cached import (
    CachedProductRepository,
    CachedSellerRepository,
    CachedSettingsRepository,
)
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
from app.planning.infrastructure.persistence.saca_snapshots import SqlSacaSnapshotRepository
from app.planning.infrastructure.persistence.status import SqlStatusProbe
from app.planning.infrastructure.persistence.stock import SqlStockRepository
from app.planning.infrastructure.sales import SimulatedSalesSource
from app.planning.infrastructure.security import (
    AssistantTickets,
    ChannelFileTokens,
    JwtTokenService,
    RandomTemporaryPasswords,
    ScryptPasswordHasher,
)
from app.shared.infrastructure.cache import build_cache
from app.shared.infrastructure.database.engine import physical_schema
from app.shared.infrastructure.database.metadata import APP_SCHEMA
from app.shared.infrastructure.mcp.limits import RateLimiter, build_rate_limiter

# Una sola caché por proceso, compartida por todas las peticiones: en memoria o en Redis según
# CACHE_BACKEND (ver shared/infrastructure/cache.py y ADR 0014).
planning_cache = build_cache(**get_settings().cache_options())


@lru_cache
def _assistant_limiter(limit: int, window: int, backend: str, redis_url: str | None) -> RateLimiter:
    """Un límite por proceso (o global con Redis) para las preguntas al asistente."""
    namespace = get_settings().cache_options()["namespace"] + "assistant:"
    return build_rate_limiter(backend, limit, window, redis_url, namespace)


@lru_cache
def _assistant_starters(config_dir: Path) -> asst.AssistantStarters:
    return asst.AssistantStarters(load_starters(config_dir))


@lru_cache
def _assistant_guardrails(config_dir: Path) -> tuple:
    return tuple(load_guardrails(config_dir))


def _assistant(
    settings: Settings, history: SqlConversationRepository, clock: ZoneClock
) -> asst.AskAssistant:
    gateway = (
        N8nAssistant(
            settings.assistant_webhook_url,
            settings.assistant_webhook_token or "",
            settings.assistant_timeout_seconds,
        )
        if settings.assistant_webhook_url
        else None
    )
    limiter = _assistant_limiter(
        settings.assistant_rate_limit,
        settings.assistant_rate_window_seconds,
        settings.cache_backend,
        settings.redis_url,
    )
    tickets = AssistantTickets(settings.auth_secret, settings.assistant_ticket_minutes)
    return asst.AskAssistant(
        gateway,
        tickets,
        limiter.allow,
        _assistant_starters(settings.config_dir),
        _assistant_guardrails(settings.config_dir),
        history,
        clock,
    )


@dataclass(frozen=True)
class PlanningUseCases:
    authenticate: acc.Authenticate
    current_account: acc.CurrentAccount
    change_password: acc.ChangePassword
    update_profile: acc.UpdateProfile
    get_preferences: acc.GetPreferences
    save_preferences: acc.SavePreferences
    list_accounts: acc.ListAccounts
    create_account: acc.CreateAccount
    reset_password: acc.ResetPassword
    set_account_active: acc.SetAccountActive
    edit_account: acc.EditAccount
    change_role: acc.ChangeRole
    get_catalog: uc.GetCatalog
    list_sellers: uc.ListSellers
    list_projections: uc.ListProjections
    submit_projection: uc.SubmitProjection
    get_sales: uc.GetSales
    model_projections: uc.ModelProjections
    store_orders: uc.GetStoreOrders
    model_summary: uc.GetModelSummary
    aris_status: ar.GetArisStatus
    import_aris: ar.ImportArisData
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
    stock_options: st.GetStockOptions
    calculate_saca: sc.CalculateSaca
    saca_history: sc.SacaHistory
    set_saca_plus: sc.SetSacaPlus
    register_production: pr.RegisterProduction
    list_production: pr.ListProduction
    forecast_arrival: pr.ForecastArrival
    ask_assistant: asst.AskAssistant
    assistant_history: ah.AssistantHistory
    purge_assistant: ah.PurgeAssistantData
    create_link_code: ch.CreateLinkCode
    channel_assistant: ch.ChannelAssistant
    # Cuenta dueña de un pase del asistente (lo usa el MCP cuando consulta el agente de n8n).
    ticket_account: acc.CurrentAccount


def build_use_cases(session: Session, settings: Settings) -> PlanningUseCases:
    products = CachedProductRepository(SqlProductRepository(session), planning_cache)
    sellers = CachedSellerRepository(SqlSellerRepository(session), planning_cache)
    projections = SqlProjectionRepository(session)
    clock = ZoneClock(settings.tz)
    tokens = JwtTokenService(settings.auth_secret, settings.auth_token_ttl_hours)
    hasher, passwords = ScryptPasswordHasher(), RandomTemporaryPasswords()
    lockout = LockoutPolicy(settings.login_max_attempts, settings.login_lock_minutes)
    notifications = SqlNotificationRepository(session)
    notifier = nt.Notifier(notifications, event_bus, clock)
    arrival_model = AdaptiveArrivalModel()
    order_history = SqlOrderHistory(session)
    forecaster = OrderHistoryForecaster(
        order_history,
        products,
        WeekdayAverageForecaster(projections, settings.planning_suggestion_weeks),
    )
    schema = physical_schema(settings.database_url, APP_SCHEMA, settings.db_schema)
    unlocks = SqlUnlockRepository(session)
    history = SqlChangeLog(session)
    stock = SqlStockRepository(session)
    production = SqlProductionRepository(session)
    # Venta real e historia de proyecciones desde ARIS (cli historia); sin ARIS, la simulada.
    aris = ArisHistory(session, products, sellers)
    sales = ArisOrSimulatedSales(aris, SimulatedSalesSource(projections, clock))
    stored_settings = CachedSettingsRepository(SqlSettingsRepository(session), planning_cache)
    saca_plus = sc.SacaPlus(stored_settings, settings.saca_group_plus)
    editing = ed.EditingSettings(
        stored_settings,
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
    conversations = SqlConversationRepository(session)
    channel_links = SqlChannelLinkRepository(session)
    draft_repo = SqlDraftRepository(session)
    ask_assistant = _assistant(settings, conversations, clock)
    submit_projection = uc.SubmitProjection(
        products,
        projections,
        clock,
        settings.planning_max_days,
        on_submitted=nt.NotifyProjectionSubmitted(sellers, notifier, event_bus),
        rules=ed.EditingRules(editing, unlocks),
        projected=frozenset(settings.planning_projected_categories),
        projected_products=frozenset(settings.planning_projected_products),
        history=history,
    )
    register_stock = st.RegisterStock(products, stock, clock, settings.stock_locations)
    editing_window = ed.GetEditingWindow(editing, unlocks, clock)
    assistant_history = ah.AssistantHistory(conversations, XlsxTableExporter(), clock)
    channel_drafts = cd.ChannelDrafts(
        products, draft_repo, submit_projection, register_stock, editing_window, clock
    )
    return PlanningUseCases(
        authenticate=acc.Authenticate(sellers, hasher, tokens, clock, lockout),
        current_account=acc.CurrentAccount(sellers, tokens),
        change_password=acc.ChangePassword(sellers, hasher, tokens),
        update_profile=acc.UpdateProfile(sellers),
        get_preferences=acc.GetPreferences(sellers),
        save_preferences=acc.SavePreferences(sellers),
        list_accounts=acc.ListAccounts(sellers),
        create_account=acc.CreateAccount(sellers, hasher, passwords),
        reset_password=acc.ResetPassword(sellers, hasher, passwords, event_bus, channel_links),
        set_account_active=acc.SetAccountActive(sellers, event_bus, channel_links),
        edit_account=acc.EditAccount(sellers, event_bus),
        change_role=acc.ChangeRole(sellers, event_bus, notifications),
        get_catalog=uc.GetCatalog(products),
        list_sellers=uc.ListSellers(sellers),
        list_projections=uc.ListProjections(projections, aris),
        submit_projection=submit_projection,
        get_sales=uc.GetSales(sales),
        model_projections=uc.ModelProjections(
            sellers, order_history, products, SqlDemandModelStore(session)
        ),
        store_orders=uc.GetStoreOrders(
            LoadedStoreOrders(session), sellers, products, settings.store_zone_aliases
        ),
        model_summary=uc.GetModelSummary(SqlDemandModelStore(session)),
        aris_status=ar.GetArisStatus(
            SqlArisData(session), SqlDemandModelStore(session), clock, settings.aris_warn_days
        ),
        import_aris=ar.ImportArisData(SqlArisData(session), SqlDemandModelStore(session)),
        export_projections=ex.ExportProjections(products, projections, sales, sellers, clock),
        list_changes=uc.ListChanges(history),
        suggest_projection=uc.SuggestProjection(
            products,
            forecaster,
            settings.planning_max_days,
            SqlDemandModelStore(session),
            general=TeamHistoryForecaster(order_history, products),
        ),
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
        editing_window=editing_window,
        request_unlock=ed.RequestUnlock(editing, unlocks, sellers, notifier, event_bus, clock),
        list_unlocks=ed.ListUnlocks(unlocks, clock),
        decide_unlock=ed.DecideUnlock(unlocks, sellers, notifier, event_bus, clock),
        update_cutoff=ed.UpdateCutoff(editing, event_bus, clock),
        grant_editing=ed.GrantEditing(editing, unlocks, sellers, notifier, event_bus, clock),
        revoke_editing=ed.RevokeEditing(unlocks, sellers, notifier, event_bus, clock),
        register_stock=register_stock,
        list_stock=st.ListStock(stock),
        stock_options=st.GetStockOptions(
            products, settings.stock_locations, settings.saca_stock_lot_days
        ),
        calculate_saca=sc.CalculateSaca(
            products,
            projections,
            stock,
            LoadedOrders(session, products, settings.demand_extra_materials),
            sellers,
            settings.yield_factor,
            production,
            arrival_model,
            saca_plus,
            settings.saca_stock_lot_days,
        ),
        set_saca_plus=sc.SetSacaPlus(products, stored_settings, clock),
        saca_history=sc.SacaHistory(SqlSacaSnapshotRepository(session), clock),
        register_production=pr.RegisterProduction(products, production, clock),
        list_production=pr.ListProduction(production),
        forecast_arrival=pr.ForecastArrival(products, production, clock, arrival_model),
        ask_assistant=ask_assistant,
        assistant_history=assistant_history,
        purge_assistant=ah.PurgeAssistantData(
            conversations, channel_links, draft_repo, clock, settings.assistant_history_days
        ),
        create_link_code=ch.CreateLinkCode(channel_links, clock),
        channel_assistant=ch.ChannelAssistant(
            sellers,
            channel_links,
            conversations,
            ask_assistant,
            assistant_history,
            channel_drafts,
            ChannelFileTokens(settings.auth_secret, FILE_MINUTES),
            clock,
            settings.assistant_channel_idle_hours,
            frozenset(r.strip() for r in settings.aris_channel_roles.split(",") if r.strip()),
        ),
        ticket_account=acc.CurrentAccount(
            sellers, AssistantTickets(settings.auth_secret, settings.assistant_ticket_minutes)
        ),
    )
