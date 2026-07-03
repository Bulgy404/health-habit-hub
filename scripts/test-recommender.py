#!/usr/bin/env python3
"""Smoke-test the recommender service (API-service).

Checks /health, then POSTs /llm/recommend and reports timing plus the parsed
recommendations. Uses only the Python standard library.

Usage:
    python3 scripts/test-recommender.py                     # direct to recommender (localhost:8001)
    python3 scripts/test-recommender.py --goal "sleep better"
    python3 scripts/test-recommender.py --user-id <uuid>    # reuse a real user
    python3 scripts/test-recommender.py --cached            # repeat same goal to hit the Redis cache

Reads API_SERVICE_SECRET from .env in the repo root (or the environment).
"""
import argparse
import json
import os
import sys
import time
import urllib.error
import urllib.request
import uuid
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent


def load_secret() -> str:
    secret = os.environ.get("API_SERVICE_SECRET", "")
    if secret:
        return secret
    env_path = REPO_ROOT / ".env"
    if env_path.exists():
        for line in env_path.read_text().splitlines():
            if line.startswith("API_SERVICE_SECRET="):
                return line.split("=", 1)[1].strip()
    return ""


def request(url: str, method: str = "GET", body: dict | None = None,
            headers: dict | None = None, timeout: float = 300.0):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Content-Type", "application/json")
    for k, v in (headers or {}).items():
        req.add_header(k, v)
    start = time.monotonic()
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            elapsed = time.monotonic() - start
            return resp.status, json.loads(resp.read().decode() or "null"), elapsed
    except urllib.error.HTTPError as exc:
        elapsed = time.monotonic() - start
        try:
            payload = json.loads(exc.read().decode() or "null")
        except json.JSONDecodeError:
            payload = None
        return exc.code, payload, elapsed
    except Exception as exc:  # noqa: BLE001 — connection refused, timeout, etc.
        elapsed = time.monotonic() - start
        return None, str(exc), elapsed


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--url", default="http://localhost:8001",
                        help="Recommender base URL (default: %(default)s)")
    parser.add_argument("--user-id", default=str(uuid.uuid4()),
                        help="User ID (default: random UUID — pipeline degrades gracefully)")
    parser.add_argument("--goal", default=None,
                        help="Goal text (default: unique goal to bypass the Redis cache)")
    parser.add_argument("--cached", action="store_true",
                        help="Use a fixed goal so a second run exercises the Redis cache")
    parser.add_argument("--timeout", type=float, default=300.0,
                        help="Client timeout in seconds (default: %(default)s)")
    args = parser.parse_args()

    secret = load_secret()
    if not secret:
        print("FAIL: API_SERVICE_SECRET not found in environment or .env")
        return 1

    # 1. Health check — retry while the container finishes starting up
    deadline = time.monotonic() + 60
    while True:
        status, body, elapsed = request(f"{args.url}/health", timeout=10)
        if status == 200:
            print(f"OK:   /health -> 200 in {elapsed:.2f}s")
            break
        if time.monotonic() > deadline:
            print(f"FAIL: /health -> {status} ({body}) after retrying for 60s")
            print("Is the recommender running? Try: docker compose -f docker-compose.local.yml up -d recommender")
            return 1
        print(f"...   /health not ready yet ({status if status is not None else body}), retrying")
        time.sleep(2)

    # 2. Recommendation
    if args.goal:
        goal = args.goal
    elif args.cached:
        goal = "test: improve my sleep quality"
    else:
        goal = f"improve my sleep quality (test {int(time.time())})"

    payload = {"user_id": args.user_id, "goal": goal, "session_id": str(uuid.uuid4())}
    print(f"...   POST /llm/recommend  user_id={args.user_id}  goal={goal!r}")
    status, body, elapsed = request(
        f"{args.url}/api/v1/llm/recommend", "POST", payload,
        headers={"X-Service-Auth-Token": secret}, timeout=args.timeout,
    )

    if status is None:
        print(f"FAIL: request errored after {elapsed:.1f}s: {body}")
        return 1
    if status != 200:
        print(f"FAIL: /llm/recommend -> {status} after {elapsed:.1f}s")
        print(json.dumps(body, indent=2, ensure_ascii=False) if body else "(no body)")
        return 1

    recs = body.get("recommendations", [])
    print(f"OK:   /llm/recommend -> 200 in {elapsed:.1f}s, {len(recs)} recommendation(s)")
    if elapsed > 170:
        print("WARN: slower than the Node proxy timeout (180s) — app requests would 504")
    for i, rec in enumerate(recs, 1):
        uuids = rec.get("selected_habit_uuids", [])
        print(f"\n  [{i}] {rec.get('title', '(no title)')}")
        print(f"      {rec.get('body', '')[:200]}")
        print(f"      sources: {len(rec.get('sources', []))}, habit uuids: {len(uuids)}")
    if not recs:
        print("WARN: 200 but zero recommendations — LLM output may not have parsed")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
