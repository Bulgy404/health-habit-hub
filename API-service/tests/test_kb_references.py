"""BibLaTeX citations for knowledge-base papers, and per-study scoping of them.

Two things used to be manual and are not any more: a paper's citation had to be
hand-written into ``data/references.json`` after uploading the PDF, and every
study drew on every indexed document whether or not it was relevant to that
study's design.
"""
import io
from typing import Any

import pytest
import respx
from httpx import ASGITransport, AsyncClient, Response

from bibtex import BibtexError, parse_entry
from deps import get_mongo_db
from main import app

_LIGHTRAG = "http://lightrag:9621"

REAL_ENTRY = """@article{elsheikhExploringFearHumanrobot2025b,
  title = {Exploring Fear in Human-Robot Interaction: A Scoping Review of Older Adults' Experiences with Social Robots},
  shorttitle = {Exploring Fear in Human-Robot Interaction},
  author = {Elsheikh, Ahmed and Al-Thani, Dena and Othman, Achraf},
  date = {2025},
  journaltitle = {Frontiers in robotics and AI},
  volume = {12},
  pages = {1626471},
  issn = {2296-9144},
  doi = {10.3389/frobt.2025.1626471},
  abstract = {BACKGROUND: As global populations age, healthcare systems face pressure.},
  keywords = {anxiety,fear of robots,older adults},
  file = {/Users/felixreinsch/Zotero/storage/8UGX4Q74/Elsheikh et al. - 2025 - Exploring fear.pdf}
}"""


# ---------------------------------------------------------------------------
# A Mongo double: only the handful of operations these endpoints perform.
# ---------------------------------------------------------------------------
class _FakeCollection:
    def __init__(self, rows: list[dict[str, Any]]):
        self.rows = rows

    def find(self, _filter: dict[str, Any] | None = None):
        rows = list(self.rows)

        class _Cursor:
            def __aiter__(self):
                async def gen():
                    for row in rows:
                        yield row

                return gen()

        return _Cursor()

    async def find_one(self, flt: dict[str, Any], _projection=None):
        for row in self.rows:
            if all(row.get(k) == v for k, v in flt.items()):
                return row
        return None

    async def replace_one(self, flt: dict[str, Any], doc: dict[str, Any], upsert=False):
        for i, row in enumerate(self.rows):
            if all(row.get(k) == v for k, v in flt.items()):
                self.rows[i] = doc
                return
        if upsert:
            self.rows.append(doc)

    async def delete_one(self, flt: dict[str, Any]):
        self.rows[:] = [
            r for r in self.rows if not all(r.get(k) == v for k, v in flt.items())
        ]


class _FakeDb:
    def __init__(self):
        self.collections: dict[str, _FakeCollection] = {}

    def __getitem__(self, name: str) -> _FakeCollection:
        return self.collections.setdefault(name, _FakeCollection([]))


@pytest.fixture
def fake_db():
    db = _FakeDb()

    async def _db():
        return db

    app.dependency_overrides[get_mongo_db] = _db
    try:
        yield db
    finally:
        app.dependency_overrides.pop(get_mongo_db, None)


def _client():
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


# ---------------------------------------------------------------------------
# Parsing
# ---------------------------------------------------------------------------
def test_parses_a_real_zotero_entry():
    ref = parse_entry(REAL_ENTRY)
    assert ref["citeKey"] == "elsheikhExploringFearHumanrobot2025b"
    assert ref["authors"] == "Elsheikh et al."
    assert ref["year"] == "2025"
    assert ref["title"].startswith("Exploring Fear in Human-Robot Interaction")
    assert ref["url"] == "https://doi.org/10.3389/frobt.2025.1626471"


def test_commas_inside_a_field_do_not_split_it():
    # The author list and the keywords both contain commas; a naive split on
    # "," loses most of the entry.
    ref = parse_entry(REAL_ENTRY)
    assert "Al-Thani" not in ref["title"]
    assert ref["fields"]["keywords"] == "anxiety,fear of robots,older adults"


def test_does_not_keep_the_uploader_local_file_path():
    # `file` points at somebody's Zotero directory and has no business in a
    # shared database.
    assert "file" not in parse_entry(REAL_ENTRY)["fields"]


@pytest.mark.parametrize(
    "authors,expected",
    [
        ("{Wood, Wendy}", "Wood"),
        ("{Wood, Wendy and Rünger, Dennis}", "Wood and Rünger"),
        ("{Wood, W. and Rünger, D. and Neal, D.}", "Wood et al."),
        ("{Wendy Wood}", "Wood"),
    ],
)
def test_author_lists_read_the_way_a_citation_does(authors, expected):
    entry = "@article{k, title = {T}, author = " + authors + ", date = {2016}}"
    assert parse_entry(entry)["authors"] == expected


def test_a_doi_becomes_the_link_and_a_missing_one_is_never_guessed():
    with_doi = parse_entry("@article{k, title = {T}, doi = {10.1/xyz}, date = {2020}}")
    assert with_doi["url"] == "https://doi.org/10.1/xyz"
    without = parse_entry("@article{k, title = {T}, date = {2020}}")
    assert without["url"] == ""


@pytest.mark.parametrize("text", ["", "   ", "not a bibtex entry at all", "@article{k,}"])
def test_unreadable_pastes_are_refused_rather_than_half_parsed(text):
    with pytest.raises(BibtexError):
        parse_entry(text)


# ---------------------------------------------------------------------------
# Upload
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_uploading_with_a_bibtex_entry_records_the_citation(fake_db):
    with respx.mock(base_url=_LIGHTRAG) as mock:
        mock.post("/documents/upload").mock(return_value=Response(200, json={}))
        async with _client() as client:
            resp = await client.post(
                "/api/v1/kb",
                files={"file": ("paper.pdf", io.BytesIO(b"%PDF-1.4"), "application/pdf")},
                data={"bibtex": REAL_ENTRY},
            )

    assert resp.status_code == 201
    stored = fake_db["kb_references"].rows
    assert len(stored) == 1
    assert stored[0]["filename"] == "paper.pdf"
    assert stored[0]["authors"] == "Elsheikh et al."


@pytest.mark.asyncio
async def test_a_malformed_entry_is_refused_before_anything_is_indexed(fake_db):
    # Otherwise the paper lands in LightRAG while the admin is still working
    # out what was wrong with their paste.
    with respx.mock(base_url=_LIGHTRAG, assert_all_called=False) as mock:
        route = mock.post("/documents/upload").mock(return_value=Response(200, json={}))
        async with _client() as client:
            resp = await client.post(
                "/api/v1/kb",
                files={"file": ("paper.pdf", io.BytesIO(b"%PDF-1.4"), "application/pdf")},
                data={"bibtex": "this is not a bibtex entry"},
            )

    assert resp.status_code == 400
    assert not route.called, "nothing should have been indexed"
    assert fake_db["kb_references"].rows == []


@pytest.mark.asyncio
async def test_uploading_without_a_citation_still_works(fake_db):
    # Papers indexed before the tab could take a citation must keep working.
    with respx.mock(base_url=_LIGHTRAG) as mock:
        mock.post("/documents/upload").mock(return_value=Response(200, json={}))
        async with _client() as client:
            resp = await client.post(
                "/api/v1/kb",
                files={"file": ("paper.pdf", io.BytesIO(b"%PDF-1.4"), "application/pdf")},
            )

    assert resp.status_code == 201
    assert fake_db["kb_references"].rows == []


# ---------------------------------------------------------------------------
# Listing and deletion
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_the_listing_carries_the_curated_citation(fake_db):
    fake_db["kb_references"].rows.append(
        {
            "filename": "paper.pdf",
            "authors": "Elsheikh et al.",
            "year": "2025",
            "title": "Exploring Fear",
            "url": "https://doi.org/10.3389/frobt.2025.1626471",
        }
    )
    with respx.mock(base_url=_LIGHTRAG) as mock:
        mock.get("/documents").mock(
            return_value=Response(
                200,
                json={
                    "statuses": {
                        "processed": [
                            {
                                "id": "d1",
                                "file_path": "paper.pdf",
                                "status": "processed",
                                "content_length": 10,
                                "created_at": "2026-01-01",
                            }
                        ]
                    }
                },
            )
        )
        async with _client() as client:
            resp = await client.get("/api/v1/kb")

    entry = resp.json()[0]
    assert entry["citation"] == "Elsheikh et al. (2025) — Exploring Fear"
    assert entry["url"].startswith("https://doi.org/")
    assert entry["has_reference"] is True


@pytest.mark.asyncio
async def test_deleting_a_paper_drops_its_citation(fake_db):
    fake_db["kb_references"].rows.append({"filename": "paper.pdf", "title": "T"})
    with respx.mock(base_url=_LIGHTRAG) as mock:
        mock.get("/documents").mock(
            return_value=Response(
                200,
                json={"statuses": {"processed": [{"id": "d1", "file_path": "paper.pdf"}]}},
            )
        )
        mock.delete("/documents/delete_document").mock(
            return_value=Response(200, json={})
        )
        async with _client() as client:
            resp = await client.delete("/api/v1/kb/paper.pdf")

    assert resp.status_code == 200
    assert fake_db["kb_references"].rows == [], "a stale citation a re-upload would inherit"


# ---------------------------------------------------------------------------
# Per-study scoping
# ---------------------------------------------------------------------------
def _query_data(payload: dict[str, Any]) -> Response:
    return Response(200, json={"status": "success", "data": payload})


@pytest.mark.asyncio
async def test_an_unscoped_study_uses_the_original_query_untouched(fake_db):
    # The general study's prompt is what every recommendation to date has been
    # grounded on; scoping must not quietly re-derive it.
    with respx.mock(base_url=_LIGHTRAG, assert_all_called=False) as mock:
        plain = mock.post("/query").mock(
            return_value=Response(200, json={"response": "context from wood-2016.pdf"})
        )
        structured = mock.post("/query/data").mock(return_value=_query_data({}))
        async with _client() as client:
            resp = await client.post(
                "/api/v1/llm/retrieve", json={"rag_query": "habit formation"}
            )

    assert resp.status_code == 200
    assert plain.called
    assert not structured.called


@pytest.mark.asyncio
async def test_a_scoped_study_drops_evidence_from_papers_it_may_not_use(fake_db):
    with respx.mock(base_url=_LIGHTRAG) as mock:
        mock.post("/query/data").mock(
            return_value=_query_data(
                {
                    "chunks": [
                        {"content": "allowed chunk", "file_path": "allowed.pdf"},
                        {"content": "excluded chunk", "file_path": "excluded.pdf"},
                    ],
                    "entities": [
                        {"entity_name": "Habit", "description": "d", "file_path": "allowed.pdf"},
                        {"entity_name": "Robot", "description": "d", "file_path": "excluded.pdf"},
                    ],
                    "relationships": [],
                    "references": [
                        {"reference_id": "1", "file_path": "allowed.pdf"},
                        {"reference_id": "2", "file_path": "excluded.pdf"},
                    ],
                }
            )
        )
        async with _client() as client:
            resp = await client.post(
                "/api/v1/llm/retrieve",
                json={"rag_query": "habit formation", "allowed_files": ["allowed.pdf"]},
            )

    data = resp.json()
    assert "allowed chunk" in data["context"]
    assert "excluded chunk" not in data["context"]
    assert "Robot" not in data["context"]
    assert [s["filename"] for s in data["sources"]] == ["allowed.pdf"]


@pytest.mark.asyncio
async def test_an_entity_merged_across_papers_survives_if_any_source_is_allowed(fake_db):
    # LightRAG joins every contributing document into one file_path on a merged
    # entity. It genuinely is evidence from the allowed paper, even though
    # others describe it too.
    with respx.mock(base_url=_LIGHTRAG) as mock:
        mock.post("/query/data").mock(
            return_value=_query_data(
                {
                    "entities": [
                        {
                            "entity_name": "Habit",
                            "description": "d",
                            "file_path": "excluded.pdf<SEP>allowed.pdf",
                        }
                    ],
                    "chunks": [],
                    "relationships": [],
                    "references": [],
                }
            )
        )
        async with _client() as client:
            resp = await client.post(
                "/api/v1/llm/retrieve",
                json={"rag_query": "habits", "allowed_files": ["allowed.pdf"]},
            )

    assert "Habit" in resp.json()["context"]


@pytest.mark.asyncio
async def test_a_study_scoped_to_nothing_does_not_call_lightrag_at_all(fake_db):
    with respx.mock(base_url=_LIGHTRAG, assert_all_called=False) as mock:
        structured = mock.post("/query/data").mock(return_value=_query_data({}))
        plain = mock.post("/query").mock(return_value=Response(200, json={"response": "x"}))
        async with _client() as client:
            resp = await client.post(
                "/api/v1/llm/retrieve",
                json={"rag_query": "habits", "allowed_files": []},
            )

    assert resp.json() == {"sources": [], "context": ""}
    assert not structured.called and not plain.called
