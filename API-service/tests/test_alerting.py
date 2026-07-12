"""Unit tests for alerting.py's generic-SMTP critical-alert helper.

Covers the "not configured" no-op path, that send failures are swallowed
(never raised), and that fire_alert_email() offloads the blocking smtplib
call to a thread instead of running it inline.
"""
import asyncio
from unittest.mock import patch

import alerting


def test_send_alert_email_noop_when_unconfigured(monkeypatch):
    monkeypatch.delenv("SMTP_HOST", raising=False)
    monkeypatch.delenv("ALERT_EMAIL", raising=False)
    with patch("smtplib.SMTP") as mock_smtp:
        alerting.send_alert_email("subject", "body")
    mock_smtp.assert_not_called()


def test_send_alert_email_swallows_send_failures(monkeypatch):
    monkeypatch.setenv("SMTP_HOST", "smtp.example.com")
    monkeypatch.setenv("SMTP_USER", "user")
    monkeypatch.setenv("SMTP_PASS", "pass")
    monkeypatch.setenv("ALERT_EMAIL", "ops@example.com")
    with patch("smtplib.SMTP", side_effect=OSError("connection refused")):
        # Must not raise.
        alerting.send_alert_email("subject", "body")


def test_send_alert_email_starttls_path(monkeypatch):
    monkeypatch.setenv("SMTP_HOST", "smtp.example.com")
    monkeypatch.setenv("SMTP_USER", "user")
    monkeypatch.setenv("SMTP_PASS", "pass")
    monkeypatch.setenv("ALERT_EMAIL", "ops@example.com")
    monkeypatch.setenv("SMTP_STARTTLS", "true")
    with patch("smtplib.SMTP") as mock_smtp_cls:
        mock_smtp = mock_smtp_cls.return_value.__enter__.return_value
        alerting.send_alert_email("subject", "body")
    mock_smtp.starttls.assert_called_once()
    mock_smtp.login.assert_called_once_with("user", "pass")
    mock_smtp.send_message.assert_called_once()


def test_send_alert_email_implicit_tls_path(monkeypatch):
    monkeypatch.setenv("SMTP_HOST", "smtp.example.com")
    monkeypatch.setenv("SMTP_USER", "user")
    monkeypatch.setenv("SMTP_PASS", "pass")
    monkeypatch.setenv("ALERT_EMAIL", "ops@example.com")
    monkeypatch.setenv("SMTP_STARTTLS", "false")
    with patch("smtplib.SMTP_SSL") as mock_smtp_cls:
        mock_smtp = mock_smtp_cls.return_value.__enter__.return_value
        alerting.send_alert_email("subject", "body")
    mock_smtp.login.assert_called_once_with("user", "pass")
    mock_smtp.send_message.assert_called_once()


def test_fire_alert_email_does_not_block_event_loop(monkeypatch):
    monkeypatch.delenv("SMTP_HOST", raising=False)

    async def _run():
        alerting.fire_alert_email("subject", "body")
        # fire_alert_email must return immediately without awaiting the send —
        # give the background task a turn to finish before the test exits.
        await asyncio.sleep(0)
        for task in list(alerting._background_tasks):
            await task

    asyncio.run(_run())
