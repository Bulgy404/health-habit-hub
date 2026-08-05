"""Pytest configuration for API-service tests."""

from collections.abc import Generator
from unittest.mock import MagicMock

import pytest

import alerting
from auth import verify_service_token
from deps import get_mongo_db, get_redis
from main import app


@pytest.fixture(autouse=True)
def no_real_alert_emails(request: pytest.FixtureRequest, monkeypatch: pytest.MonkeyPatch) -> None:
    """Prevent tests from sending real alert emails.

    llm_client.py's circuit-breaker tests (tests/test_llm_client.py) deliberately
    simulate LLM outages with fake model names and errors to exercise
    fire_alert_email() — but that function does a real smtplib send whenever
    SMTP_HOST/SMTP_USER/SMTP_PASS/ALERT_EMAIL are set, which they are in the
    repo's real .env. `make test-python`/`make test` source that .env before
    running pytest, so without this fixture every test run emails the real
    ALERT_EMAIL inbox with fake "primary-model"/"boom" outage alerts. Patching
    send_alert_email() (not fire_alert_email()) covers it regardless of which
    module ends up calling it.

    Skipped for test_alerting.py itself: those tests exercise send_alert_email
    directly and already mock smtplib.SMTP/SMTP_SSL + use fake env vars, so
    they never touch the network either — replacing the function under test
    would just break them.
    """
    if request.node.fspath.basename == "test_alerting.py":
        return
    monkeypatch.setattr(alerting, "send_alert_email", MagicMock())


@pytest.fixture(autouse=True)
def bypass_service_auth() -> Generator[None, None, None]:
    """Disable service-to-service auth for in-process API tests only."""
    async def _test_redis():
        return None

    async def _test_mongo_db():
        return None

    app.dependency_overrides[verify_service_token] = lambda: None
    app.dependency_overrides[get_redis] = _test_redis
    app.dependency_overrides[get_mongo_db] = _test_mongo_db
    try:
        yield
    finally:
        app.dependency_overrides.pop(verify_service_token, None)
        app.dependency_overrides.pop(get_redis, None)
        app.dependency_overrides.pop(get_mongo_db, None)
