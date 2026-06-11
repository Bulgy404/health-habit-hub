"""UC-30 — Tests for the knowledge-mcp tool handlers (search_knowledge, ingest_document).

The FastMCP tool decorator wraps the handlers, so tests unwrap via `.fn`
(FastMCP >= 2) with a fallback to the bare function. LightRAG is mocked
with respx — no live services required.

Run from knowledge-mcp/:  python -m pytest
"""
import json
import os
import sys

import httpx
import pytest
import respx

# Environment must be set before the server module reads it at import time.
os.environ["LIGHTRAG_URL"] = "http://lightrag.test:9621"
os.environ["LIGHTRAG_API_KEY"] = "test-key"

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import server  # noqa: E402


def _unwrap(tool):
    """Return the underlying coroutine function of a FastMCP tool."""
    return getattr(tool, "fn", tool)


search_knowledge = _unwrap(server.search_knowledge)
ingest_document = _unwrap(server.ingest_document)


# ---------------------------------------------------------------------------
# search_knowledge
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
@respx.mock
async def test_search_knowledge_returns_lightrag_context():
    route = respx.post("http://lightrag.test:9621/query").mock(
        return_value=httpx.Response(200, json={"response": "sleep improves recovery"})
    )

    result = await search_knowledge("how does sleep affect recovery?")

    assert result == "sleep improves recovery"
    request = route.calls.last.request
    body = json.loads(request.read())
    assert body["mode"] == "hybrid"  # default mode
    assert body["only_need_context"] is True
    assert request.headers["Authorization"] == "Bearer test-key"


@pytest.mark.asyncio
@respx.mock
async def test_search_knowledge_passes_custom_mode():
    route = respx.post("http://lightrag.test:9621/query").mock(
        return_value=httpx.Response(200, json={"response": "ctx"})
    )

    await search_knowledge("query", mode="local")

    assert json.loads(route.calls.last.request.read())["mode"] == "local"


@pytest.mark.asyncio
@respx.mock
async def test_search_knowledge_empty_response_returns_empty_string():
    respx.post("http://lightrag.test:9621/query").mock(
        return_value=httpx.Response(200, json={"response": None})
    )

    assert await search_knowledge("anything") == ""


@pytest.mark.asyncio
@respx.mock
async def test_search_knowledge_raises_on_lightrag_error():
    respx.post("http://lightrag.test:9621/query").mock(
        return_value=httpx.Response(500, json={"detail": "boom"})
    )

    with pytest.raises(httpx.HTTPStatusError):
        await search_knowledge("anything")


# ---------------------------------------------------------------------------
# ingest_document
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
@respx.mock
async def test_ingest_document_posts_text_with_doc_id():
    route = respx.post("http://lightrag.test:9621/documents/text").mock(
        return_value=httpx.Response(200, json={"message": "queued for indexing"})
    )

    result = await ingest_document("Walking daily builds habit strength.", "walking-note")

    assert result == "queued for indexing"
    body = route.calls.last.request.read().decode()
    assert "Walking daily builds habit strength." in body
    assert "walking-note" in body


@pytest.mark.asyncio
@respx.mock
async def test_ingest_document_falls_back_to_status_field():
    respx.post("http://lightrag.test:9621/documents/text").mock(
        return_value=httpx.Response(200, json={"status": "ok"})
    )

    assert await ingest_document("text", "doc-1") == "ok"


@pytest.mark.asyncio
@respx.mock
async def test_ingest_document_raises_on_lightrag_error():
    respx.post("http://lightrag.test:9621/documents/text").mock(
        return_value=httpx.Response(502, json={"detail": "down"})
    )

    with pytest.raises(httpx.HTTPStatusError):
        await ingest_document("text", "doc-1")
