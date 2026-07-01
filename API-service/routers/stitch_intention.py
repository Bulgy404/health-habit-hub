"""POST /api/v1/llm/stitch-intention — merge action + cues into an implementation intention sentence."""
from __future__ import annotations

import logging
from typing import List

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from auth import verify_service_token
from llm_client import chat_complete

logger = logging.getLogger(__name__)

router = APIRouter(dependencies=[Depends(verify_service_token)])

_SYSTEM_PROMPT = (
    "You are a health behaviour expert. "
    "Your task is to combine a physical activity and one or more situational cues "
    "into a single, natural-sounding implementation intention sentence in the "
    "format: 'When/After/Before [cue], I will [action].' "
    "Keep the sentence concise (one sentence, max 40 words). "
    "Do not add any commentary or explanation — output only the sentence."
)


class StitchIntentionRequest(BaseModel):
    """Input for stitching an implementation intention."""

    action: str = Field(..., min_length=1, max_length=500, description="The physical activity / behaviour")
    cues: List[str] = Field(..., min_length=1, max_length=5, description="Situational cues selected by the user")
    language: str = Field("en", max_length=10, description="ISO 639-1 output language code")


class StitchIntentionResponse(BaseModel):
    """Result: one implementation intention sentence."""

    sentence: str


@router.post("/llm/stitch-intention", response_model=StitchIntentionResponse)
async def stitch_intention(body: StitchIntentionRequest) -> StitchIntentionResponse:
    """Combine an action and cues into a single implementation intention sentence."""
    cue_list = "; ".join(body.cues)
    user_msg = (
        f"Action: {body.action}\n"
        f"Cues: {cue_list}\n"
        f"Output language: {body.language}\n\n"
        "Write the implementation intention sentence:"
    )

    raw = await chat_complete(
        messages=[
            {"role": "system", "content": _SYSTEM_PROMPT},
            {"role": "user", "content": user_msg},
        ],
        temperature=0.3,
    )

    sentence = raw.strip().strip('"').strip("'")
    return StitchIntentionResponse(sentence=sentence)
