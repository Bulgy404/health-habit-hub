"""Unit tests for POST /api/v1/llm/refine-translation."""
from unittest.mock import AsyncMock, patch

import pytest
from httpx import ASGITransport, AsyncClient

from main import app


@pytest.mark.asyncio
async def test_refine_translation_returns_refined_output():
    """LLM refinement is returned as refined_translation."""
    refined = "Every morning I go for a run to start my day."

    with patch("routers.refine_translation.chat_complete", new=AsyncMock(return_value=refined)):
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            resp = await client.post(
                "/api/v1/llm/refine-translation",
                json={
                    "original": "Ich gehe jeden Morgen laufen.",
                    "raw_translation": "I go every morning running.",
                    "language": "de",
                },
            )

    assert resp.status_code == 200
    data = resp.json()
    assert data["refined_translation"] == refined
    # Must differ from the bad literal translation
    assert data["refined_translation"] != "I go every morning running."


@pytest.mark.asyncio
async def test_refine_translation_falls_back_to_raw_on_empty_llm():
    """Empty LLM response causes raw_translation to be returned as fallback."""
    raw_translation = "I go every morning running."

    with patch("routers.refine_translation.chat_complete", new=AsyncMock(return_value="")):
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            resp = await client.post(
                "/api/v1/llm/refine-translation",
                json={
                    "original": "Ich gehe jeden Morgen laufen.",
                    "raw_translation": raw_translation,
                    "language": "de",
                },
            )

    assert resp.status_code == 200
    data = resp.json()
    assert data["refined_translation"] == raw_translation
