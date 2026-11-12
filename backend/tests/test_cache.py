from datetime import UTC, datetime

from app.planning.infrastructure.persistence.cached import (
    CachedSellerRepository,
    CachedSettingsRepository,
)
from app.shared.infrastructure.cache import MemoryCache


class _Clock:
    def __init__(self) -> None:
        self.now = 0.0

    def __call__(self) -> float:
        return self.now


def _counting(value):
    calls = []

    def load():
        calls.append(1)
        return value

    return load, calls


def test_reuses_value_until_ttl_expires() -> None:
    clock = _Clock()
    cache = MemoryCache(60, clock)
    load, calls = _counting("x")
    assert cache.get_or_load("k", load) == "x"
    assert cache.get_or_load("k", load) == "x"
    assert len(calls) == 1
    clock.now = 61
    cache.get_or_load("k", load)
    assert len(calls) == 2


def test_ttl_zero_disables_cache() -> None:
    cache = MemoryCache(0)
    load, calls = _counting(1)
    cache.get_or_load("k", load)
    cache.get_or_load("k", load)
    assert len(calls) == 2


def test_invalidate_by_prefix() -> None:
    cache = MemoryCache(60)
    a, a_calls = _counting(1)
    b, b_calls = _counting(2)
    cache.get_or_load("settings:a", a)
    cache.get_or_load("sellers:b", b)
    cache.invalidate("settings:")
    cache.get_or_load("settings:a", a)
    cache.get_or_load("sellers:b", b)
    assert (len(a_calls), len(b_calls)) == (2, 1)


class _FakeSettings:
    def __init__(self) -> None:
        self.values: dict[str, str] = {}
        self.reads = 0

    def get(self, key):
        self.reads += 1
        return self.values.get(key)

    def set(self, key, value, _updated_by, _updated_at):
        self.values[key] = value


def test_settings_write_is_visible_immediately() -> None:
    inner = _FakeSettings()
    repo = CachedSettingsRepository(inner, MemoryCache(60))  # type: ignore[arg-type]
    assert repo.get("cutoff") is None
    assert repo.get("cutoff") is None
    assert inner.reads == 1
    repo.set("cutoff", "14:00", "supervisor", datetime.now(UTC))
    assert repo.get("cutoff") == "14:00"


class _FakeSellers:
    def __init__(self) -> None:
        self.active = ["rnavarro"]
        self.reads = 0

    def list_active(self):
        self.reads += 1
        return list(self.active)

    def save_profile(self, seller):
        self.active = [seller]

    def get_account(self, username, _active_only=True):
        self.reads += 1
        return username


def test_seller_writes_invalidate_the_active_list() -> None:
    inner = _FakeSellers()
    repo = CachedSellerRepository(inner, MemoryCache(60))  # type: ignore[arg-type]
    assert repo.list_active() == ["rnavarro"]
    repo.list_active().append("intruso")  # una copia: no ensucia la caché
    assert repo.list_active() == ["rnavarro"]
    repo.save_profile("hdias")
    assert repo.list_active() == ["hdias"]


def test_session_account_is_never_cached() -> None:
    inner = _FakeSellers()
    repo = CachedSellerRepository(inner, MemoryCache(60))  # type: ignore[arg-type]
    repo.get_account("rnavarro")
    repo.get_account("rnavarro")
    assert inner.reads == 2  # desactivar o cerrar sesión vale al instante


# --- Redis --------------------------------------------------------------------------------

import fakeredis  # noqa: E402
import pytest  # noqa: E402

from app.planning.domain.models import Product  # noqa: E402
from app.planning.infrastructure.persistence.cached import PRODUCTS_CODEC  # noqa: E402
from app.shared.infrastructure.cache import RedisCache, build_cache  # noqa: E402


@pytest.fixture
def server():
    return fakeredis.FakeServer()


def _redis(server, namespace="avicola2:test:", ttl=60):
    return RedisCache(fakeredis.FakeRedis(server=server), ttl, namespace)


def test_redis_round_trips_dataclasses_as_json(server) -> None:
    cache = _redis(server)
    items = [Product("P0001", "BRASA", "Pollo", 2.1, 1, "Brasa chica")]
    load, calls = _counting(items)
    assert cache.get_or_load("products:stock", load, PRODUCTS_CODEC) == items
    assert cache.get_or_load("products:stock", load, PRODUCTS_CODEC) == items
    assert len(calls) == 1
    raw = fakeredis.FakeRedis(server=server).get("avicola2:test:products:stock")
    assert b"P0001" in raw and b"\x80" not in raw  # JSON, no pickle


def test_redis_caches_none(server) -> None:
    cache = _redis(server)
    load, calls = _counting(None)
    assert cache.get_or_load("settings:x", load) is None
    assert cache.get_or_load("settings:x", load) is None
    assert len(calls) == 1


def test_redis_invalidation_is_shared_between_processes(server) -> None:
    api, cli = _redis(server), _redis(server)  # dos procesos, mismo Redis
    load, calls = _counting("v1")
    api.get_or_load("settings:cutoff", load)
    cli.invalidate("settings:")
    api.get_or_load("settings:cutoff", load)
    assert len(calls) == 2


def test_redis_namespaces_do_not_mix(server) -> None:
    dev, prod = _redis(server, "avicola2:staging:"), _redis(server, "avicola2:production:")
    dev.get_or_load("k", lambda: "dev")
    assert prod.get_or_load("k", lambda: "prod") == "prod"
    prod.invalidate()
    assert dev.get_or_load("k", lambda: "otro") == "dev"


class _DownRedis:
    def __getattr__(self, _name):
        def fail(*_a, **_k):
            raise ConnectionError("Redis caído")

        return fail


def test_redis_down_falls_back_to_the_database() -> None:
    cache = RedisCache(_DownRedis(), 60, "ns:")
    load, calls = _counting("de la base")
    assert cache.get_or_load("k", load) == "de la base"
    assert cache.get_or_load("k", load) == "de la base"
    cache.invalidate("k")  # no lanza
    assert len(calls) == 2


def test_unreadable_value_is_reloaded(server) -> None:
    fakeredis.FakeRedis(server=server).set("ns:k", "no es json")
    cache = _redis(server, "ns:")
    assert cache.get_or_load("k", lambda: "fresco") == "fresco"


def test_build_cache_validates_config() -> None:
    assert isinstance(build_cache("memory", 60), MemoryCache)
    with pytest.raises(ValueError, match="REDIS_URL"):
        build_cache("redis", 60)
    with pytest.raises(ValueError, match="desconocido"):
        build_cache("memcached", 60)
