"""POST /api/v1/llm/retrieve — M3.3 RAG Retrieval.

Also exposes KB CRUD:
  GET    /api/v1/kb              — list PDFs in the knowledge base
  POST   /api/v1/kb              — upload a new PDF
  DELETE /api/v1/kb/{filename}   — remove a PDF
  POST   /api/v1/kb/reindex      — force full re-index
"""
from __future__ import annotations

import asyncio
import datetime
import hashlib
import json
import logging
import os
from pathlib import Path
from typing import Any, Dict, List, Optional

import numpy as np
import openai
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from auth import verify_service_token
from llm_client import chat_complete

logger = logging.getLogger(__name__)

router = APIRouter(dependencies=[Depends(verify_service_token)])

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
_EMBEDDING_MODEL = os.getenv("EMBEDDING_MODEL", "text-embedding-3-small")
_TOP_K = int(os.getenv("RAG_TOP_K", "5"))

_api_key = os.getenv("LLM_API_KEY", "")
_openai_client = openai.AsyncOpenAI(api_key=_api_key or "placeholder")

# ---------------------------------------------------------------------------
# Paths — declared as module-level variables so tests can patch them
# ---------------------------------------------------------------------------
_KB_DIR: Path = Path(__file__).parent.parent / "kb"
_META_DIR: Path = Path(__file__).parent.parent / "kb" / "_meta"
_PROMPT_PATH: Path = Path(__file__).parent.parent / "prompts" / "summarize_pdf.txt"

# ---------------------------------------------------------------------------
# In-memory index
# ---------------------------------------------------------------------------
_INDEX: Dict[str, Any] = {
    # List of {"filename", "category", "excerpt", "embedding": List[float], "file_hash"}
    "chunks": [],
    # filename -> sha256 hex string
    "file_hashes": {},
}

_INDEX_LOCK: asyncio.Lock = asyncio.Lock()


# ---------------------------------------------------------------------------
# PDF text extraction (pypdf)
# ---------------------------------------------------------------------------
def _extract_text(pdf_path: Path) -> str:
    """Extract all text from a PDF file. Returns empty string on failure."""
    try:
        from pypdf import PdfReader  # type: ignore[import-untyped]

        reader = PdfReader(str(pdf_path))
        parts: List[str] = []
        for page in reader.pages:
            text = page.extract_text() or ""
            if text.strip():
                parts.append(text.strip())
        return "\n\n".join(parts)
    except Exception as exc:  # noqa: BLE001
        logger.warning("Failed to extract text from %s: %s", pdf_path, exc)
        return ""


# ---------------------------------------------------------------------------
# Chunking
# ---------------------------------------------------------------------------
def _chunk_text(text: str, chunk_size: int = 500, overlap: int = 100) -> List[str]:
    """Split *text* into overlapping chunks of ~*chunk_size* characters."""
    chunks: List[str] = []
    start = 0
    while start < len(text):
        chunk = text[start : start + chunk_size].strip()
        if len(chunk) >= 50:
            chunks.append(chunk)
        start += chunk_size - overlap
    return chunks


# ---------------------------------------------------------------------------
# Embeddings
# ---------------------------------------------------------------------------
async def _embed_texts(texts: List[str]) -> List[List[float]]:
    """Return dense embeddings for *texts* using the configured model."""
    if _EMBEDDING_MODEL.startswith("text-embedding"):
        response = await _openai_client.embeddings.create(
            model=_EMBEDDING_MODEL,
            input=texts,
        )
        return [item.embedding for item in response.data]

    # Optional fallback: BAAI/bge-m3 via sentence-transformers
    try:
        from sentence_transformers import SentenceTransformer  # type: ignore[import-untyped]

        model = SentenceTransformer(_EMBEDDING_MODEL)
        vecs = model.encode(texts, normalize_embeddings=True)
        return [v.tolist() for v in vecs]
    except ImportError:
        logger.warning("sentence-transformers not installed; falling back to text-embedding-3-small")
        response = await _openai_client.embeddings.create(
            model="text-embedding-3-small",
            input=texts,
        )
        return [item.embedding for item in response.data]


# ---------------------------------------------------------------------------
# Cosine similarity
# ---------------------------------------------------------------------------
def _cosine_similarity(a: List[float], b: List[float]) -> float:
    va = np.array(a, dtype=np.float32)
    vb = np.array(b, dtype=np.float32)
    norm_a = float(np.linalg.norm(va))
    norm_b = float(np.linalg.norm(vb))
    if norm_a == 0.0 or norm_b == 0.0:
        return 0.0
    return float(np.dot(va, vb) / (norm_a * norm_b))


# ---------------------------------------------------------------------------
# File hash
# ---------------------------------------------------------------------------
def _file_hash(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


# ---------------------------------------------------------------------------
# LLM-generated summary (one-time per file; cached in _meta/)
# ---------------------------------------------------------------------------
async def _get_or_create_summary(filename: str, text: str) -> str:
    """Return a cached LLM summary for *filename*, generating it if absent."""
    # Use module-level _META_DIR so tests can patch it
    import routers.retrieve as _self

    meta_dir: Path = _self._META_DIR
    meta_dir.mkdir(parents=True, exist_ok=True)
    meta_path = meta_dir / f"{filename}.summary.json"

    if meta_path.exists():
        try:
            return json.loads(meta_path.read_text(encoding="utf-8")).get("summary", "")
        except Exception:  # noqa: BLE001
            pass

    prompt_template = (
        _PROMPT_PATH.read_text(encoding="utf-8")
        if _PROMPT_PATH.exists()
        else "Summarize this academic paper '{filename}' in 3-5 sentences:\n\n{text}"
    )
    excerpt = text[:3000]
    prompt = prompt_template.format(filename=filename, text=excerpt)

    try:
        summary = await chat_complete(
            messages=[{"role": "user", "content": prompt}],
            temperature=0.0,
        )
    except Exception as exc:  # noqa: BLE001
        logger.warning("Failed to generate summary for %s: %s", filename, exc)
        summary = f"Academic paper: {filename}"

    try:
        meta_path.write_text(
            json.dumps({"summary": summary, "filename": filename}, ensure_ascii=False),
            encoding="utf-8",
        )
    except Exception as exc:  # noqa: BLE001
        logger.warning("Failed to write summary for %s: %s", filename, exc)

    return summary


# ---------------------------------------------------------------------------
# Index a single PDF
# ---------------------------------------------------------------------------
async def _index_pdf(pdf_path: Path) -> List[Dict[str, Any]]:
    """Extract, chunk, and embed one PDF. Returns new chunk dicts."""
    import routers.retrieve as _self

    kb_dir: Path = _self._KB_DIR
    filename = pdf_path.name
    rel = pdf_path.relative_to(kb_dir)
    category = str(rel.parent) if str(rel.parent) != "." else "general"

    text = _extract_text(pdf_path)
    if not text.strip():
        logger.warning("No text extracted from %s — skipping.", pdf_path)
        return []

    # Generate (or load) one-time summary — fire and forget failures
    await _get_or_create_summary(filename, text)

    chunks = _chunk_text(text)
    if not chunks:
        return []

    try:
        embeddings = await _embed_texts(chunks)
    except Exception as exc:  # noqa: BLE001
        logger.warning("Embedding failed for %s: %s", filename, exc)
        return []

    file_hash_val = _file_hash(pdf_path)
    return [
        {
            "filename": filename,
            "category": category,
            "excerpt": chunk,
            "embedding": emb,
            "file_hash": file_hash_val,
        }
        for chunk, emb in zip(chunks, embeddings)
    ]


# ---------------------------------------------------------------------------
# Incremental index update (called on every retrieve request)
# ---------------------------------------------------------------------------
async def _ensure_index() -> None:
    """Scan KB directory; add new/changed PDFs, remove deleted ones.

    Must be called while holding *_INDEX_LOCK*.
    """
    import routers.retrieve as _self

    kb_dir: Path = _self._KB_DIR
    kb_dir.mkdir(parents=True, exist_ok=True)

    pdf_paths = [p for p in kb_dir.rglob("*.pdf") if "_meta" not in p.parts]
    current_files: Dict[str, Path] = {p.name: p for p in pdf_paths}

    # Remove chunks for deleted PDFs
    for fname in list(_INDEX["file_hashes"].keys()):
        if fname not in current_files:
            _INDEX["chunks"] = [c for c in _INDEX["chunks"] if c["filename"] != fname]
            del _INDEX["file_hashes"][fname]

    # Add/update new or changed PDFs
    for fname, pdf_path in current_files.items():
        current_hash = _file_hash(pdf_path)
        if _INDEX["file_hashes"].get(fname) == current_hash:
            continue  # unchanged

        # Drop stale chunks for this file
        _INDEX["chunks"] = [c for c in _INDEX["chunks"] if c["filename"] != fname]

        new_chunks = await _index_pdf(pdf_path)
        _INDEX["chunks"].extend(new_chunks)
        _INDEX["file_hashes"][fname] = current_hash


# ---------------------------------------------------------------------------
# Request / Response models
# ---------------------------------------------------------------------------
class RetrieveRequest(BaseModel):
    rag_query: str = Field(..., min_length=1, max_length=2000)


class SourceItem(BaseModel):
    filename: str
    category: str
    excerpt: str
    score: float


class RetrieveResponse(BaseModel):
    sources: List[SourceItem]


class KbEntry(BaseModel):
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
    async with _INDEX_LOCK:
        await _ensure_index()

    if not _INDEX["chunks"]:
        return RetrieveResponse(sources=[])

    try:
        query_embeddings = await _embed_texts([body.rag_query])
        query_emb = query_embeddings[0]
    except Exception as exc:  # noqa: BLE001
        logger.error("Failed to embed query: %s", exc)
        raise HTTPException(status_code=500, detail="Embedding service unavailable.") from exc

    scored = [
        {**chunk, "score": _cosine_similarity(query_emb, chunk["embedding"])}
        for chunk in _INDEX["chunks"]
    ]
    scored.sort(key=lambda x: x["score"], reverse=True)
    top = scored[:_TOP_K]

    return RetrieveResponse(
        sources=[
            SourceItem(
                filename=c["filename"],
                category=c["category"],
                excerpt=c["excerpt"],
                score=round(c["score"], 4),
            )
            for c in top
        ]
    )


# ---------------------------------------------------------------------------
# GET /api/v1/kb
# ---------------------------------------------------------------------------
@router.get("/kb", response_model=List[KbEntry])
async def list_kb() -> List[KbEntry]:
    import routers.retrieve as _self

    kb_dir: Path = _self._KB_DIR
    meta_dir: Path = _self._META_DIR
    kb_dir.mkdir(parents=True, exist_ok=True)

    pdf_paths = [p for p in kb_dir.rglob("*.pdf") if "_meta" not in p.parts]
    entries: List[KbEntry] = []
    for p in pdf_paths:
        rel = p.relative_to(kb_dir)
        category = str(rel.parent) if str(rel.parent) != "." else "general"
        meta_path = meta_dir / f"{p.name}.summary.json"
        stat = p.stat()
        entries.append(
            KbEntry(
                filename=p.name,
                category=category,
                file_size=stat.st_size,
                has_summary=meta_path.exists(),
                upload_date=datetime.datetime.fromtimestamp(
                    stat.st_mtime, tz=datetime.timezone.utc
                ).isoformat(),
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
    import routers.retrieve as _self

    kb_dir: Path = _self._KB_DIR

    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are accepted.")

    # Guard category against path traversal
    if "/" in category or "\\" in category or ".." in category:
        raise HTTPException(status_code=400, detail="Invalid category name.")

    target_dir = kb_dir / category
    target_dir.mkdir(parents=True, exist_ok=True)
    target_path = target_dir / file.filename

    content = await file.read()
    target_path.write_bytes(content)

    # Invalidate index entry so the next retrieve call re-indexes this file
    async with _INDEX_LOCK:
        fname = file.filename
        if fname in _INDEX["file_hashes"]:
            del _INDEX["file_hashes"][fname]
            _INDEX["chunks"] = [c for c in _INDEX["chunks"] if c["filename"] != fname]

    return JSONResponse(
        {"message": f"Uploaded '{file.filename}' to category '{category}'."},
        status_code=201,
    )


# ---------------------------------------------------------------------------
# POST /api/v1/kb/reindex  (registered before DELETE /{filename} to avoid shadowing)
# ---------------------------------------------------------------------------
@router.post("/kb/reindex", status_code=200)
async def reindex_kb() -> JSONResponse:
    async with _INDEX_LOCK:
        _INDEX["chunks"] = []
        _INDEX["file_hashes"] = {}
        await _ensure_index()
    return JSONResponse({"message": "Knowledge base re-indexed."})


# ---------------------------------------------------------------------------
# DELETE /api/v1/kb/{filename}
# ---------------------------------------------------------------------------
@router.delete("/kb/{filename}", status_code=200)
async def delete_kb(filename: str) -> JSONResponse:
    import routers.retrieve as _self

    kb_dir: Path = _self._KB_DIR
    meta_dir: Path = _self._META_DIR

    # Guard against path traversal: filename must be a plain name with no separators
    if "/" in filename or "\\" in filename or ".." in filename or not filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Invalid filename.")

    matches = [p for p in kb_dir.rglob(filename) if "_meta" not in p.parts and p.is_file()]
    if not matches:
        raise HTTPException(status_code=404, detail=f"File '{filename}' not found.")

    for p in matches:
        p.unlink()

    meta_path = meta_dir / f"{filename}.summary.json"
    if meta_path.exists():
        meta_path.unlink()

    async with _INDEX_LOCK:
        if filename in _INDEX["file_hashes"]:
            del _INDEX["file_hashes"][filename]
        _INDEX["chunks"] = [c for c in _INDEX["chunks"] if c["filename"] != filename]

    return JSONResponse({"message": f"Deleted '{filename}'."})
