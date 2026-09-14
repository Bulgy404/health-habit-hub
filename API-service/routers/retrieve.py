"""RAG retrieval and knowledge-base CRUD — backed by LightRAG.

Endpoints:
  POST   /api/v1/llm/retrieve      — hybrid graph+vector retrieval
  GET    /api/v1/kb                — list indexed documents
  POST   /api/v1/kb                — upload a document (PDF / TXT / MD)
  DELETE /api/v1/kb/{filename}     — remove a document by filename
"""
from __future__ import annotations

import logging
import re
import os
from typing import Any, Optional

import httpx
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from motor.motor_asyncio import AsyncIOMotorDatabase

from auth import verify_service_token
from bibtex import BibtexError, parse_entry
from citations import (
    REFERENCES_COLLECTION,
    build_citation,
    extract_document_filenames,
    load_references,
)
from deps import get_mongo_db

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
    #: Knowledge-base filenames this query may draw on. ``None`` means every
    #: indexed document, which is what the general study wants and what every
    #: caller got before per-study scoping existed.
    allowed_files: Optional[list[str]] = None


class SourceItem(BaseModel):
    """A single retrieval result from LightRAG with provenance and relevance score."""

    filename: str
    category: str
    excerpt: str
    score: float


class RetrieveResponse(BaseModel):
    """Retrieval response with per-document provenance and the raw context blob.

    ``sources`` lists the distinct knowledge-base documents found in the
    LightRAG context (one item per document). ``context`` carries the full
    hybrid context text for prompt grounding.
    """

    sources: list[SourceItem]
    context: str = ""


class KbEntry(BaseModel):
    """Metadata for a single document in the LightRAG knowledge base."""

    filename: str
    category: str
    file_size: int
    has_summary: bool
    upload_date: str
    #: Display citation, from the curated reference when one exists and from
    #: the Zotero-style filename otherwise.
    citation: str = ""
    #: DOI or publisher link. Empty when nothing curated — never guessed.
    url: str = ""
    #: Whether a BibLaTeX entry has been recorded for this document. False is
    #: the signal the tab uses to prompt for one.
    has_reference: bool = False


# ---------------------------------------------------------------------------
# POST /api/v1/llm/retrieve
# ---------------------------------------------------------------------------
def _sources_allowed(file_path: str, allowed: set[str]) -> bool:
    """Does this LightRAG item come from a document the caller may use?

    ``file_path`` is a single filename on a chunk, but on a merged entity or
    relationship LightRAG joins every contributing document into one string.
    An item is kept when ANY of its sources is allowed, which is the honest
    reading: the item genuinely is evidence from an allowed paper, even if
    other papers also describe it.
    """
    if not file_path:
        return False
    candidates = re.split(r"<SEP>|[\n;|]", file_path)
    return any(c.strip() in allowed for c in candidates if c.strip())


def _compose_context(data: dict[str, Any]) -> str:
    """Rebuild a prompt-ready context blob from structured retrieval data.

    Mirrors the shape LightRAG's own ``only_need_context`` response has, so a
    scoped study's prompt reads the same way an unscoped one does.
    """
    parts: list[str] = []
    entities = data.get("entities") or []
    relationships = data.get("relationships") or []
    chunks = data.get("chunks") or []

    if entities:
        parts.append("-----Entities-----")
        for e in entities:
            name = e.get("entity_name", "")
            desc = e.get("description", "")
            parts.append(f"{name}: {desc}".strip(": "))
    if relationships:
        parts.append("-----Relationships-----")
        for r in relationships:
            src_id = r.get("src_id", "")
            tgt_id = r.get("tgt_id", "")
            desc = r.get("description", "")
            parts.append(f"{src_id} -> {tgt_id}: {desc}".strip(": "))
    if chunks:
        parts.append("-----Sources-----")
        for c in chunks:
            content = c.get("content", "")
            path = c.get("file_path", "")
            parts.append(f"[{path}]\n{content}" if path else content)

    return "\n".join(parts).strip()


async def _retrieve_scoped(
    rag_query: str, allowed: set[str]
) -> tuple[str, list[str]]:
    """Retrieve with per-document scoping, via LightRAG's structured endpoint.

    LightRAG 1.5 has no document filter on /query — the request model takes
    keywords and token budgets, nothing that names a file. /query/data does
    return entities, relationships and chunks each tagged with their
    ``file_path``, so the filtering happens here, after retrieval.

    The residual limitation worth knowing: an entity description is synthesised
    across every document that mentions it, so a kept entity's text can still
    carry phrasing shaped by a paper outside the list. Chunks and citations are
    exact; the graph layer is close but not hermetic. Genuine isolation would
    need a LightRAG instance per study.
    """
    data = await _lightrag(
        "POST",
        "/query/data",
        json={"query": rag_query, "mode": "hybrid"},
        timeout=90.0,
    )
    payload: dict[str, Any] = data.get("data") or {}

    filtered = {
        key: [
            item
            for item in (payload.get(key) or [])
            if _sources_allowed(item.get("file_path", ""), allowed)
        ]
        for key in ("entities", "relationships", "chunks")
    }
    filenames = [
        ref.get("file_path", "")
        for ref in (payload.get("references") or [])
        if _sources_allowed(ref.get("file_path", ""), allowed)
    ]
    return _compose_context(filtered), [f for f in filenames if f]


async def perform_retrieve(
    body: RetrieveRequest,
    db: Optional[AsyncIOMotorDatabase] = None,
) -> RetrieveResponse:
    """Execute a hybrid graph+vector RAG query against LightRAG.

    Args:
        body: Validated request payload with the RAG query string and, for a
            scoped study, the knowledge-base files it may draw on.
        db: Motor database used to resolve curated citations. Optional so the
            unit tests can drive this without a database.

    Returns:
        RetrieveResponse with one SourceItem per contributing document,
        or an empty sources list if LightRAG returns no context.

    Raises:
        HTTPException: 500 if LightRAG is unreachable.
        HTTPException: 502 if LightRAG returns a 5xx error.
    """
    allowed = set(body.allowed_files) if body.allowed_files is not None else None

    try:
        if allowed is not None:
            # An empty allow-list means the study has been scoped to nothing.
            # Retrieving and discarding everything would be the same answer at
            # the cost of an LLM round trip.
            if not allowed:
                return RetrieveResponse(sources=[], context="")
            context, doc_filenames = await _retrieve_scoped(body.rag_query, allowed)
        else:
            # Unscoped studies keep the original call untouched. The prompt
            # LightRAG composes itself is what every recommendation has been
            # grounded on to date, and there is no reason to re-derive it here.
            data = await _lightrag(
                "POST",
                "/query",
                json={
                    "query": body.rag_query,
                    "mode": "hybrid",
                    "only_need_context": True,
                },
                timeout=90.0,
            )
            context = data.get("response") or ""
            # LightRAG embeds each chunk's file_path in the context, so the
            # distinct filenames identify the actual papers used.
            doc_filenames = extract_document_filenames(context)
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("retrieve failed: %s", exc)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Retrieval service unavailable.") from exc

    if not context.strip():
        return RetrieveResponse(sources=[], context="")

    references = await load_references(db)
    if doc_filenames:
        sources = [
            SourceItem(
                filename=name,
                category="document",
                excerpt=build_citation(name, references)["citation"],
                score=1.0,
            )
            for name in doc_filenames
        ]
    else:
        # Fallback: no filenames recognisable in the context — keep the old
        # single-blob source so downstream consumers still get something.
        sources = [
            SourceItem(
                filename="knowledge_base",
                category="hybrid",
                excerpt=context,
                score=1.0,
            )
        ]

    return RetrieveResponse(sources=sources, context=context)


@router.post("/llm/retrieve", response_model=RetrieveResponse)
async def retrieve(
    body: RetrieveRequest,
    db: AsyncIOMotorDatabase = Depends(get_mongo_db),
) -> RetrieveResponse:
    """HTTP entry point for retrieval — see :func:`perform_retrieve`."""
    return await perform_retrieve(body, db)


# ---------------------------------------------------------------------------
# GET /api/v1/kb
# ---------------------------------------------------------------------------
@router.get("/kb", response_model=list[KbEntry])
async def list_kb(
    db: AsyncIOMotorDatabase = Depends(get_mongo_db),
) -> list[KbEntry]:
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

    references = await load_references(db)
    statuses: dict[str, list[dict[str, Any]]] = data.get("statuses", {})  # type: ignore[assignment]
    entries: list[KbEntry] = []
    for docs in statuses.values():
        for doc in docs:
            raw_path: str = doc.get("file_path") or doc.get("id") or ""
            # Strip temp prefix LightRAG adds internally
            filename = raw_path.removeprefix("__tmp__")
            name = filename or doc.get("id", "unknown")
            citation = build_citation(name, references)
            entries.append(
                KbEntry(
                    filename=name,
                    category="general",
                    file_size=doc.get("content_length") or 0,
                    has_summary=doc.get("status") == "processed",
                    upload_date=doc.get("created_at") or doc.get("updated_at") or "",
                    citation=citation["citation"],
                    url=citation["url"],
                    has_reference=name in references,
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
    bibtex: str = Form(default=""),
    db: AsyncIOMotorDatabase = Depends(get_mongo_db),
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

    # Parsed before the upload, not after: a malformed entry should cost the
    # admin a correction, not leave a paper indexed and uncitable while they
    # work out what was wrong with it.
    reference: Optional[dict[str, Any]] = None
    if bibtex.strip():
        try:
            reference = parse_entry(bibtex)
        except BibtexError as exc:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)
            ) from exc

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

    if reference is not None:
        reference["filename"] = file.filename
        try:
            await db[REFERENCES_COLLECTION].replace_one(
                {"filename": file.filename}, reference, upsert=True
            )
        except Exception as exc:  # noqa: BLE001
            # The paper is already indexed at this point. Losing the citation is
            # bad but recoverable by re-saving it; failing the whole upload
            # would leave LightRAG holding a document the admin thinks failed.
            logger.error("could not store reference for %s: %s", file.filename, exc)
            return JSONResponse(
                {
                    "message": (
                        f"Uploaded '{file.filename}', but its citation could not "
                        "be saved. Add the BibLaTeX entry again to retry."
                    )
                },
                status_code=201,
            )

    return JSONResponse(
        {"message": f"Uploaded '{file.filename}' — processing in background."},
        status_code=201,
    )


# ---------------------------------------------------------------------------
# DELETE /api/v1/kb/{filename}
# ---------------------------------------------------------------------------
@router.delete("/kb/{filename}", status_code=200)
async def delete_kb(
    filename: str,
    db: AsyncIOMotorDatabase = Depends(get_mongo_db),
) -> JSONResponse:
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

    # The citation outlives nothing: with the document gone it can only become
    # a stale row that a re-upload would silently inherit.
    try:
        await db[REFERENCES_COLLECTION].delete_one({"filename": filename})
    except Exception as exc:  # noqa: BLE001
        logger.warning("could not drop reference for %s: %s", filename, exc)

    return JSONResponse({"message": f"Deleted '{filename}'."})
