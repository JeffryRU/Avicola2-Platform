"""Caché de lecturas frecuentes con tiempo de vida (TTL), en memoria o en Redis.

Para lo que se lee en casi cada petición y cambia poco (configuración, catálogo, vendedores
activos): ahorra viajes a la base y libera antes las conexiones del pool. Ver ADR 0014.

- `memory` (por defecto): un diccionario por proceso. Lo que cambia otro proceso (la CLI, otro
  worker o réplica) se ve a lo sumo tras el TTL.
- `redis`: compartida por todos los procesos; una invalidación vale para todos al instante.
  Si Redis no responde, se lee de la base (la app sigue funcionando, solo sin caché).

TTL 0 = sin caché. Los valores viajan a Redis como JSON (nunca pickle); cada uso indica cómo
convertir su valor con un `Codec`.
"""

import json
import logging
import threading
import time
from collections.abc import Callable
from dataclasses import dataclass
from typing import Any, Protocol, TypeVar

import redis

T = TypeVar("T")
logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class Codec[T]:
    """Cómo pasar un valor a algo serializable en JSON y de vuelta (solo lo usa Redis)."""

    dump: Callable[[T], Any]
    load: Callable[[Any], T]


IDENTITY: Codec[Any] = Codec(lambda v: v, lambda v: v)


class Cache(Protocol):
    ttl: float

    def get_or_load(self, key: str, load: Callable[[], T], codec: Codec[T] = IDENTITY) -> T: ...

    def invalidate(self, prefix: str = "") -> None: ...


class MemoryCache:
    """En memoria del proceso; segura entre hilos (FastAPI atiende en un pool de hilos)."""

    def __init__(self, ttl_seconds: float, clock: Callable[[], float] = time.monotonic) -> None:
        self.ttl = ttl_seconds
        self._clock = clock
        self._items: dict[str, tuple[float, Any]] = {}
        self._lock = threading.Lock()

    def get_or_load(self, key: str, load: Callable[[], T], codec: Codec[T] = IDENTITY) -> T:  # noqa: ARG002
        if self.ttl <= 0:
            return load()
        now = self._clock()
        with self._lock:
            hit = self._items.get(key)
            if hit and hit[0] > now:
                return hit[1]
        value = load()  # fuera del lock: no bloquea a otros hilos mientras va a la base
        with self._lock:
            self._items[key] = (now + self.ttl, value)
        return value

    def invalidate(self, prefix: str = "") -> None:
        with self._lock:
            for key in [k for k in self._items if k.startswith(prefix)]:
                del self._items[key]


class RedisCache:
    """En Redis, con las claves bajo `namespace` (así varios entornos pueden compartir uno).

    Ante un error de Redis no falla la petición: lee de la base y lo registra (como mucho una
    vez por minuto, para no llenar el log mientras Redis esté caído)."""

    WARN_EVERY_SECONDS = 60.0

    def __init__(self, client: Any, ttl_seconds: float, namespace: str) -> None:
        self.ttl = ttl_seconds
        self.client = client
        self.namespace = namespace
        self._last_warning = 0.0

    def get_or_load(self, key: str, load: Callable[[], T], codec: Codec[T] = IDENTITY) -> T:
        if self.ttl <= 0:
            return load()
        full = self.namespace + key
        try:
            raw = self.client.get(full)
        except Exception as exc:  # noqa: BLE001 — cualquier fallo de Redis: seguir sin caché
            self._warn("leer", exc)
            return load()
        if raw is not None:
            try:
                # Envuelto en {"v": ...} para distinguir "no está" de un None guardado.
                return codec.load(json.loads(raw)["v"])
            except (ValueError, KeyError, TypeError):
                logger.warning("Valor ilegible en la caché (%s): se vuelve a leer de la base", key)
        value = load()
        try:
            payload = json.dumps({"v": codec.dump(value)}, ensure_ascii=False)
            self.client.set(full, payload, px=max(1, int(self.ttl * 1000)))
        except Exception as exc:  # noqa: BLE001
            self._warn("guardar", exc)
        return value

    def invalidate(self, prefix: str = "") -> None:
        try:
            keys = list(self.client.scan_iter(match=self.namespace + prefix + "*", count=200))
            if keys:
                self.client.delete(*keys)
        except Exception as exc:  # noqa: BLE001
            # Sin invalidar, lo viejo dura a lo sumo el TTL (el valor vence solo en Redis).
            self._warn("invalidar", exc)

    def _warn(self, action: str, exc: Exception) -> None:
        now = time.monotonic()
        if now - self._last_warning >= self.WARN_EVERY_SECONDS:
            self._last_warning = now
            logger.warning("Redis no respondió al %s (se usa la base): %s", action, exc)


def build_cache(
    backend: str, ttl_seconds: float, redis_url: str | None = None, namespace: str = ""
) -> Cache:
    """Crea la caché que pide la configuración (`CACHE_BACKEND`)."""
    if backend == "memory":
        return MemoryCache(ttl_seconds)
    if backend == "redis":
        if not redis_url:
            raise ValueError("CACHE_BACKEND=redis necesita REDIS_URL (p. ej. redis://redis:6379/0)")
        # Tiempos cortos: si Redis tarda, conviene más ir a la base que esperar.
        client = redis.Redis.from_url(
            redis_url, socket_connect_timeout=0.5, socket_timeout=0.5, health_check_interval=30
        )
        logger.info("Caché en Redis (TTL %.0f s, prefijo %r)", ttl_seconds, namespace)
        return RedisCache(client, ttl_seconds, namespace)
    raise ValueError(f"CACHE_BACKEND desconocido: {backend!r} (usa memory o redis)")
