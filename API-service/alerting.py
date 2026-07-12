"""Generic-SMTP critical-alert email helper for the API-service.

Standalone from llm_client.py's own logging — this fires an email (in
addition to the existing log line) when something needs a human's attention,
e.g. the LLM circuit breaker tripping. Uses stdlib smtplib only, no extra
dependency. Any SMTP relay/provider works (see .env.example's "Mail (generic
SMTP)" section) — no vendor-specific API.

Never let a slow/unreachable SMTP relay block the request path: sends use a
short timeout, any failure is logged and swallowed (not raised), and
fire_alert_email() runs the (synchronous, blocking) smtplib call in a worker
thread so it can't stall the asyncio event loop serving other requests.
"""
import asyncio
import logging
import os
import smtplib
from email.mime.text import MIMEText

logger = logging.getLogger(__name__)

_TIMEOUT_S = 5

# Fire-and-forget alert tasks must be referenced somewhere, or asyncio may
# garbage-collect them mid-flight (only a weak ref is held internally
# otherwise). This set exists purely to keep them alive until they finish.
_background_tasks: set[asyncio.Task] = set()


def fire_alert_email(subject: str, body: str) -> None:
    """Send a critical-alert email in the background — never blocks the
    caller's event loop, never raises. Call this from async request-handling
    code instead of send_alert_email() directly."""
    task = asyncio.create_task(asyncio.to_thread(send_alert_email, subject, body))
    _background_tasks.add(task)
    task.add_done_callback(_background_tasks.discard)


def send_alert_email(subject: str, body: str) -> None:
    """Best-effort critical-alert email — synchronous/blocking. Never raises.
    Prefer fire_alert_email() from async code."""
    host = os.getenv("SMTP_HOST", "")
    user = os.getenv("SMTP_USER", "")
    password = os.getenv("SMTP_PASS", "")
    to_addr = os.getenv("ALERT_EMAIL", "")

    if not (host and user and password and to_addr):
        logger.debug("send_alert_email: SMTP not configured — skipping alert %r", subject)
        return

    port = int(os.getenv("SMTP_PORT", "587"))
    from_addr = os.getenv("SMTP_FROM", "noreply@example.com")
    starttls = os.getenv("SMTP_STARTTLS", "true").lower() != "false"

    msg = MIMEText(body, "plain", "utf-8")
    msg["Subject"] = subject
    msg["From"] = from_addr
    msg["To"] = to_addr

    try:
        if starttls:
            with smtplib.SMTP(host, port, timeout=_TIMEOUT_S) as smtp:
                smtp.starttls()
                smtp.login(user, password)
                smtp.send_message(msg)
        else:
            with smtplib.SMTP_SSL(host, port, timeout=_TIMEOUT_S) as smtp:
                smtp.login(user, password)
                smtp.send_message(msg)
        logger.info("send_alert_email: sent %r to %s", subject, to_addr)
    except Exception as exc:  # noqa: BLE001 - alerting must never raise
        logger.warning("send_alert_email: failed to send %r: %s", subject, exc)
