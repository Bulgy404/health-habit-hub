"""Shared LLM client for the API-service.

Reads OPENAI_API_KEY, LLM_MODEL, and LLM_TEMPERATURE from environment variables
and exposes a single async helper for all modules.
"""
import logging
import os
import time
from typing import Optional

import openai

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
# Keep total time (attempts × timeout) below the Node proxy's
# RECOMMENDER_TIMEOUT_MS (default 180s), or the client sees a 504.
_timeout = float(os.getenv("LLM_TIMEOUT_S", "120"))
_max_retries = int(os.getenv("LLM_MAX_RETRIES", "0"))

# Per-model cooldown state: model name -> monotonic timestamp until which it
# should be treated as down. Process-local (per worker), which is fine here —
# each worker converges within one cooldown window of an outage starting.
_model_down_until: dict[str, float] = {}


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
                raise
            _mark_down(resolved_model)
            logger.warning(
                "chat_complete: model=%s failed after %.1fs (%s: %s) — marking it down for "
                "%.0fs, retrying once with LLM_FALLBACK_MODEL=%s",
                resolved_model, time.monotonic() - start, type(exc).__name__, exc,
                _fallback_cooldown_s, fallback_model,
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
        raise
    logger.info(
        "chat_complete done in %.1fs: model=%s", time.monotonic() - start, fallback_model
    )
    return response.choices[0].message.content or ""
