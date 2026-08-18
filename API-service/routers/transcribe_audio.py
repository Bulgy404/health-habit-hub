"""Speech-to-text for habit donation's voice input.

Endpoints:
  POST /api/v1/llm/transcribe-audio — transcribe a short audio clip
"""
from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from pydantic import BaseModel

from auth import verify_service_token
from llm_client import transcribe_audio

logger = logging.getLogger(__name__)

router = APIRouter(dependencies=[Depends(verify_service_token)])

# Generous but bounded — a spoken habit sentence is a few seconds to at most
# a couple of minutes; this just guards against an oversized upload.
_MAX_AUDIO_BYTES = 25 * 1024 * 1024


class TranscribeResponse(BaseModel):
    transcript: str


@router.post("/llm/transcribe-audio", response_model=TranscribeResponse)
async def transcribe(file: UploadFile = File(...)) -> TranscribeResponse:
    """Transcribe an uploaded audio clip via the STT model alias.

    Stateless — nothing is persisted here. The Node backend decides
    separately whether/when to store the audio, only once an actual
    donation is submitted.
    """
    if not file.filename:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No filename provided.")

    content = await file.read()
    if len(content) > _MAX_AUDIO_BYTES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Audio file too large (max {_MAX_AUDIO_BYTES // (1024 * 1024)} MB).",
        )
    if not content:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Empty audio file.")

    try:
        transcript = await transcribe_audio(
            content, file.filename, file.content_type or "application/octet-stream"
        )
    except Exception as exc:
        logger.error("transcribe endpoint failed: %s: %s", type(exc).__name__, exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY, detail="Transcription failed."
        ) from exc

    return TranscribeResponse(transcript=transcript)
