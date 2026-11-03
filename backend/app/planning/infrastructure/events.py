"""Bus de eventos en memoria: reparte los eventos a las conexiones SSE abiertas en este proceso.

Alcanza con un solo proceso de uvicorn (UVICORN_WORKERS=1). Con varios procesos o servidores,
se reemplaza por otro adaptador del mismo puerto (Redis pub/sub, Postgres LISTEN/NOTIFY o
RabbitMQ) sin tocar los casos de uso.
"""

import asyncio
import logging
import threading
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from dataclasses import dataclass, field

from app.planning.domain.notifications import Event

logger = logging.getLogger(__name__)

MAX_PENDING = 100


@dataclass(eq=False)
class Subscription:
    username: str
    role: str
    loop: asyncio.AbstractEventLoop
    queue: asyncio.Queue[Event] = field(default_factory=lambda: asyncio.Queue(MAX_PENDING))

    def offer(self, event: Event) -> None:
        """Encola desde cualquier hilo (los endpoints síncronos corren en un threadpool)."""
        self.loop.call_soon_threadsafe(self._put, event)

    def _put(self, event: Event) -> None:
        if self.queue.full():
            self.queue.get_nowait()  # navegador lento: se descarta el evento más viejo
        self.queue.put_nowait(event)

    async def next(self) -> Event:
        return await self.queue.get()


class InMemoryEventBus:
    def __init__(self) -> None:
        self._subscriptions: set[Subscription] = set()
        self._lock = threading.Lock()

    def publish(self, event: Event) -> None:
        with self._lock:
            targets = [
                s for s in self._subscriptions if event.audience.includes(s.username, s.role)
            ]
        for subscription in targets:
            try:
                subscription.offer(event)
            except RuntimeError:  # el loop de esa conexión ya cerró
                self._remove(subscription)

    @asynccontextmanager
    async def subscribe(self, username: str, role: str) -> AsyncIterator[Subscription]:
        subscription = Subscription(username, role, asyncio.get_running_loop())
        with self._lock:
            self._subscriptions.add(subscription)
        try:
            yield subscription
        finally:
            self._remove(subscription)

    def connections(self) -> int:
        with self._lock:
            return len(self._subscriptions)

    def _remove(self, subscription: Subscription) -> None:
        with self._lock:
            self._subscriptions.discard(subscription)


# Uno por proceso: lo comparten todas las peticiones (ver bootstrap.py).
event_bus = InMemoryEventBus()
