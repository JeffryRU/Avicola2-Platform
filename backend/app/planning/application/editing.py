"""Casos de uso de la hora de corte y las habilitaciones de edición."""

import logging
from dataclasses import dataclass
from datetime import date, datetime, timedelta

from app.planning.application.notifications import Notifier
from app.planning.application.ports import (
    Clock,
    EventPublisher,
    SellerRepository,
    SettingsRepository,
    UnlockRepository,
)
from app.planning.domain.editing import (
    APPROVED,
    REQUESTED,
    CutoffPolicy,
    EditUnlock,
    clean_reason,
    parse_cutoff,
)
from app.planning.domain.models import SUPERVISOR, Seller
from app.planning.domain.notifications import (
    EDIT_DECIDED,
    EDIT_REQUESTED,
    EDITING_CHANGED,
    Audience,
    Event,
)
from app.shared.domain.errors import ConflictError, DomainError, ForbiddenError, NotFoundError

logger = logging.getLogger(__name__)

CUTOFF_TIME_KEY = "cutoff_time"
CUTOFF_DAYS_BEFORE_KEY = "cutoff_days_before"
CUTOFF_ENABLED_KEY = "cutoff_enabled"
# Cuántos días atrás se listan las solicitudes.
HISTORY_DAYS = 30
UNLOCKS_LINK = "/habilitaciones"
DECIDED_TITLE = {
    "approve": "Edición habilitada",
    "reject": "Solicitud rechazada",
    "close": "Edición cerrada",
}


def _require_supervisor(actor: Seller) -> None:
    if not actor.is_supervisor:
        raise ForbiddenError("Solo un supervisor puede hacer esto.")


class EditingSettings:
    """La política vigente: lo guardado por el supervisor o, si no hay nada, lo de `.env`."""

    def __init__(
        self,
        settings: SettingsRepository,
        default_cutoff: str,
        default_days_before: int,
        open_days: int,
        starts_in: int = 0,
        default_enabled: bool = True,
    ):
        self.settings = settings
        self.default_cutoff, self.default_days_before = default_cutoff, default_days_before
        self.open_days, self.starts_in, self.default_enabled = open_days, starts_in, default_enabled

    def policy(self) -> CutoffPolicy:
        cutoff = self.settings.get(CUTOFF_TIME_KEY) or self.default_cutoff
        days_before = self.settings.get(CUTOFF_DAYS_BEFORE_KEY)
        enabled = self.settings.get(CUTOFF_ENABLED_KEY)
        return CutoffPolicy(
            parse_cutoff(cutoff),
            int(days_before) if days_before is not None else self.default_days_before,
            self.open_days,
            self.starts_in,
            enabled == "1" if enabled is not None else self.default_enabled,
        )

    def save(
        self, cutoff: str, days_before: int, enabled: bool, by: str, at: datetime
    ) -> CutoffPolicy:
        policy = CutoffPolicy(  # valida
            parse_cutoff(cutoff), days_before, self.open_days, self.starts_in, enabled
        )
        self.settings.set(CUTOFF_TIME_KEY, f"{policy.cutoff:%H:%M}", by, at)
        self.settings.set(CUTOFF_DAYS_BEFORE_KEY, str(policy.days_before), by, at)
        self.settings.set(CUTOFF_ENABLED_KEY, "1" if policy.enabled else "0", by, at)
        return policy


class EditingRules:
    """Qué días puede guardar un vendedor ahora (lo usa SubmitProjection)."""

    def __init__(self, settings: EditingSettings, unlocks: UnlockRepository):
        self.settings, self.unlocks = settings, unlocks

    def check(self, seller: Seller, day: date, today: date, now: datetime) -> bool:
        """Lanza un error si no se puede guardar; devuelve True si es pasada la hora de corte."""
        policy = self.settings.policy()
        first, last = policy.first_day(today), policy.last_day(today)
        if day > last:
            raise DomainError(f"Solo puedes registrar hasta el {last:%d/%m/%Y}.")
        if day < first and not seller.is_supervisor:
            # Las proyecciones son de los días siguientes; el supervisor puede corregir hoy.
            raise DomainError(f"Las proyecciones se registran desde el {first:%d/%m/%Y}.")
        if day >= first and policy.is_open(day, now):
            return False
        if seller.is_supervisor:
            return True
        unlock = self.unlocks.latest(seller.username, day)
        if unlock and unlock.is_open:
            return True
        closes = policy.closes_at(day, now.tzinfo)
        raise ForbiddenError(
            f"La edición del {day:%d/%m/%Y} cerró el {closes:%d/%m} a las {closes:%H:%M}. "
            "Pide una habilitación al supervisor."
        )


@dataclass(frozen=True)
class DayWindow:
    date: date
    closes_at: datetime
    open: bool
    unlock: EditUnlock | None


@dataclass(frozen=True)
class EditingWindow:
    policy: CutoffPolicy
    days: list[DayWindow]


class GetEditingWindow:
    """Los días que el vendedor puede registrar, hasta cuándo, y si tiene habilitación."""

    def __init__(self, settings: EditingSettings, unlocks: UnlockRepository, clock: Clock):
        self.settings, self.unlocks, self.clock = settings, unlocks, clock

    def __call__(self, viewer: Seller) -> EditingWindow:
        policy, now, today = self.settings.policy(), self.clock.now(), self.clock.today()
        days = []
        for day in policy.window(today):
            unlock = None if viewer.is_supervisor else self.unlocks.latest(viewer.username, day)
            open_ = (
                policy.is_open(day, now) or viewer.is_supervisor or bool(unlock and unlock.is_open)
            )
            days.append(DayWindow(day, policy.closes_at(day, now.tzinfo), open_, unlock))
        return EditingWindow(policy, days)


class RequestUnlock:
    """El vendedor pide editar un día ya cerrado, indicando el motivo; avisa al supervisor."""

    def __init__(
        self,
        settings: EditingSettings,
        unlocks: UnlockRepository,
        sellers: SellerRepository,
        notifier: Notifier,
        events: EventPublisher,
        clock: Clock,
    ):
        self.settings, self.unlocks, self.sellers = settings, unlocks, sellers
        self.notifier, self.events, self.clock = notifier, events, clock

    def __call__(self, seller: Seller, day: date, reason: str) -> EditUnlock:
        if seller.is_supervisor:
            raise ForbiddenError("El supervisor puede editar sin habilitación.")
        policy, now, today = self.settings.policy(), self.clock.now(), self.clock.today()
        if day not in policy.window(today):
            raise DomainError(
                "Solo se puede pedir habilitación para los días que se pueden registrar."
            )
        if policy.is_open(day, now):
            raise DomainError("Ese día todavía está abierto: puedes editarlo sin habilitación.")
        latest = self.unlocks.latest(seller.username, day)
        if latest and latest.status in (REQUESTED, APPROVED):
            raise ConflictError("Ya tienes una solicitud pendiente o aprobada para ese día.")
        saved = self.unlocks.add(
            EditUnlock(seller.username, day, clean_reason(reason), REQUESTED, now)
        )
        supervisors = [s for s in self.sellers.list_active() if s.role == SUPERVISOR]
        self.notifier.notify(
            supervisors,
            EDIT_REQUESTED,
            f"{seller.name} pide editar el {day:%d/%m}",
            saved.reason,
            link=UNLOCKS_LINK,
            dedupe_key=f"unlock-{saved.id}",
        )
        _publish_change(self.events, saved)
        logger.info("%s pidió habilitación para el %s", seller.username, day)
        return saved


class ListUnlocks:
    """El vendedor ve sus solicitudes; el supervisor, las de todos (últimos 30 días)."""

    def __init__(self, unlocks: UnlockRepository, clock: Clock):
        self.unlocks, self.clock = unlocks, clock

    def __call__(self, viewer: Seller) -> list[EditUnlock]:
        since = self.clock.today() - timedelta(days=HISTORY_DAYS)
        return self.unlocks.list_since(since, None if viewer.is_supervisor else viewer.username)


class DecideUnlock:
    """El supervisor aprueba o rechaza una solicitud, o vuelve a cerrar una aprobada."""

    def __init__(
        self,
        unlocks: UnlockRepository,
        sellers: SellerRepository,
        notifier: Notifier,
        events: EventPublisher,
        clock: Clock,
    ):
        self.unlocks, self.sellers = unlocks, sellers
        self.notifier, self.events, self.clock = notifier, events, clock

    def __call__(self, actor: Seller, unlock_id: int, action: str) -> EditUnlock:
        _require_supervisor(actor)
        current = self.unlocks.get(unlock_id)
        if current is None:
            raise NotFoundError("No existe esa solicitud.")
        decided = current.decide(action, actor.username, self.clock.now())
        self.unlocks.save(decided)
        account = self.sellers.get_account(decided.seller, active_only=False)
        if account:
            self.notifier.notify(
                [account.seller],
                EDIT_DECIDED,
                DECIDED_TITLE[action],
                _decided_body(action, decided.date),
                link="/registrar",
            )
        _publish_change(self.events, decided)
        logger.info("%s: %s la habilitación %s", actor.username, action, unlock_id)
        return decided


class UpdateCutoff:
    """El supervisor cambia la hora de corte y con cuántos días de anticipación cierra."""

    def __init__(self, settings: EditingSettings, events: EventPublisher, clock: Clock):
        self.settings, self.events, self.clock = settings, events, clock

    def __call__(
        self, actor: Seller, cutoff: str, days_before: int, enabled: bool = True
    ) -> CutoffPolicy:
        _require_supervisor(actor)
        policy = self.settings.save(cutoff, days_before, enabled, actor.username, self.clock.now())
        self.events.publish(Event(EDITING_CHANGED, Audience.role("seller", SUPERVISOR), {}))
        logger.info(
            "%s cambió el corte a %s (%d días antes, bloqueo %s)",
            actor.username,
            cutoff,
            days_before,
            "activo" if enabled else "apagado",
        )
        return policy


class GrantEditing:
    """El supervisor habilita directamente la edición de un vendedor para ciertos días.

    Sirve también para un día aún abierto: la habilitación rige cuando pase la hora de corte.
    Si el vendedor ya la había pedido, se aprueba su solicitud.
    """

    def __init__(
        self,
        settings: EditingSettings,
        unlocks: UnlockRepository,
        sellers: SellerRepository,
        notifier: Notifier,
        events: EventPublisher,
        clock: Clock,
    ):
        self.settings, self.unlocks, self.sellers = settings, unlocks, sellers
        self.notifier, self.events, self.clock = notifier, events, clock

    def __call__(self, actor: Seller, username: str, days: list[date]) -> list[EditUnlock]:
        _require_supervisor(actor)
        seller = _target_seller(self.sellers, username)
        policy, now, today = self.settings.policy(), self.clock.now(), self.clock.today()
        window = policy.window(today)
        chosen = sorted(set(days))
        if not chosen:
            raise DomainError("Elige al menos un día.")
        if any(d not in window for d in chosen):
            raise DomainError("Solo se habilitan los días que se pueden registrar.")
        granted = []
        for day in chosen:
            latest = self.unlocks.latest(seller.username, day)
            if latest and latest.status == APPROVED:
                granted.append(latest)
                continue
            if latest and latest.status == REQUESTED:
                unlock = latest.decide("approve", actor.username, now)
                self.unlocks.save(unlock)
            else:
                unlock = self.unlocks.add(
                    EditUnlock(
                        seller.username,
                        day,
                        f"Habilitada por {actor.name}",
                        APPROVED,
                        now,
                        decided_by=actor.username,
                        decided_at=now,
                    )
                )
            granted.append(unlock)
            _publish_change(self.events, unlock)
        self.notifier.notify(
            [seller],
            EDIT_DECIDED,
            DECIDED_TITLE["approve"],
            f"Ya puedes editar tu proyección del {_dates_text(chosen)}.",
            link="/registrar",
        )
        logger.info("%s habilitó la edición de %s: %s", actor.username, username, chosen)
        return granted


class RevokeEditing:
    """El supervisor cierra todas las habilitaciones vigentes de un vendedor."""

    def __init__(
        self,
        unlocks: UnlockRepository,
        sellers: SellerRepository,
        notifier: Notifier,
        events: EventPublisher,
        clock: Clock,
    ):
        self.unlocks, self.sellers = unlocks, sellers
        self.notifier, self.events, self.clock = notifier, events, clock

    def __call__(self, actor: Seller, username: str) -> list[EditUnlock]:
        _require_supervisor(actor)
        seller = _target_seller(self.sellers, username)
        now, today = self.clock.now(), self.clock.today()
        # La lista viene de la más nueva a la más antigua: la primera de cada día es la vigente.
        seen: set[date] = set()
        open_ = []
        for unlock in self.unlocks.list_since(today, seller.username):
            if unlock.date not in seen and unlock.status == APPROVED:
                open_.append(unlock)
            seen.add(unlock.date)
        closed = []
        for unlock in open_:
            done = unlock.decide("close", actor.username, now)
            self.unlocks.save(done)
            closed.append(done)
            _publish_change(self.events, done)
        if closed:
            self.notifier.notify(
                [seller],
                EDIT_DECIDED,
                DECIDED_TITLE["close"],
                f"La edición del {_dates_text([u.date for u in closed])} volvió a cerrarse.",
                link="/registrar",
            )
        logger.info("%s cerró %d habilitación(es) de %s", actor.username, len(closed), username)
        return closed


def _target_seller(sellers: SellerRepository, username: str) -> Seller:
    account = sellers.get_account(username, active_only=True)
    if account is None or account.seller.is_supervisor:
        raise NotFoundError("No existe un vendedor activo con ese usuario.")
    return account.seller


def _dates_text(days: list[date]) -> str:
    """[5/11, 6/11, 7/11] → "05/11, 06/11 y 07/11"."""
    labels = [f"{d:%d/%m}" for d in sorted(days)]
    return labels[0] if len(labels) == 1 else f"{', '.join(labels[:-1])} y {labels[-1]}"


def _decided_body(action: str, day: date) -> str:
    if action == "approve":
        return f"Ya puedes editar tu proyección del {day:%d/%m}."
    if action == "reject":
        return f"El supervisor no habilitó la edición del {day:%d/%m}."
    return f"La edición del {day:%d/%m} volvió a cerrarse."


def _publish_change(events: EventPublisher, unlock: EditUnlock) -> None:
    """Refresca la pantalla del vendedor y la de los supervisores."""
    audience = Audience(usernames=frozenset({unlock.seller}), roles=frozenset({SUPERVISOR}))
    events.publish(
        Event(EDITING_CHANGED, audience, {"seller": unlock.seller, "date": unlock.date.isoformat()})
    )
