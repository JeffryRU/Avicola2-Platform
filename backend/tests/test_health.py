from fastapi.testclient import TestClient
from sqlalchemy.exc import OperationalError

from app.db.session import get_session
from app.main import app


class _FakeSession:
    def __init__(self, fail: bool) -> None:
        self.fail = fail

    def execute(self, *_args, **_kwargs):
        if self.fail:
            raise OperationalError("SELECT 1", {}, Exception("down"))


def _client(fail: bool) -> TestClient:
    app.dependency_overrides[get_session] = lambda: _FakeSession(fail)
    return TestClient(app)


def test_health_ok() -> None:
    response = _client(fail=False).get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "database": "ok"}


def test_health_db_down() -> None:
    response = _client(fail=True).get("/health")
    assert response.status_code == 503
    assert response.json()["database"] == "unreachable"
