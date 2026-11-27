"""Límite de llamadas del MCP (ADR 0017): en memoria, en Redis y con Redis caído."""

import time

import fakeredis
from hypothesis import given
from hypothesis import strategies as st

from app.shared.infrastructure.mcp.limits import (
    MemoryRateLimiter,
    RedisRateLimiter,
    build_rate_limiter,
)


class Clock:
    def __init__(self) -> None:
        self.now = 0.0

    def __call__(self) -> float:
        return self.now


def test_memory_limit_per_key_and_window() -> None:
    clock = Clock()
    limiter = MemoryRateLimiter(2, 60, clock)
    assert [limiter.allow("ana") for _ in range(3)] == [True, True, False]
    assert limiter.allow("beto")  # cada usuario tiene su contador
    clock.now = 61  # ventana nueva
    assert limiter.allow("ana")


@given(st.integers(1, 20), st.integers(0, 60))
def test_memory_limit_allows_exactly_the_limit(limit, calls) -> None:
    """Oráculo: en una ventana pasan las primeras `limit` llamadas y ninguna más."""
    limiter = MemoryRateLimiter(limit, 60, Clock())
    results = [limiter.allow("u") for _ in range(calls)]
    assert results == [i < limit for i in range(calls)]


def test_memory_limit_forgets_old_windows() -> None:
    clock = Clock()
    limiter = MemoryRateLimiter(5, 10, clock)
    for i in range(100):
        limiter.allow(f"u{i}")
    clock.now = 20
    limiter.allow("nuevo")
    assert list(limiter._counts) == ["nuevo"]


def test_redis_limit_is_shared_between_processes() -> None:
    server = fakeredis.FakeServer()
    a = RedisRateLimiter(fakeredis.FakeRedis(server=server), 3, 60, "t:")
    b = RedisRateLimiter(fakeredis.FakeRedis(server=server), 3, 60, "t:")
    assert [a.allow("ana"), b.allow("ana"), a.allow("ana"), b.allow("ana")] == [
        True,
        True,
        True,
        False,
    ]
    [key] = fakeredis.FakeRedis(server=server).keys("t:ratelimit:ana:*")
    assert 0 < fakeredis.FakeRedis(server=server).ttl(key) <= 61


def test_redis_down_still_limits_in_memory_without_waiting() -> None:
    limiter = build_rate_limiter("redis", 2, 60, "redis://127.0.0.1:1/0", "t:")
    start = time.monotonic()
    assert [limiter.allow("ana") for _ in range(3)] == [True, True, False]
    # Tras el primer fallo no vuelve a intentar con Redis por un rato: nada de esperas.
    assert time.monotonic() - start < 2


def test_build_follows_the_cache_backend() -> None:
    assert isinstance(build_rate_limiter("memory", 5, 60, None, ""), MemoryRateLimiter)
    shared = build_rate_limiter("redis", 5, 60, "redis://x:6379/0", "n:")
    assert isinstance(shared, RedisRateLimiter)
    # Sin URL de Redis, en memoria (la caché tampoco arrancaría con redis sin URL).
    assert isinstance(build_rate_limiter("redis", 5, 60, None, ""), MemoryRateLimiter)
