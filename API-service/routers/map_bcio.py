"""POST /api/v1/llm/map-bcio — M1.3 BCIO Ontology Mapper."""
from __future__ import annotations

import hashlib
import logging
import os
import xml.etree.ElementTree as ET
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

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
_EMBEDDING_MODEL = os.getenv("EMBEDDING_MODEL", "text-embedding-3-small")
_BCIO_MIN_CONFIDENCE = float(os.getenv("BCIO_MIN_CONFIDENCE", "0.75"))
_OWL_PATH = Path(__file__).parent.parent / "data" / "bcio.owl"

_api_key = os.getenv("OPENAI_API_KEY", "")
_openai_client = openai.AsyncOpenAI(api_key=_api_key or "placeholder")

# ---------------------------------------------------------------------------
# OWL namespace constants
# ---------------------------------------------------------------------------
_RDF_NS = "http://www.w3.org/1999/02/22-rdf-syntax-ns#"
_RDFS_NS = "http://www.w3.org/2000/01/rdf-schema#"
_OWL_NS = "http://www.w3.org/2002/07/owl#"

# ---------------------------------------------------------------------------
# In-memory concept index: {"hash": str, "concepts": [{"id", "label", "embedding"}]}
# ---------------------------------------------------------------------------
_INDEX: Optional[Dict[str, Any]] = None


def _parse_owl_concepts(owl_path: Path) -> List[Dict[str, str]]:
    """Parse an OWL file and return a list of {id, label} dicts."""
    tree = ET.parse(str(owl_path))
    root = tree.getroot()
    concepts: List[Dict[str, str]] = []
    for cls in root.iter(f"{{{_OWL_NS}}}Class"):
        concept_id = cls.get(f"{{{_RDF_NS}}}about", "")
        if not concept_id:
            continue
        label_el = cls.find(f"{{{_RDFS_NS}}}label")
        if label_el is not None and label_el.text:
            concepts.append({"id": concept_id, "label": label_el.text.strip()})
    return concepts


async def _embed_texts(texts: List[str]) -> List[List[float]]:
    """Return embeddings for *texts* using the configured embedding model."""
    if _EMBEDDING_MODEL.startswith("text-embedding"):
        response = await _openai_client.embeddings.create(
            model=_EMBEDDING_MODEL,
            input=texts,
        )
        return [item.embedding for item in response.data]

    # Optional: BAAI/bge-m3 via sentence-transformers
    try:
        from sentence_transformers import SentenceTransformer  # type: ignore

        model = SentenceTransformer(_EMBEDDING_MODEL)
        vecs = model.encode(texts, normalize_embeddings=True)
        return [v.tolist() for v in vecs]
    except ImportError:
        logger.error(
            "sentence-transformers not installed; falling back to text-embedding-3-small"
        )
        response = await _openai_client.embeddings.create(
            model="text-embedding-3-small",
            input=texts,
        )
        return [item.embedding for item in response.data]


def _cosine_similarity(a: List[float], b: List[float]) -> float:
    """Cosine similarity between two float vectors."""
    vec_a = np.array(a, dtype=np.float32)
    vec_b = np.array(b, dtype=np.float32)
    norm_a = float(np.linalg.norm(vec_a))
    norm_b = float(np.linalg.norm(vec_b))
    if norm_a == 0.0 or norm_b == 0.0:
        return 0.0
    return float(np.dot(vec_a, vec_b) / (norm_a * norm_b))


async def _get_index() -> Optional[Dict[str, Any]]:
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
    try:
        embeddings = await _embed_texts(labels)
    except Exception as exc:  # noqa: BLE001
        logger.error("Failed to build BCIO concept embeddings: %s", exc)
        return None

    concepts_with_embeddings: List[Dict[str, Any]] = [
        {**c, "embedding": emb} for c, emb in zip(raw_concepts, embeddings)
    ]
    _INDEX = {"hash": file_hash, "concepts": concepts_with_embeddings}
    logger.info("BCIO concept index built: %d concepts.", len(raw_concepts))
    return _INDEX


# ---------------------------------------------------------------------------
# Request / Response models
# ---------------------------------------------------------------------------
class MapBcioRequest(BaseModel):
    uuid: str = Field(..., max_length=128)
    context_phrases: Dict[str, List[str]]

    @field_validator("context_phrases")
    @classmethod
    def limit_phrase_lengths(cls, v: Dict[str, List[str]]) -> Dict[str, List[str]]:
        for dim, phrases in v.items():
            for phrase in phrases:
                if len(phrase) > 2000:
                    raise ValueError(
                        f"Phrase in dimension '{dim}' exceeds max length of 2000 characters."
                    )
        return v


class BcioMapping(BaseModel):
    phrase: str
    dimension: str
    bcio_concept_id: str
    bcio_concept_label: str
    confidence: float


class MapBcioResponse(BaseModel):
    mappings: List[BcioMapping]


# ---------------------------------------------------------------------------
# Endpoint
# ---------------------------------------------------------------------------
@router.post("/llm/map-bcio", response_model=MapBcioResponse)
async def map_bcio(body: MapBcioRequest) -> MapBcioResponse:
    index = await _get_index()
    if index is None or not index["concepts"]:
        return MapBcioResponse(mappings=[])

    # Collect all non-empty (phrase, dimension) pairs
    phrase_dim_pairs: List[Tuple[str, str]] = [
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

    concepts = index["concepts"]
    mappings: List[BcioMapping] = []

    for (phrase, dimension), phrase_emb in zip(phrase_dim_pairs, phrase_embeddings):
        best_score = -1.0
        best_concept: Optional[Dict[str, Any]] = None
        for concept in concepts:
            score = _cosine_similarity(phrase_emb, concept["embedding"])
            if score > best_score:
                best_score = score
                best_concept = concept

        if best_concept is not None and best_score >= _BCIO_MIN_CONFIDENCE:
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
