"""
Seed Neo4j with the 100 test habits — two modes:

  --mode seed   (default)
      Direct path. Calls the API service with X-Service-Auth-Token,
      skipping habit classification. Fast, idempotent, no Keycloak needed.
      Uses 10 synthetic seed-user IDs.

      Requirements: API service + Neo4j running.

  --mode e2e
      Full end-to-end path. Onboards anonymous users via /onboard, obtains
      real JWTs, and donates habits through POST /habits/donate — identical
      to what the mobile app does. Validates the complete donation pipeline.

      Requirements: full stack running (Node.js backend + Keycloak + API
      service + Neo4j).

Usage:
    python3 scripts/seed-habits.py [--mode seed|e2e] [--concurrency N] [--habits N] [--dry-run]

Reads APP_LOCAL_PORT, RECOMMENDER_LOCAL_PORT, and API_SERVICE_SECRET from .env.
"""
from __future__ import annotations

import argparse
import asyncio
import datetime
import os
import time
import uuid as _uuid_mod
from pathlib import Path
from typing import Optional

import httpx
from neo4j import AsyncGraphDatabase, NotificationMinimumSeverity  # type: ignore[import]

# ---------------------------------------------------------------------------
# Load .env
# ---------------------------------------------------------------------------
def _load_env() -> None:
    env_path = Path(__file__).parent.parent / ".env"
    if not env_path.exists():
        return
    for line in env_path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        value = value.split("#")[0].strip()
        os.environ.setdefault(key.strip(), value)


_load_env()

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
_APP_BASE        = f"http://localhost:{os.environ.get('APP_LOCAL_PORT', '3000')}/api/v1"
_API_BASE        = f"http://localhost:{os.environ.get('RECOMMENDER_LOCAL_PORT', '8001')}/api/v1"
_NEO4J_URI       = os.environ.get("NEO4J_URI", "bolt://localhost:7687")
_NEO4J_USER      = os.environ.get("NEO4J_USER", "neo4j")
_NEO4J_PASSWORD  = os.environ.get("NEO4J_PASSWORD", "password")
_SECRET          = os.environ.get("API_SERVICE_SECRET", "")

# 10 synthetic seed users for --mode seed
_SEED_USERS = [f"seed-user-{i:02d}" for i in range(1, 11)]

# ---------------------------------------------------------------------------
# Habits
# ---------------------------------------------------------------------------
HABITS: list[tuple[str, str]] = [
    ("I make sure to get at least 10,000 steps in, even if I have to take an extra walk in the evening", "en"),
    ("Before checking my phone in the morning, I sit quietly and meditate for 20 minutes", "en"),
    ("I keep a large water bottle nearby and finish around 2 litres of water by the end of the day", "en"),
    ("Three times a week, I go to the gym and focus on a proper full-body workout", "en"),
    ("On weekdays, lunch usually includes a big salad with protein, vegetables, and a simple dressing", "en"),
    ("After dinner, I step outside for a short 10-minute walk to help myself unwind", "en"),
    ("Yoga is part of my morning routine before breakfast, even if I only have time for a few poses", "en"),
    ("I protect my sleep schedule by aiming for 8 hours of rest every night", "en"),
    ("Most nights, I read for half an hour before bed instead of scrolling on my phone", "en"),
    ("I take my vitamins with breakfast so I do not forget them later in the day", "en"),
    ("Whenever the weather allows it, I cycle to work instead of taking public transport or driving", "en"),
    ("Running three times a week helps me clear my head and keep my stamina up", "en"),
    ("Each morning starts with 20 push-ups to wake my body up", "en"),
    ("I have stopped adding sugar to my coffee and now drink it plain", "en"),
    ("By the end of the day, I try to have eaten at least five portions of vegetables", "en"),
    ("When stress builds up, I pause and use breathing exercises before reacting", "en"),
    ("Saturday mornings are for swimming, and I usually complete 40 laps", "en"),
    ("As soon as I get out of bed, I stretch for 10 minutes to loosen up", "en"),
    ("In the evening, I write a few lines in my journal to process the day", "en"),
    ("I follow an intermittent fasting schedule that fits naturally around my workday", "en"),
    ("I limit my recreational screen time to around 2 hours a day", "en"),
    ("A cold shower in the morning helps me feel alert and ready for the day", "en"),
    ("I eat breakfast every morning, even when the day starts early", "en"),
    ("To stay aware of my nutrition, I track my calories in an app each day", "en"),
    ("Most of my meals are cooked at home rather than ordered or eaten out", "en"),
    ("Cardio is scheduled three times a week, usually for about 30 minutes", "en"),
    ("Whenever I have the choice, I take the stairs instead of using the elevator", "en"),
    ("Flossing is part of my evening routine before I brush my teeth", "en"),
    ("I start the morning with green tea instead of rushing straight into coffee", "en"),
    ("Before going to sleep, I write down three things I appreciated that day", "en"),
    ("I try to be in bed before 10 pm so my mornings feel less rushed", "en"),
    ("Alcohol is something I avoid during the week", "en"),
    ("Twice a week, I make time for strength training and progressive overload", "en"),
    ("In the afternoon, I usually have a piece of fruit instead of a sugary snack", "en"),
    ("I spend at least 15 minutes outside in the morning sunlight", "en"),
    ("During work, I take a short 5-minute break every hour to reset my focus", "en"),
    ("At meals, I slow down, chew properly, and pay attention to when I feel full", "en"),
    ("I keep processed foods out of my daily routine as much as possible", "en"),
    ("My dog gets a 30-minute walk with me every morning, rain or shine", "en"),
    ("Pilates is booked into my week every Tuesday and Thursday", "en"),
    ("Every Monday morning, I weigh myself and use it as a simple progress check", "en"),
    ("Magnesium is part of my nighttime routine before I go to bed", "en"),
    ("Sundays are my digital detox days, with minimal phone and laptop use", "en"),
    ("After lunch, I take 5 minutes for deep breathing instead of jumping straight back into work", "en"),
    ("Most weekends, I go hiking and spend a few hours away from screens", "en"),
    ("A handful of nuts is my usual afternoon snack", "en"),
    ("After workouts, I spend 10 minutes foam rolling the muscles I trained", "en"),
    ("Before each meal, I drink a glass of water to stay hydrated and eat more mindfully", "en"),
    ("I use my commute to listen to a health or fitness podcast", "en"),
    ("In the evening, I complete a short core routine that includes sit-ups", "en"),
    ("My partner and I often take an evening walk together to talk and decompress", "en"),
    ("I practise mindfulness for 10 minutes a day, usually when I need a mental reset", "en"),
    ("After 2 pm, I avoid caffeine so it does not interfere with my sleep", "en"),
    ("On Sundays, I prepare several meals in advance for the coming week", "en"),
    ("Some mornings, I dance for 30 minutes as a fun way to get moving", "en"),
    ("For part of my workday, I switch to a standing desk instead of sitting the whole time", "en"),
    ("Oatmeal is my go-to weekday breakfast because it keeps me full for hours", "en"),
    ("I keep a consistent bedtime, even on nights when I am tempted to stay up later", "en"),
    ("To improve stability, I practise balance exercises for a few minutes each day", "en"),
    ("I take a probiotic supplement in the morning with my first meal", "en"),
    ("Most mornings, I practise tai chi in the park before the day gets busy", "en"),
    ("I keep red meat low in my diet and make room for fish twice a week", "en"),
    ("Before bed, I stretch for 15 minutes to release tension from the day", "en"),
    ("I keep a simple food diary so I can notice patterns in how I eat", "en"),
    ("Weekend bike rides are part exercise, part fresh air, and part stress relief", "en"),
    ("Three times a week, I use resistance bands for a quick strength session at home", "en"),
    ("When I feel anxious, I use box breathing to steady myself", "en"),
    ("A high-protein breakfast helps me stay full and avoid snacking too early", "en"),
    ("Before starting work, I meditate for 10 minutes to settle my mind", "en"),
    ("I like to walk barefoot on grass in the morning when the weather is warm enough", "en"),
    ("My morning smoothie usually includes spinach, fruit, and a source of protein", "en"),
    ("I do 5 minutes of jumping jacks in the morning when I need a quick energy boost", "en"),
    ("Social media stays off-limits before 9 am", "en"),
    ("On workdays, I sometimes take a 20-minute midday nap to recharge", "en"),
    ("Every hour at the computer, I look away from the screen and do a few eye exercises", "en"),
    ("Wednesday is fitness class day, and I treat it like a fixed appointment", "en"),
    ("I add berries to breakfast most mornings for extra fibre and antioxidants", "en"),
    ("In the mirror each morning, I practise positive self-talk instead of starting the day critically", "en"),
    ("Fast food is something I avoid completely, even when I am busy", "en"),
    ("At home, I do a 20-minute aerobics session to keep my daily movement up", "en"),
    ("I take fish oil capsules with breakfast as part of my supplement routine", "en"),
    ("During my lunch break, I go for a walk instead of staying at my desk", "en"),
    ("After waking up, I spend 10 minutes journaling before the day gets noisy", "en"),
    ("Legumes show up in my meals at least three times a week", "en"),
    ("Before sleep, I use a body scan meditation to relax from head to toe", "en"),
    ("Gratitude meditation is one of the first things I practise in the morning", "en"),
    ("During winter, I take vitamin D in the morning to support my routine", "en"),
    ("I start the day with 30 squats to activate my legs and get my blood moving", "en"),
    ("When cooking, I keep the salt moderate and rely more on herbs and spices", "en"),
    ("My phone stays out of the bedroom so I can fall asleep without distractions", "en"),
    ("In the afternoon, I switch from coffee to herbal tea", "en"),
    ("I practise pull-ups regularly and work on improving my strength over time", "en"),
    ("Before bed, I avoid sugary snacks because they make it harder for me to settle down", "en"),
    ("I track my steps and aim for at least 8,000 by the end of each day", "en"),
    ("My morning core work includes a 5-minute plank routine", "en"),
    ("I mostly follow a Mediterranean-style diet with vegetables, olive oil, fish, legumes, and whole grains", "en"),
    ("In the evening, I use yoga nidra when I want deep relaxation without intense movement", "en"),
    ("Spending time in nature on weekends is one of the ways I support my mental health", "en"),
    ("Before breakfast, I fit in 15 minutes of strength training when my schedule allows", "en"),
    ("During exercise, I practise nasal breathing to stay calm and controlled", "en"),
]

# ===========================================================================
# MODE: seed  (direct path — no Keycloak needed)
# ===========================================================================

def _service_headers() -> dict[str, str]:
    return {"X-Service-Auth-Token": _SECRET}


async def _warmup(client: httpx.AsyncClient) -> None:
    """Trigger BCIO index build and wait for the API service to be fully ready."""
    print("  Warming up API service (building BCIO index on first request)…", flush=True)
    for attempt in range(1, 13):  # up to 2 minutes
        try:
            r = await client.post(
                f"{_API_BASE}/llm/map-bcio",
                headers=_service_headers(),
                json={"uuid": "warmup", "context_phrases": {"BEHAVIOR": ["exercise"]}},
                timeout=120.0,
            )
            if r.status_code < 500:
                print(f"  API service ready (attempt {attempt}).\n")
                return
        except Exception:
            pass
        print(f"  Not ready yet, retrying in 10 s… ({attempt}/12)", flush=True)
        await asyncio.sleep(10)
    print("  Warning: API service did not warm up — proceeding anyway.\n")


async def _post_with_retry(client: httpx.AsyncClient, url: str, **kwargs) -> httpx.Response:
    """POST with up to 3 retries and exponential backoff on server errors."""
    for attempt in range(3):
        try:
            r = await client.post(url, **kwargs)
            if r.status_code < 500:
                return r
            await asyncio.sleep(2 ** attempt)
        except (httpx.RemoteProtocolError, httpx.ConnectError, httpx.ReadTimeout):
            if attempt == 2:
                raise
            await asyncio.sleep(2 ** attempt)
    raise httpx.RemoteProtocolError("Max retries exceeded", request=None)


async def _classify_context(client: httpx.AsyncClient, uuid: str, sentence: str, language: str) -> dict[str, list[str]]:
    dims = ["TIME", "PHYSICAL_SETTING", "PRIOR_BEHAVIOR", "OTHER_PEOPLE", "INTERNAL_STATE", "BEHAVIOR", "REASONING"]
    try:
        r = await _post_with_retry(client, f"{_API_BASE}/llm/classify-context",
                              headers=_service_headers(),
                              json={"uuid": uuid, "sentence": sentence, "language": language},
                              timeout=120.0)
        r.raise_for_status()
        data = r.json()
        return {d: data.get(d, []) for d in dims}
    except httpx.HTTPStatusError as exc:
        print(f"    classify-context failed: HTTP {exc.response.status_code} — {exc.response.text[:200]}")
        return {}
    except Exception as exc:
        print(f"    classify-context failed: {type(exc).__name__}: {exc}")
        return {}


async def _map_bcio(client: httpx.AsyncClient, uuid: str, context_phrases: dict) -> list[dict]:
    try:
        r = await _post_with_retry(client, f"{_API_BASE}/llm/map-bcio",
                              headers=_service_headers(),
                              json={"uuid": uuid, "context_phrases": context_phrases},
                              timeout=60.0)
        r.raise_for_status()
        return r.json().get("mappings", [])
    except Exception as exc:
        print(f"    map-bcio failed: {exc}")
        return []


async def _embed_texts(client: httpx.AsyncClient, texts: list[str]) -> list[list[float]]:
    try:
        r = await _post_with_retry(client, f"{_API_BASE}/llm/embed-batch",
                              headers=_service_headers(),
                              json={"texts": texts},
                              timeout=120.0)
        r.raise_for_status()
        return r.json().get("embeddings", [])
    except Exception as exc:
        print(f"    embed-batch failed: {exc}")
        return []


async def _write_to_neo4j(session, uuid: str, sentence: str, language: str,
                           user_id: str, context_phrases: dict, mappings: list) -> None:
    await session.run(
        """
        MERGE (h:Habit {uuid: $uuid})
        ON CREATE SET h.sentence=$sentence, h.language=$language, h.is_habit=true,
                      h.userID=$userID, h.created_at=$created_at, h.habit_confidence=1.0
        ON MATCH SET  h.sentence=$sentence, h.language=$language, h.userID=$userID
        """,
        uuid=uuid, sentence=sentence, language=language,
        userID=user_id, created_at=datetime.datetime.now(datetime.timezone.utc).isoformat(),
    )
    context_rows = [{"text": p.strip(), "dimension": d}
                    for d, ps in context_phrases.items() for p in ps if p.strip()]
    if context_rows:
        await session.run(
            """
            UNWIND $rows AS row
            MERGE (c:Context {text: row.text, dimension: row.dimension})
            WITH c, row MATCH (h:Habit {uuid: $uuid})
            MERGE (h)-[:HAS_CONTEXT {dimension: row.dimension}]->(c)
            """, rows=context_rows, uuid=uuid)
    if mappings:
        await session.run(
            """
            UNWIND $mappings AS m
            MERGE (b:BCIOConcept {bcio_concept_id: m.bcio_concept_id})
            ON CREATE SET b.bcio_concept_label=m.bcio_concept_label
            WITH b, m MERGE (c:Context {text: m.phrase, dimension: m.dimension})
            MERGE (c)-[r:MAPS_TO {phrase: m.phrase, dimension: m.dimension}]->(b)
            SET r.mapping_confidence=m.confidence
            """, mappings=mappings)


async def _store_embeddings(session, uuid: str, sentence: str,
                             context_phrases: dict, mappings: list,
                             client: httpx.AsyncClient) -> None:
    ctx_items = [{"text": p.strip(), "dimension": d}
                 for d, ps in context_phrases.items() for p in ps if p.strip()]
    bcio_items = [{"bcio_concept_id": m["bcio_concept_id"], "label": m["bcio_concept_label"]}
                  for m in mappings]
    texts = [sentence] + [c["text"] for c in ctx_items] + [b["label"] for b in bcio_items]
    embeddings = await _embed_texts(client, texts)
    if not embeddings or len(embeddings) != len(texts):
        print(f"    embedding mismatch ({len(embeddings)} vs {len(texts)}), skipping")
        return
    idx = 0
    await session.run("MATCH (h:Habit {uuid:$uuid}) SET h.embedding=$e",
                      uuid=uuid, e=embeddings[idx]); idx += 1
    if ctx_items:
        await session.run(
            "UNWIND $rows AS row MERGE (c:Context {text:row.text,dimension:row.dimension}) SET c.embedding=row.e",
            rows=[{**c, "e": embeddings[idx + i]} for i, c in enumerate(ctx_items)])
        idx += len(ctx_items)
    if bcio_items:
        await session.run(
            "UNWIND $rows AS row MATCH (b:BCIOConcept {bcio_concept_id:row.bcio_concept_id}) SET b.embedding=row.e",
            rows=[{**b, "e": embeddings[idx + i]} for i, b in enumerate(bcio_items)])


async def _seed_one(client, driver, sentence, language, user_id,
                    index, total, sem, dry_run) -> bool:
    async with sem:
        habit_uuid = str(_uuid_mod.uuid5(_uuid_mod.NAMESPACE_DNS, f"seed:{sentence}"))
        print(f"  [{index:3}/{total}] {sentence[:65]}…", flush=True)
        if dry_run:
            print(f"    dry-run: uuid={habit_uuid} user={user_id}")
            return True

        # Skip only if already fully enriched (embedding + at least one context phrase)
        async with driver.session() as s:
            rec = await (await s.run(
                """
                MATCH (h:Habit {uuid:$uuid})
                OPTIONAL MATCH (h)-[:HAS_CONTEXT]->(c:Context)
                RETURN h.embedding IS NOT NULL AS has_emb, count(c) AS ctx_count
                """,
                uuid=habit_uuid)).single()
            if rec and rec["has_emb"] and rec["ctx_count"] > 0:
                print(f"    already seeded, skipping"); return True

        ctx = await _classify_context(client, habit_uuid, sentence, language)
        mappings = await _map_bcio(client, habit_uuid, ctx)

        async with driver.session() as s:
            await _write_to_neo4j(s, habit_uuid, sentence, language, user_id, ctx, mappings)
            await _store_embeddings(s, habit_uuid, sentence, ctx, mappings, client)

        n_ctx = sum(len(v) for v in ctx.values())
        print(f"    ✓ user={user_id} ctx={n_ctx} bcio={len(mappings)}")
        return True


async def run_seed(concurrency: int, habit_count: int, dry_run: bool) -> None:
    if not _SECRET:
        raise SystemExit("API_SERVICE_SECRET not set — aborting.")
    habits = HABITS[:habit_count]
    total = len(habits)
    sem = asyncio.Semaphore(concurrency)
    print(f"Mode: seed (direct)  •  {total} habits  •  concurrency={concurrency}")
    print(f"API service: {_API_BASE}  •  Neo4j: {_NEO4J_URI}\n")
    driver = AsyncGraphDatabase.driver(
        _NEO4J_URI, auth=(_NEO4J_USER, _NEO4J_PASSWORD),
        notifications_min_severity=NotificationMinimumSeverity.OFF,
    )
    start = time.monotonic()
    try:
        async with httpx.AsyncClient(timeout=120.0) as client:
            await _warmup(client)
            results = await asyncio.gather(*[
                _seed_one(client, driver, sentence, language,
                          _SEED_USERS[i % len(_SEED_USERS)],
                          i + 1, total, sem, dry_run)
                for i, (sentence, language) in enumerate(habits)
            ], return_exceptions=True)
    finally:
        await driver.close()
    ok = sum(1 for r in results if r is True)
    errors = [r for r in results if isinstance(r, Exception)]
    if errors:
        print(f"\n  First error: {errors[0]}")
    print(f"\n{'─'*60}\nSeeded: {ok}/{total}  •  {time.monotonic()-start:.1f}s")


# ===========================================================================
# MODE: e2e  (full donation pipeline via /habits/donate)
# ===========================================================================

async def _wait_for_recommender(client: httpx.AsyncClient, timeout_s=600, poll_s=5.0) -> None:
    url = f"http://localhost:{os.environ.get('RECOMMENDER_LOCAL_PORT', '8001')}/health"
    deadline = time.monotonic() + timeout_s
    attempt = 0
    while time.monotonic() < deadline:
        attempt += 1
        try:
            r = await client.get(url, timeout=5.0)
            if r.status_code == 200:
                if attempt > 1:
                    print(f"  Recommender ready after {attempt} attempts.")
                return
        except Exception:
            pass
        print(f"  Recommender not ready, retrying in {poll_s:.0f}s…", flush=True)
        await asyncio.sleep(poll_s)
    raise RuntimeError("Recommender did not become ready within timeout.")


async def _onboard(client: httpx.AsyncClient) -> Optional[str]:
    try:
        r = await client.post(f"{_APP_BASE}/onboard")
        r.raise_for_status()
        return r.json()["access_token"]
    except Exception as exc:
        print(f"  [onboard] ERROR: {exc!r}")
        return None


async def _donate_one(client: httpx.AsyncClient, token_holder: list, sentence: str,
                       language: str, index: int, total: int, sem: asyncio.Semaphore) -> dict:
    async with sem:
        for attempt in range(2):
            try:
                r = await client.post(
                    f"{_APP_BASE}/habits/donate",
                    headers={"Authorization": f"Bearer {token_holder[0]}"},
                    json={"sentence": sentence, "language": language},
                    timeout=120.0,
                )
                if r.status_code == 401 and attempt == 0:
                    new_token = await _onboard(client)
                    if new_token:
                        token_holder[0] = new_token
                        print(f"  [{index:3}/{total}] token refreshed, retrying…", flush=True)
                        continue
                    return {"ok": False}
                r.raise_for_status()
                if r.status_code == 202:
                    print(f"  [{index:3}/{total}] queued ✓  — {sentence[:60]}", flush=True)
                    return {"ok": True, "queued": True}
                print(f"  [{index:3}/{total}] not a habit — {sentence[:60]}", flush=True)
                return {"ok": True, "is_habit": False}
            except httpx.HTTPStatusError as exc:
                if exc.response.status_code == 401 and attempt == 0:
                    new_token = await _onboard(client)
                    if new_token:
                        token_holder[0] = new_token
                        print(f"  [{index:3}/{total}] token refreshed, retrying…", flush=True)
                        continue
                print(f"  [{index:3}/{total}] ERROR: {exc!r} — {sentence[:60]}", flush=True)
                return {"ok": False}
            except Exception as exc:
                print(f"  [{index:3}/{total}] ERROR: {exc!r} — {sentence[:60]}", flush=True)
                return {"ok": False}
        return {"ok": False}


async def _e2e_user(client, habits, offsets, total, sem):
    token = await _onboard(client)
    if token is None:
        return [{"ok": False}] * len(habits)
    token_holder = [token]
    return await asyncio.gather(*[
        _donate_one(client, token_holder, sentence, language, offsets[i], total, sem)
        for i, (sentence, language) in enumerate(habits)
    ])


async def run_e2e(concurrency: int, habit_count: int) -> None:
    habits = HABITS[:habit_count]
    total = len(habits)
    chunk = max(1, (total + concurrency - 1) // concurrency)
    batches = [habits[i:i + chunk] for i in range(0, total, chunk)]
    n_users = len(batches)
    offsets = []
    idx = 1
    for b in batches:
        offsets.append(list(range(idx, idx + len(b))))
        idx += len(b)
    sem = asyncio.Semaphore(concurrency)
    print(f"Mode: e2e (donate)  •  {total} habits  •  {n_users} users  •  concurrency={concurrency}")
    print(f"Backend: {_APP_BASE}\n")
    async with httpx.AsyncClient(timeout=120.0) as client:
        print("Waiting for recommender…", flush=True)
        await _wait_for_recommender(client)
        print()
        start = time.monotonic()
        nested = await asyncio.gather(*[
            _e2e_user(client, batch, ofs, total, sem)
            for batch, ofs in zip(batches, offsets)
        ])
    results = [r for batch in nested for r in batch]
    elapsed = time.monotonic() - start
    queued    = sum(1 for r in results if r.get("queued"))
    not_habit = sum(1 for r in results if r.get("ok") and not r.get("queued"))
    errors    = sum(1 for r in results if not r.get("ok"))
    print(f"\n{'─'*60}")
    print(f"Queued for processing : {queued}")
    print(f"Not a habit           : {not_habit}")
    print(f"Errors                : {errors}")
    print(f"Time                  : {elapsed:.1f}s  ({total/elapsed:.1f} habits/s)")
    if queued:
        print(f"\nHabits are processing asynchronously in the BullMQ worker.")


# ===========================================================================
# Entry point
# ===========================================================================
if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--mode", choices=["seed", "e2e"], default="seed",
                        help="seed: direct API-service path (fast, no Keycloak). "
                             "e2e: full donation pipeline via /habits/donate (requires live stack).")
    parser.add_argument("--concurrency", type=int, default=3,
                        help="Max concurrent habits/users (default: 3)")
    parser.add_argument("--habits", type=int, default=len(HABITS),
                        help=f"Number of habits to process (default: {len(HABITS)})")
    parser.add_argument("--dry-run", action="store_true",
                        help="(seed mode only) Print what would happen without writing.")
    args = parser.parse_args()

    if args.mode == "seed":
        asyncio.run(run_seed(args.concurrency, args.habits, args.dry_run))
    else:
        if args.dry_run:
            parser.error("--dry-run is only supported in seed mode")
        asyncio.run(run_e2e(args.concurrency, args.habits))
