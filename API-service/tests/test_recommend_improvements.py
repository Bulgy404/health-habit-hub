"""Tests for suggested cues, previous-title history, and speed knobs."""
import json
from contextlib import ExitStack
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from httpx import ASGITransport, AsyncClient

from main import app
from routers.recommend import _fetch_previous_titles

_LLM_REPLY = json.dumps(
    {
        "recommendations": [
            {
                "title": "Abends spazieren gehen",
                "body": "Gehe jeden Abend 20 Minuten spazieren.",
                "rationale": "Bewegung verbessert den Schlaf (Wood und Rünger, 2016).",
                "suggested_cue": "nachdem ich das Abendessen beendet habe",
                "selected_habit_uuids": [],
                "sources": [],
            }
        ]
    }
)


def _patches(llm_mock):
    from routers.retrieve import RetrieveResponse

    return (
        patch("routers.recommend._get_redis", new=AsyncMock(return_value=None)),
        patch("routers.recommend._vector_search_user_habits", new=AsyncMock(return_value=[])),
        patch("routers.recommend._vector_search_habits", new=AsyncMock(return_value=[])),
        patch("routers.recommend._fetch_all_questionnaire_responses", new=AsyncMock(return_value={})),
        patch("routers.recommend._fetch_user_profile", new=AsyncMock(return_value=None)),
        patch("routers.recommend._fetch_annotated_habits", new=AsyncMock(return_value=[])),
        patch("routers.recommend._fetch_prior_feedback", new=AsyncMock(return_value=[])),
        patch("routers.recommend._fetch_previous_titles", new=AsyncMock(return_value=["Morgens joggen"])),
        patch("routers.recommend._rerank_habits", new=AsyncMock(return_value=[])),
        patch("routers.recommend._fetch_bcio_concepts", new=AsyncMock(return_value={})),
        patch("routers.recommend._get_neo4j_driver", new=AsyncMock(return_value=MagicMock())),
        patch(
            "routers.recommend._retrieve",
            new=AsyncMock(return_value=RetrieveResponse(sources=[], context="ctx")),
        ),
        patch("routers.recommend._store_recommendation", new=AsyncMock()),
        patch("routers.recommend.chat_complete", new=llm_mock),
    )


async def _post(client, goal="besser schlafen"):
    return await client.post(
        "/api/v1/llm/recommend",
        json={"user_id": "u1", "goal": goal, "session_id": "s1"},
    )


@pytest.mark.asyncio
async def test_suggested_cue_in_response_and_previous_titles_in_prompt():
    captured: list = []

    async def mock_llm(messages, **kwargs):
        captured.extend(messages)
        captured.append(kwargs)
        return _LLM_REPLY

    with ExitStack() as stack:
        for p in _patches(mock_llm):
            stack.enter_context(p)
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            resp = await _post(client)

    assert resp.status_code == 200
    rec = resp.json()["recommendations"][0]
    assert rec["suggested_cue"] == "nachdem ich das Abendessen beendet habe"

    user_prompt = next(m["content"] for m in captured if isinstance(m, dict) and m.get("role") == "user")
    # Previous titles are fed back to avoid repetition.
    assert "Morgens joggen" in user_prompt
    assert "PREVIOUSLY RECOMMENDED" in user_prompt
    # Language rule present.
    assert "same language as the USER GOAL" in user_prompt


@pytest.mark.asyncio
async def test_context_cap_truncates_prompt(monkeypatch):
    captured: list = []

    async def mock_llm(messages, **kwargs):
        captured.extend(messages)
        return _LLM_REPLY

    from routers.retrieve import RetrieveResponse

    monkeypatch.setattr("routers.recommend._MAX_CONTEXT_CHARS", 100)
    long_context = "x" * 5000
    with ExitStack() as stack:
        for p in _patches(mock_llm):
            stack.enter_context(p)
        stack.enter_context(
            patch(
                "routers.recommend._retrieve",
                new=AsyncMock(return_value=RetrieveResponse(sources=[], context=long_context)),
            )
        )
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            resp = await _post(client)

    assert resp.status_code == 200
    user_prompt = next(m["content"] for m in captured if m.get("role") == "user")
    assert "…[context truncated]" in user_prompt
    assert "x" * 101 not in user_prompt


@pytest.mark.asyncio
async def test_fetch_previous_titles_dedupes_and_caps():
    class FakeCursor:
        def __init__(self, docs):
            self._docs = docs

        def sort(self, *_):
            return self

        def limit(self, *_):
            return self

        def __aiter__(self):
            self._it = iter(self._docs)
            return self

        async def __anext__(self):
            try:
                return next(self._it)
            except StopIteration:
                raise StopAsyncIteration from None

    docs = [
        {"recommendations": [{"title": "Walk daily"}, {"title": "walk daily"}]},
        {"recommendations": [{"title": "Sleep early"}, {"title": ""}]},
    ]
    db = MagicMock()
    db.__getitem__.return_value.find.return_value = FakeCursor(docs)

    titles = await _fetch_previous_titles("u1", db)
    assert titles == ["Walk daily", "Sleep early"]
