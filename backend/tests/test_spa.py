"""Cómo se sirve el build del frontend: caché, compresión y rutas de React."""

import gzip

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from hypothesis import given
from hypothesis import strategies as st

from app.shared.infrastructure.http.spa import IMMUTABLE, mount_spa

BIG_JS = ("export const x = '" + "aviplanner " * 500 + "';\n").encode()


@pytest.fixture
def dist(tmp_path):
    (tmp_path / "assets").mkdir()
    (tmp_path / "index.html").write_text("<!doctype html><title>AviPlanner</title>" + " " * 2000)
    (tmp_path / "sw.js").write_text("self.addEventListener('fetch', () => {});" * 50)
    (tmp_path / "assets" / "index-abc123.js").write_bytes(BIG_JS)
    (tmp_path / "assets" / "tiny-abc.css").write_text("a{}")
    (tmp_path / "assets" / "plex-abc.woff2").write_bytes(b"wOF2" + bytes(4000))
    (tmp_path / "secret.txt").write_text("no")
    return tmp_path


@pytest.fixture
def client(dist):
    app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)
    mount_spa(app, dist)
    return TestClient(app)


def _get(client, path, encoding="gzip"):
    # httpx descomprime solo: se pide el cuerpo crudo para ver lo que viaja.
    with client.stream("GET", path, headers={"Accept-Encoding": encoding}) as r:
        return r, b"".join(r.iter_raw())


def test_hashed_assets_are_compressed_and_cached_forever(client):
    r, raw = _get(client, "/assets/index-abc123.js")
    assert r.status_code == 200
    assert r.headers["content-encoding"] == "gzip"
    assert r.headers["cache-control"] == IMMUTABLE
    assert r.headers["vary"] == "Accept-Encoding"
    assert "javascript" in r.headers["content-type"]
    assert gzip.decompress(raw) == BIG_JS
    assert len(raw) < len(BIG_JS) / 5


def test_without_gzip_the_file_goes_as_is(client):
    for encoding in ("identity", "", "br", "gzip;q=0", "gzip; q=0.0, identity", "gzip;q=abc"):
        r, raw = _get(client, "/assets/index-abc123.js", encoding)
        assert "content-encoding" not in r.headers, encoding
        assert raw == BIG_JS
        assert r.headers["cache-control"] == IMMUTABLE


def test_index_and_service_worker_are_never_cached(client):
    for path in ("/", "/sw.js", "/registrar", "/dashboards/dia/2026-11-16"):
        r, _ = _get(client, path)
        assert r.headers["cache-control"] == "no-cache", path


def test_react_routes_fall_back_to_index(client):
    _, raw = _get(client, "/proyecciones/2026-11-16")
    assert b"AviPlanner" in gzip.decompress(raw)


def test_fonts_and_small_files_are_not_recompressed(client):
    r, raw = _get(client, "/assets/plex-abc.woff2")
    assert "content-encoding" not in r.headers
    assert r.headers["cache-control"] == IMMUTABLE
    r, raw = _get(client, "/assets/tiny-abc.css")
    assert "content-encoding" not in r.headers
    assert raw == b"a{}"


def test_api_paths_are_not_served_by_the_spa(client):
    for path in ("/api/x", "/ingest/upload", "/mcp", "/health", "/docs", "/openapi.json"):
        assert client.get(path).status_code == 404, path


def test_files_outside_the_build_are_never_served(client, dist):
    (dist.parent / "outside.txt").write_text("secreto " * 300)
    for path in ("/../outside.txt", "/assets/../../outside.txt", "/%2e%2e/outside.txt"):
        _, raw = _get(client, path)
        assert b"secreto" not in raw and b"secreto" not in gzip.decompress(raw), path


def test_head_works_for_uptime_monitors(client):
    assert client.head("/").status_code == 200
    assert client.head("/assets/index-abc123.js").status_code == 200


@given(
    st.lists(
        st.tuples(
            st.sampled_from(["gzip", "GZIP", "*", "br", "deflate", "identity", "x-gzip"]),
            st.one_of(st.none(), st.sampled_from(["0", "0.0", "0.5", "1", "1.0", "abc", ""])),
        ),
        max_size=4,
    )
)
def test_gzip_only_when_the_client_accepts_it(tmp_path_factory, codings):
    """Oráculo (RFC 9110): se comprime si algún `gzip` o `*` tiene q > 0 (sin q = 1)."""

    def quality(q):
        if q is None:
            return 1.0
        try:
            return float(q)
        except ValueError:
            return 0.0

    header = ", ".join(c if q is None else f"{c};q={q}" for c, q in codings)
    expected = any(c.lower() in ("gzip", "*") and quality(q) > 0 for c, q in codings)
    dist = tmp_path_factory.mktemp("dist")
    (dist / "assets").mkdir()
    (dist / "index.html").write_text("x")
    (dist / "assets" / "a-1.js").write_bytes(BIG_JS)
    app = FastAPI()
    mount_spa(app, dist)
    r, _ = _get(TestClient(app), "/assets/a-1.js", header)
    assert ("content-encoding" in r.headers) is expected, header
