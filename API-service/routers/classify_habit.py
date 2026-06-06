"""POST /api/v1/llm/classify-habit — M1.1 Habit Classifier."""
from __future__ import annotations

import json
import logging
from pathlib import Path
from uuid import uuid4

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
_PROMPT_PATH = Path(__file__).parent.parent / "prompts" / "classify_habit.txt"
_PROMPT_TEMPLATE = _PROMPT_PATH.read_text(encoding="utf-8")


# ---------------------------------------------------------------------------
# Request / Response models
# ---------------------------------------------------------------------------
class ClassifyHabitRequest(BaseModel):
    """Input payload for the classify-habit endpoint."""

    sentence: str = Field(..., min_length=1, max_length=2000)
    language: str = Field(..., max_length=32)
    user_id: str = Field(..., max_length=128)


class ClassifyHabitResponse(BaseModel):
    """Classification result for a single habit sentence."""

    uuid: str
    sentence: str
    language: str
    is_habit: bool
    confidence: float


# ---------------------------------------------------------------------------
# Helper: cache key
# ---------------------------------------------------------------------------
def _cache_key(sentence: str, language: str) -> str:
    """Build a deterministic Redis key from sentence and language."""
    return make_cache_key("classify_habit", sentence, language)


# ---------------------------------------------------------------------------
# Endpoint
# ---------------------------------------------------------------------------
@router.post("/llm/classify-habit", response_model=ClassifyHabitResponse)
async def classify_habit(body: ClassifyHabitRequest) -> ClassifyHabitResponse:
    """Classify whether a sentence describes a habit and return a confidence score.

    Args:
        body: Validated request payload with the sentence, language, and user_id.

    Returns:
        ClassifyHabitResponse with is_habit flag, confidence score, and a fresh UUID.

    Raises:
        HTTPException: 503 if the LLM call fails or returns an unparseable response.
    """
    key = _cache_key(body.sentence, body.language)

    # --- cache read ---
    redis_client = await _get_redis()
    if redis_client is not None:
        try:
            cached = await redis_client.get(key)
            if cached:
                data = json.loads(cached)
                return ClassifyHabitResponse(
                    uuid=str(uuid4()),
                    sentence=body.sentence,
                    language=body.language,
                    is_habit=data["is_habit"],
                    confidence=data["confidence"],
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
        logger.error("LLM classify_habit call failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={"error": "Classifier unavailable", "code": "llm_unavailable"},
        ) from exc

    try:
        parsed = json.loads(raw.strip())
        is_habit: bool = bool(parsed["is_habit"])
        confidence: float = float(parsed["confidence"])
    except (json.JSONDecodeError, KeyError, TypeError) as exc:
        logger.error("LLM returned unexpected format: %r (%s)", raw, exc)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={"error": "Classifier returned invalid response", "code": "llm_invalid_response"},
        ) from exc

    # --- cache write ---
    if redis_client is not None:
        try:
            await redis_client.setex(
                key, _REDIS_TTL, json.dumps({"is_habit": is_habit, "confidence": confidence})
            )
        except Exception as exc:  # noqa: BLE001
            logger.warning("Redis write error (%s) — result not cached.", exc)

    return ClassifyHabitResponse(
        uuid=str(uuid4()),
        sentence=body.sentence,
        language=body.language,
        is_habit=is_habit,
        confidence=confidence,
    )
