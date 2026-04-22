"""Pytest configuration for API-service tests."""

from collections.abc import Generator

import pytest

from auth import verify_service_token
from deps import get_mongo_db, get_redis
from main import app


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
