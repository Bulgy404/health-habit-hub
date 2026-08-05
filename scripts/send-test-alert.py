#!/usr/bin/env python3
"""Send one real alert email through the configured SMTP relay.

Manual-only smoke test for alerting.py's critical-alert path — proves the
SMTP_HOST/SMTP_USER/SMTP_PASS/ALERT_EMAIL combo in .env actually delivers
mail, as opposed to the pytest suite's unit tests (API-service/tests/
test_alerting.py), which only verify the SMTP mechanics against a mocked
smtplib. Never run automatically (not part of `make test`/`make test-python`
— see API-service/tests/conftest.py's no_real_alert_emails fixture for why
those must NOT send real mail) — run this by hand whenever you want to
confirm the alerting pipeline is actually working end-to-end.

alerting.py only depends on the standard library, so this needs no venv.

Usage:
    python3 scripts/send-test-alert.py
"""
import logging
import os
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent


def load_env() -> None:
    """Populate os.environ from the repo-root .env, without overriding
    anything already set in the real environment."""
    env_path = REPO_ROOT / ".env"
    if not env_path.exists():
        return
    for line in env_path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        key = key.strip()
        if key and key not in os.environ:
            os.environ[key] = value.strip()


def main() -> int:
    load_env()
    sys.path.insert(0, str(REPO_ROOT / "API-service"))
    import alerting  # noqa: E402 — import after sys.path/env setup

    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")

    required = ["SMTP_HOST", "SMTP_USER", "SMTP_PASS", "ALERT_EMAIL"]
    missing = [k for k in required if not os.environ.get(k)]
    if missing:
        print(f"Not configured — missing: {', '.join(missing)}. Nothing sent.")
        return 1

    to_addr = os.environ["ALERT_EMAIL"]
    print(f"Sending a real test alert to {to_addr} via {os.environ['SMTP_HOST']} ...")
    alerting.send_alert_email(
        "✅ Test alert — health-habit-hub alerting pipeline",
        "This is a manually triggered test of alerting.py's send_alert_email(). "
        "If you're reading this, SMTP_HOST/SMTP_USER/SMTP_PASS/ALERT_EMAIL in "
        ".env are correctly configured and the alerting pipeline works.\n\n"
        "Sent by scripts/send-test-alert.py — safe to ignore.",
    )
    print(
        "Done. send_alert_email() never raises on failure (see alerting.py), so "
        "check the log line above: 'sent ...' means delivery succeeded, "
        "'failed to send ...' means it didn't — check the message for why."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
