"""Unit tests for citations.py and the paper-citation flow in /llm/recommend."""
import json
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from httpx import ASGITransport, AsyncClient

from citations import build_citation, extract_document_filenames
from main import app

# ---------------------------------------------------------------------------
# build_citation
# ---------------------------------------------------------------------------

def test_build_citation_parses_zotero_filename():
    with patch("citations._REFERENCES", {}):
        c = build_citation("Wood and Rünger - 2016 - Psychology of Habit.pdf")
    assert c["title"] == "Psychology of Habit"
    assert c["authors"] == "Wood and Rünger"
    assert c["year"] == "2016"
    assert c["citation"] == "Wood and Rünger (2016) — Psychology of Habit"
    # No curated reference — plain-text citation, no guessed link.
    assert c["url"] == ""


def test_build_citation_handles_plain_filename():
    with patch("citations._REFERENCES", {}):
        c = build_citation("sleep_hygiene_guidelines.pdf")
    assert c["title"] == "sleep_hygiene_guidelines"
    assert c["citation"] == "sleep_hygiene_guidelines"
    assert c["url"] == ""


def test_build_citation_prefers_references_json():
    with patch(
        "citations._REFERENCES",
        {"Wood and Rünger - 2016 - Psychology of Habit.pdf": {"url": "https://doi.org/10.1146/xyz"}},
    ):
        c = build_citation("Wood and Rünger - 2016 - Psychology of Habit.pdf")
    assert c["url"] == "https://doi.org/10.1146/xyz"
    assert c["title"] == "Psychology of Habit"


# ---------------------------------------------------------------------------
# extract_document_filenames
# ---------------------------------------------------------------------------

def test_extract_document_filenames_from_context():
    context = (
        "-----Sources-----\n"
        '{"content": "Habits form via repetition", "file_path": "Wood and Rünger - 2016 - Psychology of Habit.pdf"}\n'
        '{"content": "Sleep matters", "file_path": "Walker - 2017 - Why We Sleep.pdf"}\n'
        '{"content": "More on habits", "file_path": "Wood and Rünger - 2016 - Psychology of Habit.pdf"}\n'
    )
    names = extract_document_filenames(context)
    assert names == [
        "Wood and Rünger - 2016 - Psychology of Habit.pdf",
        "Walker - 2017 - Why We Sleep.pdf",
    ]


def test_extract_document_filenames_empty_when_no_files():
    assert extract_document_filenames("entities and relationships, no documents here") == []


# ---------------------------------------------------------------------------
# Endpoint: per-recommendation paper citations
# ---------------------------------------------------------------------------

_LLM_REPLY_WITH_CITATIONS = json.dumps(
    {
        "recommendations": [
            {
                "title": "Fixed bedtime",
                "body": "Go to bed at the same time daily.",
                "rationale": "Consistency strengthens habits (Wood and Rünger, 2016).",
                "selected_habit_uuids": ["uuid-1"],
                "source_filenames": ["Wood and Rünger - 2016 - Psychology of Habit.pdf"],
            },
            {
                "title": "No caffeine after 14:00",
                "body": "Skip coffee in the afternoon.",
                "rationale": "Improves sleep onset.",
                "selected_habit_uuids": [],
                "source_filenames": ["Invented - 2020 - Fake Paper.pdf"],
            },
        ]
    }
)


def _retrieve_mock_with_docs():
    from routers.retrieve import RetrieveResponse, SourceItem

    return RetrieveResponse(
        context="full lightrag context blob",
        sources=[
            SourceItem(
                filename="Wood and Rünger - 2016 - Psychology of Habit.pdf",
                category="document",
                excerpt="Wood and Rünger (2016) — Psychology of Habit",
                score=1.0,
            ),
            SourceItem(
                filename="Walker - 2017 - Why We Sleep.pdf",
                category="document",
                excerpt="Walker (2017) — Why We Sleep",
                score=1.0,
            ),
        ],
    )


@pytest.mark.asyncio
async def test_recommend_returns_paper_citations_with_links():
    refs = {
        "Wood and Rünger - 2016 - Psychology of Habit.pdf": {
            "url": "https://doi.org/10.1146/annurev-psych-122414-033417"
        }
    }
    with (
        patch("citations._REFERENCES", refs),
        patch("routers.recommend._get_redis", new=AsyncMock(return_value=None)),
        patch("routers.recommend._vector_search_user_habits", new=AsyncMock(return_value=[])),
        patch("routers.recommend._vector_search_habits", new=AsyncMock(return_value=[])),
        patch("routers.recommend._fetch_all_questionnaire_responses", new=AsyncMock(return_value={})),
        patch("routers.recommend._fetch_user_profile", new=AsyncMock(return_value=None)),
        patch("routers.recommend._fetch_annotated_habits", new=AsyncMock(return_value=[])),
        patch("routers.recommend._fetch_prior_feedback", new=AsyncMock(return_value=[])),
        patch("routers.recommend._rerank_habits", new=AsyncMock(return_value=[])),
        patch("routers.recommend._fetch_bcio_concepts", new=AsyncMock(return_value={})),
        patch("routers.recommend._get_neo4j_driver", new=AsyncMock(return_value=MagicMock())),
        patch("routers.recommend._retrieve", new=AsyncMock(return_value=_retrieve_mock_with_docs())),
        patch("routers.recommend._store_recommendation", new=AsyncMock()),
        patch("routers.recommend.chat_complete", new=AsyncMock(return_value=_LLM_REPLY_WITH_CITATIONS)),
    ):
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            resp = await client.post(
                "/api/v1/llm/recommend",
                json={"user_id": "u1", "goal": "sleep better", "session_id": "s1"},
            )

    assert resp.status_code == 200
    recs = resp.json()["recommendations"]

    # Rec 1 cited a real retrieved paper → exactly that citation, with link.
    src = recs[0]["sources"]
    assert len(src) == 1
    assert src[0]["filename"] == "Wood and Rünger - 2016 - Psychology of Habit.pdf"
    assert src[0]["title"] == "Psychology of Habit"
    # Curated DOI from references.json is used as the link.
    assert src[0]["url"] == "https://doi.org/10.1146/annurev-psych-122414-033417"
    assert src[0]["excerpt"] == "Wood and Rünger (2016) — Psychology of Habit"

    # Walker has no curated reference → plain-text citation without a link.
    walker = next(
        s for s in recs[1]["sources"] if s["filename"].startswith("Walker")
    )
    assert walker["url"] == ""
    assert walker["excerpt"] == "Walker (2017) — Why We Sleep"

    # Rec 2 cited a hallucinated filename → falls back to all retrieved papers.
    filenames = {s["filename"] for s in recs[1]["sources"]}
    assert filenames == {
        "Wood and Rünger - 2016 - Psychology of Habit.pdf",
        "Walker - 2017 - Why We Sleep.pdf",
    }

    # No graph identifiers anywhere in the client payload.
    for rec in recs:
        assert "selected_habit_uuids" not in rec
