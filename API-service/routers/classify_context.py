"""POST /api/v1/llm/classify-context — M1.2 Context Extractor."""
from __future__ import annotations

import json
import logging
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from auth import verify_service_token
from llm_client import chat_complete
from routers._cache import _REDIS_TTL, get_redis as _get_redis, make_cache_key

logger = logging.getLogger(__name__)

router = APIRouter(dependencies=[Depends(verify_service_token)])


# ---------------------------------------------------------------------------
# Prompt template
# ---------------------------------------------------------------------------
_PROMPT_PATH = Path(__file__).parent.parent / "prompts" / "classify_context.txt"
_PROMPT_TEMPLATE = _PROMPT_PATH.read_text(encoding="utf-8")

# The 7 BCIO context dimensions
_DIMENSIONS = [
    "TIME",
    "PHYSICAL_SETTING",
    "PRIOR_BEHAVIOR",
    "OTHER_PEOPLE",
    "INTERNAL_STATE",
    "BEHAVIOR",
    "REASONING",
]


# ---------------------------------------------------------------------------
# Request / Response models
# ---------------------------------------------------------------------------
class ClassifyContextRequest(BaseModel):
    """Input payload for the classify-context endpoint."""

    uuid: str = Field(..., max_length=128)
    sentence: str = Field(..., min_length=1, max_length=2000)
    language: str = Field(..., max_length=32)


class ClassifyContextResponse(BaseModel):
    """Classified context dimensions for a single habit sentence."""

    uuid: str
    sentence: str
    language: str
    TIME: list[str]
    PHYSICAL_SETTING: list[str]
    PRIOR_BEHAVIOR: list[str]
    OTHER_PEOPLE: list[str]
    INTERNAL_STATE: list[str]
    BEHAVIOR: list[str]
    REASONING: list[str]


# ---------------------------------------------------------------------------
# Helper: cache key
# ---------------------------------------------------------------------------
def _cache_key(sentence: str, language: str) -> str:
    """Build a deterministic Redis key from sentence and language."""
    return make_cache_key("classify_context", sentence, language)


def _empty_dimensions() -> dict:
    """Return a dict with all BCIO dimensions mapped to empty lists."""
    return {dim: [] for dim in _DIMENSIONS}


def _parse_llm_response(raw: str) -> dict:
    """Parse LLM JSON response into dimension dict; returns empty dims on error."""
    try:
        parsed = json.loads(raw.strip())
        result = {}
        for dim in _DIMENSIONS:
            val = parsed.get(dim, [])
            result[dim] = val if isinstance(val, list) else []
        return result
    except (json.JSONDecodeError, TypeError) as exc:
        logger.error("LLM returned unexpected format: %r (%s)", raw, exc)
        return _empty_dimensions()


# ---------------------------------------------------------------------------
# Endpoint
# ---------------------------------------------------------------------------
@router.post("/llm/classify-context", response_model=ClassifyContextResponse)
async def classify_context(body: ClassifyContextRequest) -> ClassifyContextResponse:
    """Classify a habit sentence into BCIO context dimensions using an LLM.

    Args:
        body: Validated request payload containing the habit sentence and language.

    Returns:
        ClassifyContextResponse with phrase lists for each of the 7 BCIO dimensions.

    Raises:
        HTTPException: 503 if the LLM call fails.
    """
    key = _cache_key(body.sentence, body.language)

    # --- cache read ---
    redis_client = await _get_redis()
    if redis_client is not None:
        try:
            cached = await redis_client.get(key)
            if cached:
                dims = json.loads(cached)
                return ClassifyContextResponse(
                    uuid=body.uuid,
                    sentence=body.sentence,
                    language=body.language,
                    **dims,
                )
        except Exception as exc:  # noqa: BLE001
            logger.warning("Redis read error (%s) — falling back to LLM.", exc)

    # --- LLM call ---
    prompt = _PROMPT_TEMPLATE.format(
        language=body.language,
        sentence=body.sentence,
    )
    try:
        raw = await chat_complete(
            messages=[{"role": "user", "content": prompt}],
            temperature=0.0,
        )
    except Exception as exc:  # noqa: BLE001
        logger.error("LLM classify_context call failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={"error": "Context classifier unavailable", "code": "llm_unavailable"},
        ) from exc

    dims = _parse_llm_response(raw)

    # --- cache write ---
    if redis_client is not None:
        try:
            await redis_client.setex(key, _REDIS_TTL, json.dumps(dims))
        except Exception as exc:  # noqa: BLE001
            logger.warning("Redis write error (%s) — result not cached.", exc)

    return ClassifyContextResponse(
        uuid=body.uuid,
        sentence=body.sentence,
        language=body.language,
        **dims,
    )
