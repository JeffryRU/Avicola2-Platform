"""Casos de uso de notificaciones: crear (y avisar en tiempo real), listar y marcar leídas."""

import logging
from collections.abc import Callable
from dataclasses import asdict, dataclass
from datetime import timedelta

from app.planning.application.ports import (
    Clock,
    EventPublisher,
    NotificationRepository,
    ProjectionRepository,
    SellerRepository,
    UnlockRepository,
)
from app.planning.domain.editing import CutoffPolicy
from app.planning.domain.models import SELLER, Projection, Seller, SellerAccount
from app.planning.domain.notifications import (
    ANNOUNCEMENT,
    AUDIENCES,
    NOTIFICATION_CREATED,
    PROJECTION_MISSED,
    PROJECTION_REMINDER,
    PROJECTION_SUBMITTED,
    PROJECTIONS_CHANGED,
    Audience,
    Event,
    Notification,
)
from app.planning.domain.permissions import Permission
from app.shared.domain.errors import DomainError, NotFoundError

logger = logging.getLogger(__name__)


def team_audience(sellers: SellerRepository, permission: Permission, *usernames: str) -> Audience:
    """Destinatarios de un evento del equipo, resueltos AHORA con los roles de la base.

    No se filtra por el rol que tenía cada conexión en tiempo real al abrirse: si a un
    supervisor lo degradan (también desde la consola, en otro proceso), deja de recibir los
    eventos del equipo al instante.
    """
    staff = (s.username for s in sellers.list_active() if s.can(permission))
    return Audience.users(*usernames, *staff)


MAX_LIST = 100


def notification_payload(n: Notification) -> dict:
    data = asdict(n)
    data.pop("dedupe_key")
    data.pop("recipient")
    return {k: v.isoformat() if hasattr(v, "isoformat") else v for k, v in data.items()}


class Notifier:
    """Guarda la notificación de cada destinatario y le avisa por el canal en tiempo real."""

    def __init__(self, notifications: NotificationRepository, events: EventPublisher, clock: Clock):
        self.notifications, self.events, self.clock = notifications, events, clock

    def notify(
        self,
        recipients: list[Seller],
        kind: str,
        title: str,
        body: str,
        link: str | None = None,
        dedupe_key: str | None = None,
    ) -> int:
        created = 0
        now = self.clock.now()
        for recipient in recipients:
            saved = self.notifications.add(
                Notification(recipient.username, kind, title, body, now, link, dedupe_key)
            )
            if saved is None:
                continue  # ya se le avisó (mismo dedupe_key)
            created += 1
            self.events.publish(
                Event(
                    NOTIFICATION_CREATED,
                    Audience.users(recipient.username),
                    notification_payload(saved),
                )
            )
        return created


@dataclass(frozen=True)
class NotificationPage:
    items: list[Notification]
    unread: int


class ListNotifications:
    def __init__(self, notifications: NotificationRepository):
        self.notifications = notifications

    def __call__(self, account: SellerAccount, limit: int = 50) -> NotificationPage:
        username = account.seller.username
        return NotificationPage(
            self.notifications.list_for(username, min(max(limit, 1), MAX_LIST)),
            self.notifications.unread_count(username),
        )


class MarkNotificationsRead:
    def __init__(self, notifications: NotificationRepository, clock: Clock):
        self.notifications, self.clock = notifications, clock

    def __call__(self, account: SellerAccount, ids: list[int] | None) -> int:
        return self.notifications.mark_read(account.seller.username, ids, self.clock.now())


class NotifyProjectionSubmitted:
    """Tras guardar una proyección: avisa a los supervisores y refresca los dashboards abiertos."""

    def __init__(self, sellers: SellerRepository, notifier: Notifier, events: EventPublisher):
        self.sellers, self.notifier, self.events = sellers, notifier, events

    def __call__(
        self, seller: Seller, saved: list[Projection], author: Seller | None = None
    ) -> None:
        dates = sorted(p.date for p in saved)
        units = sum(p.total_units for p in saved)
        days = f"{len(saved)} día" if len(saved) == 1 else f"{len(saved)} días"
        what = f"{days} de {saved[0].category} ({units} unid.) desde el {dates[0]:%d/%m}."
        if author and author.username != seller.username:
            # Lo registró el supervisor: el aviso es para el vendedor.
            self.notifier.notify(
                [seller],
                PROJECTION_SUBMITTED,
                f"{author.name} actualizó tu proyección",
                what[0].upper() + what[1:],
                link="/historial",
            )
        else:
            supervisors = [s for s in self.sellers.list_active() if s.can(Permission.VIEW_TEAM)]
            self.notifier.notify(
                supervisors,
                PROJECTION_SUBMITTED,
                f"Proyección de {seller.name}",
                f"Registró {what}",
                link="/dashboards/estado",
            )
        # El propio vendedor también: sus otros dispositivos actualizan su historial.
        audience = team_audience(self.sellers, Permission.VIEW_TEAM, seller.username)
        self.events.publish(
            Event(
                PROJECTIONS_CHANGED,
                audience,
                {"seller": seller.username, "dates": [d.isoformat() for d in dates]},
            )
        )


class SendProjectionReminders:
    """Recordatorio diario (lo dispara n8n): a cada vendedor sin proyección para el próximo
    día que todavía se puede editar (el que cierra primero)."""

    def __init__(
        self,
        sellers: SellerRepository,
        projections: ProjectionRepository,
        notifier: Notifier,
        clock: Clock,
        policy: Callable[[], CutoffPolicy],
    ):
        self.sellers, self.projections = sellers, projections
        self.notifier, self.clock, self.policy = notifier, clock, policy

    def __call__(self) -> int:
        policy, now, today = self.policy(), self.clock.now(), self.clock.today()
        day = next((d for d in policy.window(today) if policy.is_open(d, now)), None)
        if day is None:
            return 0
        closes = policy.closes_at(day, now.tzinfo)
        done = {p.seller for p in self.projections.find(day, day)}
        pending = [
            s for s in self.sellers.list_active() if s.role == SELLER and s.username not in done
        ]
        when = "hoy" if closes.date() == today else f"el {closes:%d/%m}"
        created = self.notifier.notify(
            pending,
            PROJECTION_REMINDER,
            "Proyección pendiente",
            f"Aún no registras tu proyección del {day:%d/%m}. Cierra {when} a las {closes:%H:%M}.",
            link=f"/registrar?dia={day.isoformat()}",
            dedupe_key=f"reminder-{day.isoformat()}",
        )
        logger.info(
            "Recordatorios de proyección: %d enviados (%d pendientes)", created, len(pending)
        )
        return created


class NotifyClosingSoon:
    """Antes de la hora de corte de un día: avisa a cada vendedor que aún no registró su
    proyección, con `lead` de anticipación. La hora sale de la política vigente (la que el
    supervisor configuró), no de un horario fijo. Cada aviso sale una sola vez por día y hora
    de corte: si el supervisor mueve el corte, se avisa de nuevo con la hora nueva."""

    def __init__(
        self,
        sellers: SellerRepository,
        projections: ProjectionRepository,
        notifier: Notifier,
        clock: Clock,
        policy: Callable[[], CutoffPolicy],
        lead: timedelta,
    ):
        self.sellers, self.projections = sellers, projections
        self.notifier, self.clock, self.policy, self.lead = notifier, clock, policy, lead

    def __call__(self) -> int:
        if self.lead <= timedelta(0):
            return 0
        policy, now, today = self.policy(), self.clock.now(), self.clock.today()
        created = 0
        for day in policy.closing_soon(today, now, self.lead):
            closes = policy.closes_at(day, now.tzinfo)
            done = {p.seller for p in self.projections.find(day, day)}
            pending = [
                s for s in self.sellers.list_active() if s.role == SELLER and s.username not in done
            ]
            minutes = max(1, int((closes - now).total_seconds() // 60))
            sent = self.notifier.notify(
                pending,
                PROJECTION_REMINDER,
                "Tu proyección cierra pronto",
                f"Aún no registras tu proyección del {day:%d/%m}. Cierra a las {closes:%H:%M} "
                f"(en {minutes} min).",
                link=f"/registrar?dia={day.isoformat()}",
                dedupe_key=f"closing-{day.isoformat()}-{closes:%H%M}",
            )
            if sent:
                logger.info("Aviso previo al corte del %s: %d vendedor(es)", day, sent)
            created += sent
        return created


# Se avisa por los cortes de las últimas horas: tras un reinicio no llegan avisos de días viejos.
MISSED_LOOKBACK = timedelta(hours=6)


class NotifyMissedProjections:
    """Pasada la hora de corte de un día: avisa a cada vendedor que no registró su proyección y
    a los supervisores, con la lista. Cada aviso sale una sola vez (dedupe por día), así que se
    puede llamar seguido (la API lo revisa cada minuto; también lo puede disparar n8n)."""

    def __init__(
        self,
        sellers: SellerRepository,
        projections: ProjectionRepository,
        unlocks: UnlockRepository,
        notifier: Notifier,
        clock: Clock,
        policy: Callable[[], CutoffPolicy],
    ):
        self.sellers, self.projections, self.unlocks = sellers, projections, unlocks
        self.notifier, self.clock, self.policy = notifier, clock, policy

    def __call__(self) -> int:
        policy, now, today = self.policy(), self.clock.now(), self.clock.today()
        created = 0
        for day in policy.closed_recently(today, now, MISSED_LOOKBACK):
            created += self._notify(day, policy, now.tzinfo)
        return created

    def _notify(self, day, policy: CutoffPolicy, tz) -> int:
        active = self.sellers.list_active()
        done = {p.seller for p in self.projections.find(day, day)}
        missing = [s for s in active if s.role == SELLER and s.username not in done]
        if not missing:
            return 0
        closes = policy.closes_at(day, tz)
        key = f"missed-{day.isoformat()}"
        # Al vendedor con habilitación no se le pide que la pida: ya puede registrar.
        unlocked = {
            s.username for s in missing if (u := self.unlocks.latest(s.username, day)) and u.is_open
        }
        created = 0
        for seller in missing:
            hint = (
                "Tienes habilitación: regístrala cuanto antes."
                if seller.username in unlocked
                else "Si aún la necesitas, pide una habilitación al supervisor."
            )
            created += self.notifier.notify(
                [seller],
                PROJECTION_MISSED,
                "No registraste tu proyección",
                f"La del {day:%d/%m} cerró el {closes:%d/%m} a las {closes:%H:%M}. {hint}",
                link=f"/registrar?dia={day.isoformat()}",
                dedupe_key=key,
            )
        names = _names([s.name for s in missing])
        count = len(missing)
        supervisors = [s for s in active if s.can(Permission.VIEW_TEAM)]
        created += self.notifier.notify(
            supervisors,
            PROJECTION_MISSED,
            f"{count} {'vendedor' if count == 1 else 'vendedores'} sin proyección del {day:%d/%m}",
            f"Pasó la hora de corte ({closes:%H:%M}) y {'falta' if count == 1 else 'faltan'}: "
            f"{names}.",
            link=f"/dashboards/dia/{day.isoformat()}",
            dedupe_key=key,
        )
        logger.info("Sin proyección del %s pasado el corte: %d vendedor(es)", day, count)
        return created


def _names(names: list[str]) -> str:
    names = sorted(names)
    return names[0] if len(names) == 1 else f"{', '.join(names[:-1])} y {names[-1]}"


class Announce:
    """Aviso general (lo envía n8n): a todos, a un rol o a un usuario."""

    def __init__(self, sellers: SellerRepository, notifier: Notifier):
        self.sellers, self.notifier = sellers, notifier

    def __call__(self, audience: str, title: str, body: str, link: str | None = None) -> int:
        title, body = title.strip(), body.strip()
        if not title or not body:
            raise DomainError("El aviso necesita título y texto.")
        active = self.sellers.list_active()
        if audience in AUDIENCES:
            recipients = [s for s in active if s.role in AUDIENCES[audience]]
        else:
            recipients = [s for s in active if s.username == audience]
            if not recipients:
                raise NotFoundError(f"No hay un usuario activo {audience}.")
        created = self.notifier.notify(recipients, ANNOUNCEMENT, title, body, link)
        logger.info("Aviso «%s» enviado a %d usuario(s) (%s)", title, created, audience)
        return created
