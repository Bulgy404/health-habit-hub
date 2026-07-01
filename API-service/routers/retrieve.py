"""RAG retrieval and knowledge-base CRUD — backed by LightRAG.

Endpoints:
  POST   /api/v1/llm/retrieve      — hybrid graph+vector retrieval
  GET    /api/v1/kb                — list indexed documents
  POST   /api/v1/kb                — upload a document (PDF / TXT / MD)
  DELETE /api/v1/kb/{filename}     — remove a document by filename
"""
from __future__ import annotations

import logging
import os
from typing import Any, Optional

import httpx
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from auth import verify_service_token

logger = logging.getLogger(__name__)

router = APIRouter(dependencies=[Depends(verify_service_token)])

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
_LIGHTRAG_URL = os.environ.get("LIGHTRAG_URL", "http://lightrag:9621")
_LIGHTRAG_API_KEY = os.environ.get("LIGHTRAG_API_KEY", "")
_SUPPORTED_EXTENSIONS = {".pdf", ".txt", ".md"}


def _headers(content_type: Optional[str] = "application/json") -> dict[str, str]:
    h: dict[str, str] = {}
    if content_type:
        h["Content-Type"] = content_type
    if _LIGHTRAG_API_KEY:
        h["X-API-Key"] = _LIGHTRAG_API_KEY
    return h


async def _lightrag(
    method: str,
    path: str,
    *,
    json: Optional[dict[str, Any]] = None,
    content: Optional[bytes] = None,
    headers: Optional[dict[str, str]] = None,
    timeout: float = 60.0,
) -> dict[str, Any]:
    """Execute a request against LightRAG and return the parsed JSON body."""
    url = f"{_LIGHTRAG_URL}{path}"
    hdrs = headers or _headers()
    async with httpx.AsyncClient(timeout=timeout) as client:
        resp = await client.request(method, url, headers=hdrs, json=json, content=content)
    logger.info("LightRAG %s %s → %d", method, path, resp.status_code)
    if resp.status_code >= 500:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=f"LightRAG error: {resp.text[:200]}")
    if resp.status_code == 404:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found.")
    resp.raise_for_status()
    return resp.json()


# ---------------------------------------------------------------------------
# Request / Response models
# ---------------------------------------------------------------------------
class RetrieveRequest(BaseModel):
    """Input payload for the RAG retrieval endpoint."""

    rag_query: str = Field(..., min_length=1, max_length=2000)


class SourceItem(BaseModel):
    """A single retrieval result from LightRAG with provenance and relevance score."""

    filename: str
    category: str
    excerpt: str
    score: float


class RetrieveResponse(BaseModel):
    """Retrieval response containing a list of ranked knowledge-base source excerpts."""

    sources: list[SourceItem]


class KbEntry(BaseModel):
    """Metadata for a single document in the LightRAG knowledge base."""

    filename: str
    category: str
    file_size: int
    has_summary: bool
    upload_date: str


# ---------------------------------------------------------------------------
# POST /api/v1/llm/retrieve
# ---------------------------------------------------------------------------
@router.post("/llm/retrieve", response_model=RetrieveResponse)
async def retrieve(body: RetrieveRequest) -> RetrieveResponse:
    """Execute a hybrid graph+vector RAG query against LightRAG.

    Args:
        body: Validated request payload with the RAG query string.

    Returns:
        RetrieveResponse with a single SourceItem containing the hybrid context excerpt,
        or an empty sources list if LightRAG returns no context.

    Raises:
        HTTPException: 500 if LightRAG is unreachable.
        HTTPException: 502 if LightRAG returns a 5xx error.
    """
    try:
        data = await _lightrag(
            "POST",
            "/query",
            json={"query": body.rag_query, "mode": "hybrid", "only_need_context": True},
            timeout=90.0,
        )
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("retrieve failed: %s", exc)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Retrieval service unavailable.") from exc

    context: str = data.get("response") or ""
    if not context.strip():
        return RetrieveResponse(sources=[])

    return RetrieveResponse(
        sources=[
            SourceItem(
                filename="knowledge_base",
                category="hybrid",
                excerpt=context,
                score=1.0,
            )
        ]
    )


# ---------------------------------------------------------------------------
# GET /api/v1/kb
# ---------------------------------------------------------------------------
@router.get("/kb", response_model=list[KbEntry])
async def list_kb() -> list[KbEntry]:
    """List all documents currently indexed in the LightRAG knowledge base.

    Returns:
        A list of KbEntry records with filename, category, size, status, and upload date.

    Raises:
        HTTPException: 500 if LightRAG is unreachable.
        HTTPException: 502 if LightRAG returns a 5xx error.
    """
    try:
        data = await _lightrag("GET", "/documents")
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("list_kb failed: %s", exc)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Could not reach LightRAG.") from exc

    statuses: dict[str, list[dict[str, Any]]] = data.get("statuses", {})  # type: ignore[assignment]
    entries: list[KbEntry] = []
    for docs in statuses.values():
        for doc in docs:
            raw_path: str = doc.get("file_path") or doc.get("id") or ""
            # Strip temp prefix LightRAG adds internally
            filename = raw_path.removeprefix("__tmp__")
            entries.append(
                KbEntry(
                    filename=filename or doc.get("id", "unknown"),
                    category="general",
                    file_size=doc.get("content_length") or 0,
                    has_summary=doc.get("status") == "processed",
                    upload_date=doc.get("created_at") or doc.get("updated_at") or "",
                )
            )
    return entries


# ---------------------------------------------------------------------------
# POST /api/v1/kb
# ---------------------------------------------------------------------------
@router.post("/kb", status_code=201)
async def upload_kb(
    file: UploadFile = File(...),
    category: str = Form(default="general"),
) -> JSONResponse:
    """Upload a document (PDF, TXT, or MD) to the LightRAG knowledge base.

    Args:
        file: The uploaded file object; must have a recognised extension.
        category: Logical category label for the document (default: "general").

    Returns:
        JSONResponse (201) confirming the upload and background indexing.

    Raises:
        HTTPException: 400 if no filename is provided or the file type is unsupported.
        HTTPException: 400 if LightRAG rejects the upload.
        HTTPException: 500 if LightRAG is unreachable.
    """
    if not file.filename:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No filename provided.")

    logger.info("upload_kb filename=%s category=%s", file.filename, category)
    suffix = "." + file.filename.rsplit(".", 1)[-1].lower() if "." in file.filename else ""
    if suffix not in _SUPPORTED_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported file type. Accepted: {', '.join(_SUPPORTED_EXTENSIONS)}",
        )

    content = await file.read()

    auth_header: dict[str, str] = {}
    if _LIGHTRAG_API_KEY:
        auth_header["Authorization"] = f"Bearer {_LIGHTRAG_API_KEY}"

    try:
        async with httpx.AsyncClient(timeout=120.0) as client:
            resp = await client.post(
                f"{_LIGHTRAG_URL}/documents/upload",
                headers=auth_header,
                files={"file": (file.filename, content, file.content_type or "application/octet-stream")},
            )
        logger.info("upload_kb → LightRAG %d", resp.status_code)
        if resp.status_code >= 400:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=resp.json().get("detail", "Upload failed."))
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("upload_kb failed: %s", exc)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Could not reach LightRAG.") from exc

    return JSONResponse(
        {"message": f"Uploaded '{file.filename}' — processing in background."},
        status_code=201,
    )


# ---------------------------------------------------------------------------
# DELETE /api/v1/kb/{filename}
# ---------------------------------------------------------------------------
@router.delete("/kb/{filename}", status_code=200)
async def delete_kb(filename: str) -> JSONResponse:
    """Remove a document from the LightRAG knowledge base by filename.

    Args:
        filename: The document filename to delete; path traversal characters are rejected.

    Returns:
        JSONResponse (200) confirming deletion.

    Raises:
        HTTPException: 400 if the filename contains path traversal characters.
        HTTPException: 404 if the document is not found in LightRAG.
        HTTPException: 500 if LightRAG is unreachable.
        HTTPException: 502 if LightRAG returns a 5xx error.
    """
    if "/" in filename or "\\" in filename or ".." in filename:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid filename.")

    # Fetch document list to find the doc_id matching this filename
    try:
        data = await _lightrag("GET", "/documents")
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("delete_kb list failed: %s", exc)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Could not reach LightRAG.") from exc

    statuses: dict[str, list[dict[str, Any]]] = data.get("statuses", {})  # type: ignore[assignment]
    doc_id: Optional[str] = None
    for docs in statuses.values():
        for doc in docs:
            raw_path = doc.get("file_path") or ""
            if raw_path.removeprefix("__tmp__") == filename or doc.get("id") == filename:
                doc_id = doc.get("id")
                break
        if doc_id:
            break

    if not doc_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Document '{filename}' not found.")

    try:
        await _lightrag(
            "DELETE",
            "/documents/delete_document",
            json={"doc_id": doc_id},
        )
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("delete_kb delete failed: %s", exc)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Could not reach LightRAG.") from exc

    return JSONResponse({"message": f"Deleted '{filename}'."})
