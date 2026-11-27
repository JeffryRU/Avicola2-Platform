"""Límite de llamadas por usuario (ventana fija), en memoria o en Redis (ADR 0014 y 0017).

- `memory`: un contador por proceso. Con varios workers, cada uno cuenta por su lado.
- `redis`: un contador compartido por todos los procesos (INCR + EXPIRE).
  Si Redis no responde, cuenta en memoria durante `PAUSE_SECONDS` (el límite se sigue
  aplicando, por proceso) y después vuelve a probar: así una caída no hace lenta cada llamada.
"""

import logging
import threading
import time
from collections.abc import Callable
from typing import Any, Protocol

import redis
from redis.backoff import NoBackoff
from redis.retry import Retry

logger = logging.getLogger(__name__)


class RateLimiter(Protocol):
    limit: int
    window: int

    def allow(self, key: str) -> bool:
        """Cuenta una llamada de `key` y dice si todavía está dentro del límite."""
        ...


class MemoryRateLimiter:
    """Ventana fija por proceso; segura entre hilos."""

    def __init__(
        self, limit: int, window_seconds: int, clock: Callable[[], float] = time.monotonic
    ) -> None:
        self.limit, self.window = limit, window_seconds
        self._clock = clock
        self._slot = 0
        self._counts: dict[str, int] = {}
        self._lock = threading.Lock()

    def allow(self, key: str) -> bool:
        slot = int(self._clock() // self.window)
        with self._lock:
            if slot != self._slot:
                # Ventana nueva: se olvidan todos los contadores (no crece sin fin).
                self._slot, self._counts = slot, {}
            count = self._counts.get(key, 0) + 1
            self._counts[key] = count
        return count <= self.limit


class RedisRateLimiter:
    """Ventana fija compartida entre procesos. Si Redis falla, cuenta en memoria."""

    PAUSE_SECONDS = 30.0

    def __init__(self, client: Any, limit: int, window_seconds: int, namespace: str) -> None:
        self.limit, self.window = limit, window_seconds
        self.client, self.namespace = client, namespace
        self.fallback = MemoryRateLimiter(limit, window_seconds)
        self._paused_until = 0.0

    def allow(self, key: str) -> bool:
        if time.monotonic() < self._paused_until:
            return self.fallback.allow(key)
        slot = int(time.time() // self.window)
        full = f"{self.namespace}ratelimit:{key}:{slot}"
        try:
            pipe = self.client.pipeline()
            pipe.incr(full)
            pipe.expire(full, self.window + 1)
            count, _ = pipe.execute()
        except Exception as exc:  # noqa: BLE001 — cualquier fallo de Redis: contar en memoria
            self._paused_until = time.monotonic() + self.PAUSE_SECONDS
            logger.warning("Redis no respondió al límite de llamadas (en memoria): %s", exc)
            return self.fallback.allow(key)
        return int(count) <= self.limit


def build_rate_limiter(
    backend: str, limit: int, window_seconds: int, redis_url: str | None, namespace: str
) -> RateLimiter:
    """El mismo backend que la caché (`CACHE_BACKEND`): con Redis, el límite es global."""
    if backend == "redis" and redis_url:
        # Sin reintentos: si Redis tarda, conviene contar en memoria antes que hacer esperar.
        client = redis.Redis.from_url(
            redis_url, socket_connect_timeout=0.5, socket_timeout=0.5, retry=Retry(NoBackoff(), 0)
        )
        return RedisRateLimiter(client, limit, window_seconds, namespace)
    return MemoryRateLimiter(limit, window_seconds)
