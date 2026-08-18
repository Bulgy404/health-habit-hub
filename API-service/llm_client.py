"""Shared LLM client for the API-service.

Reads OPENAI_API_KEY, LLM_MODEL, and LLM_TEMPERATURE from environment variables
and exposes a single async helper for all modules.
"""
import logging
import os
import time
from typing import Optional

import openai

from alerting import fire_alert_email

logger = logging.getLogger(__name__)

_api_key = os.getenv("LLM_API_KEY", "")
_model = os.getenv("LLM_MODEL", "gpt-4o-mini")
# Single point of control (see .env.example): retried once, for any model
# this client is asked to use, when the primary call fails for backend-side
# reasons (connection error, timeout, 5xx, rate limit) — not for request
# errors like a malformed prompt, which would fail identically either way.
_fallback_model = os.getenv("LLM_FALLBACK_MODEL") or None
# Circuit breaker: once a model fails, skip straight to the fallback for this
# many seconds instead of re-paying a full timeout on every subsequent call.
# The next call after the cooldown expires probes the primary again, so
# recovery is automatic — no restart needed (see .env.example).
_fallback_cooldown_s = float(os.getenv("LLM_FALLBACK_COOLDOWN_S", "300"))
_temperature = float(os.getenv("LLM_TEMPERATURE", "0.2"))
_api_base = os.getenv("LLM_API_BASE")
# Speech-to-text model alias (SCADS.AI: openai/whisper-large-v3-turbo). Single
# model, no fallback/circuit-breaker dance like chat_complete's — there's
# nothing to fail over to yet.
_stt_model = os.getenv("LLM_STT_MODEL", "alias-stt")
# Keep total time (attempts × timeout) below the Node proxy's
# RECOMMENDER_TIMEOUT_MS (default 180s), or the client sees a 504.
_timeout = float(os.getenv("LLM_TIMEOUT_S", "120"))
_max_retries = int(os.getenv("LLM_MAX_RETRIES", "0"))

# Per-model cooldown state: model name -> monotonic timestamp until which it
# should be treated as down. Process-local (per worker), which is fine here —
# each worker converges within one cooldown window of an outage starting.
_model_down_until: dict[str, float] = {}

# Debounces the "total outage" alert (primary AND fallback both down) for
# LLM_FALLBACK_COOLDOWN_S: unlike the primary model, the fallback has no
# cooldown-skip of its own (it's retried on every request while the primary
# is down), so without this a persistent fallback outage would send one
# alert email per request instead of one per cooldown window.
_fallback_alerted_until: dict[str, float] = {}


def _in_cooldown(model_name: str) -> bool:
    return time.monotonic() < _model_down_until.get(model_name, 0.0)


def _mark_down(model_name: str) -> None:
    _model_down_until[model_name] = time.monotonic() + _fallback_cooldown_s


_RETRYABLE_ERRORS = (
    openai.APIConnectionError,
    openai.APITimeoutError,
    openai.InternalServerError,
    openai.RateLimitError,
)

if not _api_key or _api_key in ("REPLACE_WITH_YOUR_API_KEY", "CHANGE_THIS_API_KEY"):
    logger.warning(
        "LLM_API_KEY is not set or is a placeholder. "
        "LLM calls will fail until a valid key is provided."
    )

_client = openai.AsyncOpenAI(
    api_key=_api_key or "placeholder",
    base_url=_api_base or None,
    max_retries=_max_retries,
)


async def chat_complete(
    messages: list,
    model: Optional[str] = None,
    temperature: Optional[float] = None,
    max_tokens: Optional[int] = None,
) -> str:
    """Send a chat completion request and return the assistant reply text.

    Args:
        messages: List of OpenAI-format message dicts (role/content).
        model: Override LLM_MODEL env var for this call.
        temperature: Override LLM_TEMPERATURE env var for this call.
        max_tokens: Optional hard cap on the completion length.

    Returns:
        The assistant's reply as a plain string.
    """
    resolved_model = model or _model
    resolved_temperature = temperature if temperature is not None else _temperature
    prompt_chars = sum(len(str(m.get("content", ""))) for m in messages)
    extra: dict = {}
    if max_tokens is not None and max_tokens > 0:
        extra["max_tokens"] = max_tokens

    async def _call(use_model: str):
        return await _client.chat.completions.create(
            model=use_model,
            temperature=resolved_temperature,
            messages=messages,
            timeout=_timeout,
            **extra,
        )

    fallback_model = _fallback_model if _fallback_model != resolved_model else None
    has_fallback = fallback_model is not None
    start = time.monotonic()

    if has_fallback and _in_cooldown(resolved_model):
        logger.info(
            "chat_complete: model=%s is in cooldown (recently failed) — calling "
            "LLM_FALLBACK_MODEL=%s directly",
            resolved_model, fallback_model,
        )
    else:
        logger.info(
            "chat_complete start: model=%s prompt_chars=%d timeout=%.0fs",
            resolved_model, prompt_chars, _timeout,
        )
        try:
            response = await _call(resolved_model)
            _model_down_until.pop(resolved_model, None)
            logger.info(
                "chat_complete done in %.1fs: model=%s", time.monotonic() - start, resolved_model
            )
            return response.choices[0].message.content or ""
        except _RETRYABLE_ERRORS as exc:
            if not has_fallback:
                logger.error(
                    "chat_complete failed after %.1fs: model=%s %s: %s",
                    time.monotonic() - start, resolved_model, type(exc).__name__, exc,
                )
                # No fallback configured, so _model_down_until/_in_cooldown are
                # otherwise unused for this model — reuse them purely as an
                # alert debounce so a persistent outage sends one email per
                # LLM_FALLBACK_COOLDOWN_S instead of one per failed request.
                if not _in_cooldown(resolved_model):
                    _mark_down(resolved_model)
                    fire_alert_email(
                        f"🚨 LLM model unavailable: {resolved_model}",
                        f"chat_complete failed after {time.monotonic() - start:.1f}s "
                        f"for model={resolved_model} ({type(exc).__name__}: {exc}). "
                        "No LLM_FALLBACK_MODEL is configured, so this request failed "
                        "with no retry. This alert won't repeat for "
                        f"{_fallback_cooldown_s:.0f}s.",
                    )
                raise
            # _mark_down() only fires once per LLM_FALLBACK_COOLDOWN_S window per
            # model (subsequent calls take the "already in cooldown" branch above
            # and skip straight to the fallback), so this alert is naturally
            # debounced — no separate rate-limiting needed here.
            _mark_down(resolved_model)
            logger.warning(
                "chat_complete: model=%s failed after %.1fs (%s: %s) — marking it down for "
                "%.0fs, retrying once with LLM_FALLBACK_MODEL=%s",
                resolved_model, time.monotonic() - start, type(exc).__name__, exc,
                _fallback_cooldown_s, fallback_model,
            )
            fire_alert_email(
                f"🚨 LLM model unavailable: {resolved_model}",
                f"chat_complete failed after {time.monotonic() - start:.1f}s "
                f"for model={resolved_model} ({type(exc).__name__}: {exc}). "
                f"Falling back to LLM_FALLBACK_MODEL={fallback_model} for the next "
                f"{_fallback_cooldown_s:.0f}s. This alert won't repeat until the "
                "cooldown expires and the primary model fails again.",
            )
        except Exception as exc:
            logger.error(
                "chat_complete failed after %.1fs: model=%s %s: %s",
                time.monotonic() - start, resolved_model, type(exc).__name__, exc,
            )
            raise

    # Reached only when skipping a known-down primary, or it just failed above.
    assert fallback_model is not None
    try:
        response = await _call(fallback_model)
    except Exception as exc:
        logger.error(
            "chat_complete fallback failed after %.1fs: model=%s %s: %s",
            time.monotonic() - start, fallback_model, type(exc).__name__, exc,
        )
        if time.monotonic() >= _fallback_alerted_until.get(fallback_model, 0.0):
            _fallback_alerted_until[fallback_model] = time.monotonic() + _fallback_cooldown_s
            fire_alert_email(
                f"🚨 LLM totally unavailable: {resolved_model} and fallback {fallback_model}",
                f"Both the primary model ({resolved_model}, already in cooldown) and "
                f"LLM_FALLBACK_MODEL ({fallback_model}) failed. Last error after "
                f"{time.monotonic() - start:.1f}s: {type(exc).__name__}: {exc}. "
                "All LLM-backed features are currently down. This alert won't "
                "repeat for the same fallback model until the cooldown expires.",
            )
        raise
    logger.info(
        "chat_complete done in %.1fs: model=%s", time.monotonic() - start, fallback_model
    )
    return response.choices[0].message.content or ""


async def transcribe_audio(audio_bytes: bytes, filename: str, mime_type: str) -> str:
    """Transcribe a short audio clip via the STT model alias.

    Reuses the same OpenAI-compatible client/credentials as chat_complete —
    no separate credential wiring for speech-to-text.

    Args:
        audio_bytes: Raw audio file content.
        filename: Original filename (extension matters to the API — it
            infers the audio format from it).
        mime_type: Content-Type of the uploaded file.

    Returns:
        The transcribed text.
    """
    start = time.monotonic()
    logger.info(
        "transcribe_audio start: model=%s filename=%s bytes=%d",
        _stt_model, filename, len(audio_bytes),
    )
    try:
        response = await _client.audio.transcriptions.create(
            model=_stt_model,
            file=(filename, audio_bytes, mime_type),
            timeout=_timeout,
        )
        logger.info(
            "transcribe_audio done in %.1fs: model=%s", time.monotonic() - start, _stt_model
        )
        return response.text or ""
    except Exception as exc:
        logger.error(
            "transcribe_audio failed after %.1fs: model=%s %s: %s",
            time.monotonic() - start, _stt_model, type(exc).__name__, exc,
        )
        raise
