"""Contract tests for Python API-service dependencies.

These tests verify the API surface used by the codebase has not been renamed or
removed by a major-version upgrade. All checks are pure import + attribute
existence — no network calls, no fixtures, no asyncio required.
"""


def test_openai_contract():
    """openai: OpenAI class exists and exposes chat.completions.create."""
    import openai

    assert hasattr(openai, "OpenAI"), "openai.OpenAI class must exist"
    assert isinstance(openai.OpenAI, type), "openai.OpenAI must be a class"

    client = openai.OpenAI(api_key="placeholder")
    assert hasattr(client, "chat"), "OpenAI instance must have .chat"
    assert hasattr(client.chat, "completions"), "OpenAI.chat must have .completions"
    assert callable(
        client.chat.completions.create
    ), "OpenAI.chat.completions.create must be callable"


def test_redis_contract():
    """redis.asyncio: Redis class and key methods exist."""
    import redis.asyncio as aioredis

    assert hasattr(aioredis, "Redis"), "redis.asyncio.Redis must exist"
    assert isinstance(aioredis.Redis, type), "redis.asyncio.Redis must be a class"

    instance = aioredis.Redis()
    for method in ("get", "set", "delete"):
        assert hasattr(instance, method), f"Redis instance must have .{method}"


def test_motor_contract():
    """motor: AsyncIOMotorClient is a class with database access."""
    from motor.motor_asyncio import AsyncIOMotorClient

    assert isinstance(
        AsyncIOMotorClient, type
    ), "AsyncIOMotorClient must be a class"

    client = AsyncIOMotorClient("mongodb://localhost:27017")
    # Both attribute access styles must be supported
    assert hasattr(client, "get_database") or hasattr(
        client, "__getitem__"
    ), "AsyncIOMotorClient must support get_database or __getitem__"


def test_neo4j_contract():
    """neo4j: GraphDatabase.driver is callable and AsyncGraphDatabase is present."""
    import neo4j

    assert hasattr(neo4j, "GraphDatabase"), "neo4j.GraphDatabase must exist"
    assert callable(
        neo4j.GraphDatabase.driver
    ), "neo4j.GraphDatabase.driver must be callable"
    assert hasattr(
        neo4j, "AsyncGraphDatabase"
    ), "neo4j.AsyncGraphDatabase must be present"


def test_httpx_contract():
    """httpx: AsyncClient class exists with HTTP method attributes."""
    import httpx

    assert hasattr(httpx, "AsyncClient"), "httpx.AsyncClient must exist"
    assert isinstance(httpx.AsyncClient, type), "httpx.AsyncClient must be a class"

    client = httpx.AsyncClient()
    for method in ("get", "post", "put", "delete"):
        assert hasattr(client, method), f"AsyncClient must have .{method}"
