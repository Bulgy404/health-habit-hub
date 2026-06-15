"""Tests for POST /api/v1/llm/retrieve and /api/v1/kb CRUD — LightRAG backend."""
import io

import pytest
import respx
from httpx import ASGITransport, AsyncClient, Response

from main import app

_LIGHTRAG = "http://lightrag:9621"


# ---------------------------------------------------------------------------
# Tests: POST /api/v1/llm/retrieve
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_retrieve_returns_hybrid_context():
    """retrieve returns context from LightRAG query as a single SourceItem."""
    with respx.mock(base_url=_LIGHTRAG) as mock:
        mock.post("/query").mock(
            return_value=Response(
                200,
                json={"response": "Regular sleep improves recovery and reduces inflammation."},
            )
        )

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.post(
                "/api/v1/llm/retrieve",
                json={"rag_query": "sleep improvement interventions"},
            )

    assert resp.status_code == 200
    data = resp.json()
    assert len(data["sources"]) == 1
    source = data["sources"][0]
    assert source["filename"] == "knowledge_base"
    assert source["category"] == "hybrid"
    assert "sleep" in source["excerpt"]
    assert source["score"] == pytest.approx(1.0)


@pytest.mark.asyncio
async def test_retrieve_empty_context_returns_empty_sources():
    """When LightRAG returns empty response, sources list is empty."""
    with respx.mock(base_url=_LIGHTRAG) as mock:
        mock.post("/query").mock(
            return_value=Response(200, json={"response": ""})
        )

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.post(
                "/api/v1/llm/retrieve",
                json={"rag_query": "any query"},
            )

    assert resp.status_code == 200
    assert resp.json()["sources"] == []


@pytest.mark.asyncio
async def test_retrieve_lightrag_unavailable_returns_500():
    """When LightRAG is unreachable, retrieve returns 500."""
    with respx.mock(base_url=_LIGHTRAG) as mock:
        mock.post("/query").mock(return_value=Response(500, json={"detail": "internal error"}))

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.post(
                "/api/v1/llm/retrieve",
                json={"rag_query": "query"},
            )

    assert resp.status_code == 502


# ---------------------------------------------------------------------------
# Tests: GET /api/v1/kb
# ---------------------------------------------------------------------------

_DOCS_RESPONSE = {
    "statuses": {
        "processed": [
            {
                "id": "doc-abc123",
                "file_path": "__tmp__sleep_study.pdf",
                "content_length": 20480,
                "status": "processed",
                "created_at": "2026-05-09T10:00:00+00:00",
                "updated_at": "2026-05-09T10:01:00+00:00",
            }
        ],
        "pending": [],
    }
}


@pytest.mark.asyncio
async def test_list_kb_returns_entries():
    """GET /kb maps LightRAG document statuses to KbEntry list."""
    with respx.mock(base_url=_LIGHTRAG) as mock:
        mock.get("/documents").mock(return_value=Response(200, json=_DOCS_RESPONSE))

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.get("/api/v1/kb")

    assert resp.status_code == 200
    entries = resp.json()
    assert len(entries) == 1
    entry = entries[0]
    assert entry["filename"] == "sleep_study.pdf"  # __tmp__ prefix stripped
    assert entry["category"] == "general"
    assert entry["has_summary"] is True  # status == "processed"
    assert entry["file_size"] == 20480
    assert entry["upload_date"] == "2026-05-09T10:00:00+00:00"


@pytest.mark.asyncio
async def test_list_kb_empty():
    """GET /kb returns empty list when LightRAG has no documents."""
    with respx.mock(base_url=_LIGHTRAG) as mock:
        mock.get("/documents").mock(
            return_value=Response(200, json={"statuses": {}})
        )

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.get("/api/v1/kb")

    assert resp.status_code == 200
    assert resp.json() == []


# ---------------------------------------------------------------------------
# Tests: POST /api/v1/kb (upload)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_upload_kb_pdf_success():
    """POST /kb forwards PDF to LightRAG and returns 201."""
    with respx.mock(base_url=_LIGHTRAG) as mock:
        mock.post("/documents/upload").mock(
            return_value=Response(
                200,
                json={"status": "success", "message": "File 'paper.pdf' saved successfully."},
            )
        )

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.post(
                "/api/v1/kb",
                files={"file": ("paper.pdf", io.BytesIO(b"%PDF-1.4 content"), "application/pdf")},
                data={"category": "general"},
            )

    assert resp.status_code == 201
    assert "paper.pdf" in resp.json()["message"]


@pytest.mark.asyncio
async def test_upload_kb_markdown_success():
    """POST /kb accepts .md files."""
    with respx.mock(base_url=_LIGHTRAG) as mock:
        mock.post("/documents/upload").mock(
            return_value=Response(200, json={"status": "success", "message": "ok"})
        )

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.post(
                "/api/v1/kb",
                files={"file": ("guide.md", io.BytesIO(b"# Guide\nContent here."), "text/markdown")},
                data={"category": "general"},
            )

    assert resp.status_code == 201


@pytest.mark.asyncio
async def test_upload_kb_txt_success():
    """POST /kb accepts .txt files."""
    with respx.mock(base_url=_LIGHTRAG) as mock:
        mock.post("/documents/upload").mock(
            return_value=Response(200, json={"status": "success", "message": "ok"})
        )

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.post(
                "/api/v1/kb",
                files={"file": ("notes.txt", io.BytesIO(b"Some text content"), "text/plain")},
                data={"category": "general"},
            )

    assert resp.status_code == 201


@pytest.mark.asyncio
async def test_upload_kb_rejects_unsupported_type():
    """POST /kb returns 400 for unsupported file types."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.post(
            "/api/v1/kb",
            files={"file": ("image.jpg", io.BytesIO(b"\xff\xd8\xff"), "image/jpeg")},
            data={"category": "general"},
        )

    assert resp.status_code == 400


# ---------------------------------------------------------------------------
# Tests: DELETE /api/v1/kb/{filename}
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_delete_kb_success():
    """DELETE /kb/{filename} looks up doc_id and calls LightRAG delete."""
    with respx.mock(base_url=_LIGHTRAG) as mock:
        mock.get("/documents").mock(return_value=Response(200, json=_DOCS_RESPONSE))
        mock.delete("/documents/delete_document").mock(
            return_value=Response(200, json={"status": "success", "message": "Deleted."})
        )

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.delete("/api/v1/kb/sleep_study.pdf")

    assert resp.status_code == 200
    assert "sleep_study.pdf" in resp.json()["message"]


@pytest.mark.asyncio
async def test_delete_kb_not_found():
    """DELETE /kb/{filename} returns 404 when filename not in LightRAG."""
    with respx.mock(base_url=_LIGHTRAG) as mock:
        mock.get("/documents").mock(
            return_value=Response(200, json={"statuses": {}})
        )

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.delete("/api/v1/kb/nonexistent.pdf")

    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_delete_kb_rejects_path_traversal():
    """DELETE /kb/{filename} rejects path traversal — 400 from our guard or 404 from router."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.delete("/api/v1/kb/..%2F..%2Fetc%2Fpasswd")

    assert resp.status_code in (400, 404)
