"""Unit tests for POST /api/v1/llm/embed-batch."""
from unittest.mock import AsyncMock, patch

import pytest
from httpx import ASGITransport, AsyncClient

from main import app


@pytest.mark.asyncio
async def test_returns_embeddings_in_order():
    """Returns one embedding per input text, in the same order."""
    fake_embeddings = [[0.1, 0.2], [0.3, 0.4], [0.5, 0.6]]

    with patch("routers.embed_habit.embed_texts", new=AsyncMock(return_value=fake_embeddings)):
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            resp = await client.post(
                "/api/v1/llm/embed-batch",
                json={"texts": ["habit sentence", "context phrase", "BCIO label"]},
            )

    assert resp.status_code == 200
    data = resp.json()
    assert data["embeddings"] == fake_embeddings
    assert len(data["embeddings"]) == 3


@pytest.mark.asyncio
async def test_single_text_returns_single_embedding():
    """A single text produces a single embedding."""
    with patch("routers.embed_habit.embed_texts", new=AsyncMock(return_value=[[0.9, 0.8]])):
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            resp = await client.post(
                "/api/v1/llm/embed-batch",
                json={"texts": ["I go for a morning run"]},
            )

    assert resp.status_code == 200
    assert len(resp.json()["embeddings"]) == 1


@pytest.mark.asyncio
async def test_empty_texts_returns_422():
    """An empty texts list is rejected by validation."""
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        resp = await client.post(
            "/api/v1/llm/embed-batch",
            json={"texts": []},
        )

    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_embed_texts_called_with_all_inputs():
    """embed_texts is called with the exact list of texts provided."""
    mock_embed = AsyncMock(return_value=[[0.1], [0.2], [0.3], [0.4]])

    with patch("routers.embed_habit.embed_texts", new=mock_embed):
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            texts = ["habit", "ctx_time", "ctx_behavior", "BCIO:physical_activity"]
            await client.post("/api/v1/llm/embed-batch", json={"texts": texts})

    mock_embed.assert_called_once_with(texts)
