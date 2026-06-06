"""POST /api/v1/llm/map-bcio — M1.3 BCIO Ontology Mapper."""
from __future__ import annotations

import hashlib
import logging
import os
import xml.etree.ElementTree as ET
from pathlib import Path
from typing import Optional, cast

import numpy as np
import openai
from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field, field_validator

from auth import verify_service_token

logger = logging.getLogger(__name__)

router = APIRouter(dependencies=[Depends(verify_service_token)])

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
_EMBEDDING_MODEL = os.getenv("EMBEDDING_MODEL", "Qwen/Qwen3-Embedding-4B")
_EMBEDDING_API_BASE = os.getenv("EMBEDDING_API_BASE", os.getenv("LLM_API_BASE"))
_EMBEDDING_API_KEY = os.getenv("EMBEDDING_API_KEY", os.getenv("LLM_API_KEY", ""))
_BCIO_MIN_CONFIDENCE = float(os.getenv("BCIO_MIN_CONFIDENCE", "0.6"))
_OWL_PATH = Path(__file__).parent.parent / "data" / "bcio.owl"

_openai_client = openai.AsyncOpenAI(
    api_key=_EMBEDDING_API_KEY or "placeholder",
    base_url=_EMBEDDING_API_BASE or None,
)

# ---------------------------------------------------------------------------
# OWL namespace constants
# ---------------------------------------------------------------------------
_RDF_NS = "http://www.w3.org/1999/02/22-rdf-syntax-ns#"
_RDFS_NS = "http://www.w3.org/2000/01/rdf-schema#"
_OWL_NS = "http://www.w3.org/2002/07/owl#"

# ---------------------------------------------------------------------------
# In-memory concept index: {"hash": str, "concepts": [{"id", "label", "embedding"}]}
# ---------------------------------------------------------------------------
_INDEX: Optional[dict[str, object]] = None


def _parse_owl_concepts(owl_path: Path) -> list[dict[str, str]]:
    """Parse an OWL file and return a list of {id, label} dicts."""
    tree = ET.parse(str(owl_path))
    root = tree.getroot()
    concepts: list[dict[str, str]] = []
    for cls in root.iter(f"{{{_OWL_NS}}}Class"):
        concept_id = cls.get(f"{{{_RDF_NS}}}about", "")
        if not concept_id:
            continue
        label_el = cls.find(f"{{{_RDFS_NS}}}label")
        if label_el is not None and label_el.text:
            concepts.append({"id": concept_id, "label": label_el.text.strip()})
    return concepts


async def _embed_texts(texts: list[str]) -> list[list[float]]:
    """Return embeddings using the configured OpenAI-compatible embedding endpoint."""
    response = await _openai_client.embeddings.create(
        model=_EMBEDDING_MODEL,
        input=texts,
    )
    return [item.embedding for item in response.data]


def _cosine_similarity(a: list[float], b: list[float]) -> float:
    """Cosine similarity between two float vectors."""
    vec_a = np.array(a, dtype=np.float32)
    vec_b = np.array(b, dtype=np.float32)
    norm_a = float(np.linalg.norm(vec_a))
    norm_b = float(np.linalg.norm(vec_b))
    if norm_a == 0.0 or norm_b == 0.0:
        return 0.0
    return float(np.dot(vec_a, vec_b) / (norm_a * norm_b))


async def _get_index() -> Optional[dict[str, object]]:
    """Return the BCIO concept index, rebuilding it when bcio.owl changes."""
    global _INDEX

    if not _OWL_PATH.exists():
        logger.warning(
            "bcio.owl not found at %s — map-bcio will return empty results.", _OWL_PATH
        )
        return None

    file_hash = hashlib.sha256(_OWL_PATH.read_bytes()).hexdigest()
    if _INDEX is not None and _INDEX.get("hash") == file_hash:
        return _INDEX

    logger.info("Building BCIO concept index from %s …", _OWL_PATH)
    raw_concepts = _parse_owl_concepts(_OWL_PATH)
    if not raw_concepts:
        logger.warning("No concepts found in bcio.owl.")
        _INDEX = {"hash": file_hash, "concepts": []}
        return _INDEX

    labels = [c["label"] for c in raw_concepts]
    total = len(labels)
    chunk_size = int(os.getenv("EMBEDDING_CHUNK_SIZE", "200"))
    embeddings: list[list[float]] = []

    logger.info(
        "Embedding %d BCIO concepts via %s (chunk_size=%d) …",
        total, _EMBEDDING_MODEL, chunk_size,
    )
    try:
        for i in range(0, total, chunk_size):
            chunk = labels[i : i + chunk_size]
            chunk_embeddings = await _embed_texts(chunk)
            embeddings.extend(chunk_embeddings)
            logger.info(
                "BCIO embedding progress: %d / %d (%.0f%%)",
                min(i + chunk_size, total), total,
                min(i + chunk_size, total) / total * 100,
            )
    except Exception as exc:  # noqa: BLE001
        logger.error("Failed to build BCIO concept embeddings: %s", exc)
        return None

    concepts_with_embeddings: list[dict[str, object]] = [
        {**c, "embedding": emb} for c, emb in zip(raw_concepts, embeddings)
    ]
    _INDEX = {"hash": file_hash, "concepts": concepts_with_embeddings}
    logger.info("BCIO concept index built: %d concepts.", total)
    return _INDEX


# ---------------------------------------------------------------------------
# Request / Response models
# ---------------------------------------------------------------------------
class MapBcioRequest(BaseModel):
    """Input payload for the map-bcio endpoint."""

    uuid: str = Field(..., max_length=128)
    context_phrases: dict[str, list[str]]

    @field_validator("context_phrases")
    @classmethod
    def limit_phrase_lengths(cls, v: dict[str, list[str]]) -> dict[str, list[str]]:
        """Validate that no phrase exceeds 2000 characters."""
        for dim, phrases in v.items():
            for phrase in phrases:
                if len(phrase) > 2000:
                    raise ValueError(
                        f"Phrase in dimension '{dim}' exceeds max length of 2000 characters."
                    )
        return v


class BcioMapping(BaseModel):
    """A single phrase-to-BCIO-concept mapping with a cosine similarity confidence score."""

    phrase: str
    dimension: str
    bcio_concept_id: str
    bcio_concept_label: str
    confidence: float


class MapBcioResponse(BaseModel):
    """All BCIO concept mappings found above the minimum confidence threshold."""

    mappings: list[BcioMapping]


# ---------------------------------------------------------------------------
# Endpoint
# ---------------------------------------------------------------------------
@router.post("/llm/map-bcio", response_model=MapBcioResponse)
async def map_bcio(body: MapBcioRequest) -> MapBcioResponse:
    """Map context phrases to BCIO ontology concepts via embedding cosine similarity.

    Args:
        body: Validated request with a habit UUID and dimension-keyed phrase lists.

    Returns:
        MapBcioResponse with all phrase-concept pairs above BCIO_MIN_CONFIDENCE.
        Returns an empty mapping list if the BCIO index is unavailable or embedding fails.

    Raises:
        HTTPException: 422 if any phrase exceeds 2000 characters (via field_validator).
    """
    index = await _get_index()
    if index is None or not index["concepts"]:
        return MapBcioResponse(mappings=[])

    # Collect all non-empty (phrase, dimension) pairs
    phrase_dim_pairs: list[tuple[str, str]] = [
        (phrase.strip(), dimension)
        for dimension, phrases in body.context_phrases.items()
        for phrase in phrases
        if phrase.strip()
    ]

    if not phrase_dim_pairs:
        return MapBcioResponse(mappings=[])

    phrase_texts = [p for p, _ in phrase_dim_pairs]
    try:
        phrase_embeddings = await _embed_texts(phrase_texts)
    except Exception as exc:  # noqa: BLE001
        logger.error("Failed to embed context phrases: %s", exc)
        return MapBcioResponse(mappings=[])

    concepts = cast(list[dict[str, object]], index["concepts"])
    mappings: list[BcioMapping] = []

    for (phrase, dimension), phrase_emb in zip(phrase_dim_pairs, phrase_embeddings):
        best_score = -1.0
        best_concept: Optional[dict[str, object]] = None
        for concept in concepts:
            score = _cosine_similarity(phrase_emb, cast(list[float], concept["embedding"]))
            if score > best_score:
                best_score = score
                best_concept = concept

        if best_concept is not None and best_score > _BCIO_MIN_CONFIDENCE:
            mappings.append(
                BcioMapping(
                    phrase=phrase,
                    dimension=dimension,
                    bcio_concept_id=best_concept["id"],
                    bcio_concept_label=best_concept["label"],
                    confidence=round(best_score, 4),
                )
            )

    return MapBcioResponse(mappings=mappings)
