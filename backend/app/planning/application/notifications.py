"""Casos de uso de notificaciones: crear (y avisar en tiempo real), listar y marcar leídas."""

import logging
from dataclasses import asdict, dataclass

from app.planning.application.ports import (
    Clock,
    EventPublisher,
    NotificationRepository,
    ProjectionRepository,
    SellerRepository,
)
from app.planning.domain.models import SELLER, SUPERVISOR, Projection, Seller, SellerAccount
from app.planning.domain.notifications import (
    ANNOUNCEMENT,
    AUDIENCES,
    NOTIFICATION_CREATED,
    PROJECTION_REMINDER,
    PROJECTION_SUBMITTED,
    PROJECTIONS_CHANGED,
    Audience,
    Event,
    Notification,
)
from app.shared.domain.errors import DomainError, NotFoundError

logger = logging.getLogger(__name__)

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

    def __call__(self, seller: Seller, saved: list[Projection]) -> None:
        dates = sorted(p.date for p in saved)
        units = sum(p.total_units for p in saved)
        supervisors = [s for s in self.sellers.list_active() if s.role == SUPERVISOR]
        days = f"{len(saved)} día" if len(saved) == 1 else f"{len(saved)} días"
        self.notifier.notify(
            supervisors,
            PROJECTION_SUBMITTED,
            f"Proyección de {seller.name}",
            f"Registró {days} de {saved[0].category} ({units} unid.) desde el {dates[0]:%d/%m}.",
            link="/dashboards/estado",
        )
        # El propio vendedor también: sus otros dispositivos actualizan su historial.
        audience = Audience(usernames=frozenset({seller.username}), roles=frozenset({SUPERVISOR}))
        self.events.publish(
            Event(
                PROJECTIONS_CHANGED,
                audience,
                {"seller": seller.username, "dates": [d.isoformat() for d in dates]},
            )
        )


class SendProjectionReminders:
    """Recordatorio diario (lo dispara n8n): a cada vendedor sin proyección para hoy."""

    def __init__(
        self,
        sellers: SellerRepository,
        projections: ProjectionRepository,
        notifier: Notifier,
        clock: Clock,
    ):
        self.sellers, self.projections = sellers, projections
        self.notifier, self.clock = notifier, clock

    def __call__(self) -> int:
        today = self.clock.today()
        done = {p.seller for p in self.projections.find(today, today)}
        pending = [
            s for s in self.sellers.list_active() if s.role == SELLER and s.username not in done
        ]
        created = self.notifier.notify(
            pending,
            PROJECTION_REMINDER,
            "Proyección pendiente",
            f"Aún no registras tu proyección de hoy ({today:%d/%m}).",
            link="/registrar",
            dedupe_key=f"reminder-{today.isoformat()}",
        )
        logger.info(
            "Recordatorios de proyección: %d enviados (%d pendientes)", created, len(pending)
        )
        return created


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
