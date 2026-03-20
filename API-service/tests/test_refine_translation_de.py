"""Unit tests for POST /api/v1/llm/refine-translation-de."""
from unittest.mock import AsyncMock, patch

import pytest
from httpx import ASGITransport, AsyncClient

from main import app


@pytest.mark.asyncio
async def test_refine_translation_de_returns_refined_german():
    """LLM refinement is returned as refined German translation."""
    refined = "Jeden Morgen gehe ich laufen."

    with patch("routers.refine_translation_de.chat_complete", new=AsyncMock(return_value=refined)):
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            resp = await client.post(
                "/api/v1/llm/refine-translation-de",
                json={
                    "original": "I go for a run every morning.",
                    "raw_translation": "Ich gehe jeden Morgen laufen.",
                },
            )

    assert resp.status_code == 200
    data = resp.json()
    assert data["refined_translation"] == refined
    assert data["refined_translation"] != "Ich gehe jeden Morgen laufen."


@pytest.mark.asyncio
async def test_refine_translation_de_falls_back_to_raw_on_empty_llm():
    """Empty LLM response causes raw_translation to be returned as fallback."""
    raw_translation = "Ich gehe jeden Morgen laufen."

    with patch("routers.refine_translation_de.chat_complete", new=AsyncMock(return_value="")):
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            resp = await client.post(
                "/api/v1/llm/refine-translation-de",
                json={
                    "original": "I go for a run every morning.",
                    "raw_translation": raw_translation,
                },
            )

    assert resp.status_code == 200
    data = resp.json()
    assert data["refined_translation"] == raw_translation
