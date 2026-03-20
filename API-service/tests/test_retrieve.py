"""Unit tests for POST /api/v1/llm/retrieve and /api/v1/kb CRUD."""
import io
import json
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from httpx import ASGITransport, AsyncClient

import routers.retrieve as retrieve_module
from main import app


# ---------------------------------------------------------------------------
# Helper: unit vectors
# ---------------------------------------------------------------------------
def _unit_vec(n: int, idx: int) -> list:
    v = [0.0] * n
    v[idx] = 1.0
    return v


# ---------------------------------------------------------------------------
# Fixture: reset in-memory index between tests
# ---------------------------------------------------------------------------
@pytest.fixture(autouse=True)
def reset_index():
    """Clear the in-memory index and file_hashes before each test."""
    retrieve_module._INDEX["chunks"] = []
    retrieve_module._INDEX["file_hashes"] = {}
    yield
    retrieve_module._INDEX["chunks"] = []
    retrieve_module._INDEX["file_hashes"] = {}


# ---------------------------------------------------------------------------
# Tests: POST /api/v1/llm/retrieve
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_retrieve_returns_sources_ranked_by_score():
    """Pre-populated index returns top-k sources ranked by cosine similarity."""
    # Two chunks: one matching the query (idx 0), one orthogonal (idx 1)
    retrieve_module._INDEX["chunks"] = [
        {
            "filename": "sleep_study.pdf",
            "category": "sleep",
            "excerpt": "Regular sleep improves physical recovery.",
            "embedding": _unit_vec(4, 0),  # cosine sim = 1.0 with query
            "file_hash": "abc",
        },
        {
            "filename": "nutrition.pdf",
            "category": "diet",
            "excerpt": "A balanced diet reduces inflammation.",
            "embedding": _unit_vec(4, 1),  # cosine sim = 0.0 with query
            "file_hash": "def",
        },
    ]
    retrieve_module._INDEX["file_hashes"] = {
        "sleep_study.pdf": "abc",
        "nutrition.pdf": "def",
    }

    query_embedding = _unit_vec(4, 0)  # identical to first chunk

    with (
        patch("routers.retrieve._ensure_index", new=AsyncMock()),
        patch(
            "routers.retrieve._embed_texts",
            new=AsyncMock(return_value=[query_embedding]),
        ),
    ):
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            resp = await client.post(
                "/api/v1/llm/retrieve",
                json={"rag_query": "sleep improvement interventions"},
            )

    assert resp.status_code == 200
    data = resp.json()
    assert "sources" in data
    sources = data["sources"]
    assert len(sources) == 2
    # First result must be the matching chunk
    assert sources[0]["filename"] == "sleep_study.pdf"
    assert sources[0]["category"] == "sleep"
    assert sources[0]["score"] == pytest.approx(1.0, abs=0.001)
    assert sources[1]["score"] == pytest.approx(0.0, abs=0.001)


@pytest.mark.asyncio
async def test_retrieve_empty_kb_returns_empty_sources():
    """When the knowledge base is empty, sources list is empty."""
    with (
        patch("routers.retrieve._ensure_index", new=AsyncMock()),
        patch("routers.retrieve._embed_texts", new=AsyncMock()),
    ):
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            resp = await client.post(
                "/api/v1/llm/retrieve",
                json={"rag_query": "any query"},
            )

    assert resp.status_code == 200
    assert resp.json()["sources"] == []


@pytest.mark.asyncio
async def test_retrieve_top_k_limits_results():
    """Only top-k results are returned when the index has more chunks."""
    # 10 chunks, all identical embeddings (score = 1.0 each)
    retrieve_module._INDEX["chunks"] = [
        {
            "filename": f"paper_{i}.pdf",
            "category": "general",
            "excerpt": f"Excerpt {i}",
            "embedding": _unit_vec(4, 0),
            "file_hash": f"hash_{i}",
        }
        for i in range(10)
    ]
    retrieve_module._INDEX["file_hashes"] = {f"paper_{i}.pdf": f"hash_{i}" for i in range(10)}

    with (
        patch("routers.retrieve._ensure_index", new=AsyncMock()),
        patch(
            "routers.retrieve._embed_texts",
            new=AsyncMock(return_value=[_unit_vec(4, 0)]),
        ),
        patch("routers.retrieve._TOP_K", 3),
    ):
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            resp = await client.post(
                "/api/v1/llm/retrieve",
                json={"rag_query": "test"},
            )

    assert resp.status_code == 200
    assert len(resp.json()["sources"]) == 3


@pytest.mark.asyncio
async def test_retrieve_embedding_failure_returns_500():
    """When the embedding service fails, a 500 is returned."""
    retrieve_module._INDEX["chunks"] = [
        {
            "filename": "paper.pdf",
            "category": "general",
            "excerpt": "Some text.",
            "embedding": _unit_vec(4, 0),
            "file_hash": "abc",
        }
    ]
    retrieve_module._INDEX["file_hashes"] = {"paper.pdf": "abc"}

    with (
        patch("routers.retrieve._ensure_index", new=AsyncMock()),
        patch(
            "routers.retrieve._embed_texts",
            new=AsyncMock(side_effect=RuntimeError("OpenAI down")),
        ),
    ):
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            resp = await client.post(
                "/api/v1/llm/retrieve",
                json={"rag_query": "query"},
            )

    assert resp.status_code == 500
    assert "Embedding service unavailable" in resp.json()["detail"]


# ---------------------------------------------------------------------------
# Tests: GET /api/v1/kb
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_list_kb_returns_pdf_entries(tmp_path):
    """GET /kb lists all PDFs in the KB directory with correct metadata."""
    # Create a fake PDF file in a category subdir
    cat_dir = tmp_path / "sleep"
    cat_dir.mkdir()
    pdf_path = cat_dir / "sleep_study.pdf"
    pdf_path.write_bytes(b"%PDF-1.4 fake content")

    meta_dir = tmp_path / "_meta"
    meta_dir.mkdir()

    with (
        patch.object(retrieve_module, "_KB_DIR", tmp_path),
        patch.object(retrieve_module, "_META_DIR", meta_dir),
    ):
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            resp = await client.get("/api/v1/kb")

    assert resp.status_code == 200
    entries = resp.json()
    assert len(entries) == 1
    entry = entries[0]
    assert entry["filename"] == "sleep_study.pdf"
    assert entry["category"] == "sleep"
    assert entry["has_summary"] is False
    assert entry["file_size"] > 0


@pytest.mark.asyncio
async def test_list_kb_shows_summary_flag(tmp_path):
    """has_summary is True when a .summary.json exists for the file."""
    cat_dir = tmp_path / "general"
    cat_dir.mkdir()
    pdf_path = cat_dir / "paper.pdf"
    pdf_path.write_bytes(b"%PDF-1.4 content")

    meta_dir = tmp_path / "_meta"
    meta_dir.mkdir()
    (meta_dir / "paper.pdf.summary.json").write_text(
        json.dumps({"summary": "A great paper.", "filename": "paper.pdf"})
    )

    with (
        patch.object(retrieve_module, "_KB_DIR", tmp_path),
        patch.object(retrieve_module, "_META_DIR", meta_dir),
    ):
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            resp = await client.get("/api/v1/kb")

    assert resp.status_code == 200
    assert resp.json()[0]["has_summary"] is True


# ---------------------------------------------------------------------------
# Tests: POST /api/v1/kb (upload)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_upload_kb_creates_file(tmp_path):
    """POST /kb stores the uploaded PDF in the correct category directory."""
    meta_dir = tmp_path / "_meta"
    meta_dir.mkdir()

    with (
        patch.object(retrieve_module, "_KB_DIR", tmp_path),
        patch.object(retrieve_module, "_META_DIR", meta_dir),
    ):
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            resp = await client.post(
                "/api/v1/kb",
                files={"file": ("exercise.pdf", io.BytesIO(b"%PDF-1.4 exercise"), "application/pdf")},
                data={"category": "exercise"},
            )

    assert resp.status_code == 201
    assert (tmp_path / "exercise" / "exercise.pdf").exists()
    assert "exercise.pdf" in resp.json()["message"]


@pytest.mark.asyncio
async def test_upload_kb_rejects_non_pdf(tmp_path):
    """POST /kb returns 400 when a non-PDF file is uploaded."""
    meta_dir = tmp_path / "_meta"
    meta_dir.mkdir()

    with (
        patch.object(retrieve_module, "_KB_DIR", tmp_path),
        patch.object(retrieve_module, "_META_DIR", meta_dir),
    ):
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            resp = await client.post(
                "/api/v1/kb",
                files={"file": ("notes.txt", io.BytesIO(b"some text"), "text/plain")},
                data={"category": "general"},
            )

    assert resp.status_code == 400


# ---------------------------------------------------------------------------
# Tests: DELETE /api/v1/kb/{filename}
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_delete_kb_removes_file(tmp_path):
    """DELETE /kb/{filename} removes the PDF and its summary."""
    cat_dir = tmp_path / "sleep"
    cat_dir.mkdir()
    pdf_path = cat_dir / "paper.pdf"
    pdf_path.write_bytes(b"%PDF-1.4 content")

    meta_dir = tmp_path / "_meta"
    meta_dir.mkdir()
    summary_path = meta_dir / "paper.pdf.summary.json"
    summary_path.write_text(json.dumps({"summary": "Test summary."}))

    with (
        patch.object(retrieve_module, "_KB_DIR", tmp_path),
        patch.object(retrieve_module, "_META_DIR", meta_dir),
    ):
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            resp = await client.delete("/api/v1/kb/paper.pdf")

    assert resp.status_code == 200
    assert not pdf_path.exists()
    assert not summary_path.exists()


@pytest.mark.asyncio
async def test_delete_kb_not_found_returns_404(tmp_path):
    """DELETE /kb/{filename} returns 404 when the file does not exist."""
    meta_dir = tmp_path / "_meta"
    meta_dir.mkdir()

    with (
        patch.object(retrieve_module, "_KB_DIR", tmp_path),
        patch.object(retrieve_module, "_META_DIR", meta_dir),
    ):
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            resp = await client.delete("/api/v1/kb/nonexistent.pdf")

    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# Tests: POST /api/v1/kb/reindex
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_reindex_clears_and_rebuilds_index(tmp_path):
    """POST /kb/reindex resets the index and rescans the KB directory."""
    meta_dir = tmp_path / "_meta"
    meta_dir.mkdir()

    # Pre-populate index with stale data
    retrieve_module._INDEX["chunks"] = [
        {"filename": "stale.pdf", "category": "old", "excerpt": "...", "embedding": [], "file_hash": "x"}
    ]
    retrieve_module._INDEX["file_hashes"] = {"stale.pdf": "x"}

    with (
        patch.object(retrieve_module, "_KB_DIR", tmp_path),
        patch.object(retrieve_module, "_META_DIR", meta_dir),
    ):
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            resp = await client.post("/api/v1/kb/reindex")

    assert resp.status_code == 200
    assert "re-indexed" in resp.json()["message"]
    # Index should now be empty (no PDFs in tmp_path)
    assert retrieve_module._INDEX["chunks"] == []
    assert retrieve_module._INDEX["file_hashes"] == {}


# ---------------------------------------------------------------------------
# Tests: chunk_text helper
# ---------------------------------------------------------------------------


def test_chunk_text_basic():
    """_chunk_text splits long text into overlapping chunks."""
    text = "A" * 600
    chunks = retrieve_module._chunk_text(text, chunk_size=500, overlap=100)
    # First chunk: 0..500 (500 chars), second: 400..600 (200 chars, <50 → trimmed already?)
    # Actually second chunk starts at 400, goes to 900 but text ends at 600 → 200 chars
    assert len(chunks) >= 1
    assert len(chunks[0]) == 500


def test_chunk_text_filters_short():
    """Chunks shorter than 50 characters are dropped."""
    # 100 chars text, chunk_size=500 → one chunk of 100 chars ≥ 50 → kept
    short_chunks = retrieve_module._chunk_text("X" * 100)
    assert len(short_chunks) == 1

    # Very short text
    tiny_chunks = retrieve_module._chunk_text("Hi")
    assert len(tiny_chunks) == 0
