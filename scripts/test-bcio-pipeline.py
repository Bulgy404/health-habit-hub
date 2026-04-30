"""
Simulate multiple users donating habits concurrently through the full backend
pipeline (classify → context → BCIO → Neo4j).

Usage:
    python3 scripts/test-bcio-pipeline.py [--concurrency N] [--habits N]

Each simulated user is onboarded anonymously, then donates their habits with
a real JWT token — identical to what the mobile app does.

Reads APP_LOCAL_PORT (default 3000) from .env.
"""

import argparse
import asyncio
import os
import time
from pathlib import Path
from typing import Optional

import httpx

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

APP_BASE = f"http://localhost:{os.environ.get('APP_LOCAL_PORT', '3000')}/api/v1"
_RECOMMENDER_BASE = f"http://localhost:{os.environ.get('RECOMMENDER_LOCAL_PORT', '8001')}"

# ---------------------------------------------------------------------------
# Readiness check — wait for the recommender to finish loading
# ---------------------------------------------------------------------------
async def wait_for_recommender(
    client: httpx.AsyncClient,
    timeout_s: int = 600,
    poll_s: float = 5.0,
) -> None:
    """Poll the recommender /health endpoint until it responds 200."""
    url = f"{_RECOMMENDER_BASE}/health"
    deadline = time.monotonic() + timeout_s
    attempt = 0
    while time.monotonic() < deadline:
        attempt += 1
        try:
            r = await client.get(url, timeout=5.0)
            if r.status_code == 200:
                if attempt > 1:
                    print(f"  Recommender ready after {attempt} attempts.", flush=True)
                return
            print(
                f"  Recommender not ready (HTTP {r.status_code}), retrying in {poll_s:.0f}s …",
                flush=True,
            )
        except Exception as exc:
            print(
                f"  Recommender unreachable ({type(exc).__name__}), retrying in {poll_s:.0f}s …"
                " (may still be building the BCIO embedding index)",
                flush=True,
            )
        await asyncio.sleep(poll_s)
    raise RuntimeError(
        f"Recommender did not become ready within {timeout_s}s. "
        "Check 'docker compose logs recommender'."
    )

# ---------------------------------------------------------------------------
# 100 test habits (sentence, language)
# ---------------------------------------------------------------------------
HABITS = [
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

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
async def onboard_user(client: httpx.AsyncClient) -> Optional[str]:
    """Create an anonymous user and return their access token."""
    try:
        r = await client.post(f"{APP_BASE}/onboard")
        r.raise_for_status()
        return r.json()["access_token"]
    except Exception as exc:
        print(f"  [onboard] ERROR: {type(exc).__name__}: {exc!r}", flush=True)
        return None


async def donate_habit(
    client: httpx.AsyncClient,
    token: str,
    sentence: str,
    language: str,
    index: int,
    total: int,
    sem: asyncio.Semaphore,
) -> dict:
    async with sem:
        try:
            r = await client.post(
                f"{APP_BASE}/habits/donate",
                headers={"Authorization": f"Bearer {token}"},
                json={"sentence": sentence, "language": language},
            )
            r.raise_for_status()
            data = r.json()
            status = "habit" if data.get("is_habit") else "not a habit"
            print(f"  [{index:3}/{total}] {status} — {sentence[:60]}", flush=True)
            return {"ok": True, "is_habit": data.get("is_habit", False)}
        except Exception as exc:
            print(
                f"  [{index:3}/{total}] ERROR: {type(exc).__name__}: {exc!r} — {sentence[:60]}",
                flush=True,
            )
            return {"ok": False}


async def run_user(
    client: httpx.AsyncClient,
    habits: list,
    global_offsets: list,
    total: int,
    sem: asyncio.Semaphore,
) -> list:
    token = await onboard_user(client)
    if token is None:
        return [{"ok": False}] * len(habits)

    tasks = [
        donate_habit(client, token, sentence, language, global_offsets[i], total, sem)
        for i, (sentence, language) in enumerate(habits)
    ]
    return await asyncio.gather(*tasks)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
async def run(concurrency: int, habit_count: int) -> None:
    habits = HABITS[:habit_count]
    total = len(habits)

    # Distribute habits across concurrent users as evenly as possible
    chunk = max(1, (total + concurrency - 1) // concurrency)
    user_batches = [habits[i : i + chunk] for i in range(0, total, chunk)]
    n_users = len(user_batches)

    print(f"Donating {total} habits via {n_users} concurrent users (chunk={chunk})")
    print(f"Backend:     {APP_BASE}")
    print(f"Recommender: {_RECOMMENDER_BASE}\n")

    sem = asyncio.Semaphore(concurrency)

    # Compute global 1-based index for each habit across all user batches
    global_offsets: list[list[int]] = []
    idx = 1
    for batch in user_batches:
        global_offsets.append(list(range(idx, idx + len(batch))))
        idx += len(batch)

    async with httpx.AsyncClient(timeout=120.0) as client:
        print("Checking recommender readiness …", flush=True)
        await wait_for_recommender(client)
        print()

        start = time.monotonic()
        results_nested = await asyncio.gather(
            *[
                run_user(client, batch, offsets, total, sem)
                for batch, offsets in zip(user_batches, global_offsets)
            ]
        )

    elapsed = time.monotonic() - start
    results = [r for batch in results_nested for r in batch]

    donated = sum(1 for r in results if r.get("is_habit"))
    not_habit = sum(1 for r in results if r.get("ok") and not r.get("is_habit"))
    errors = sum(1 for r in results if not r.get("ok"))

    print(f"\n{'─' * 60}")
    print(f"Total habits   : {total}")
    print(f"Donated to Neo4j: {donated}")
    print(f"Not a habit    : {not_habit}")
    print(f"Errors         : {errors}")
    print(f"Time           : {elapsed:.1f}s  ({total/elapsed:.1f} habits/s)")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--concurrency", type=int, default=5, help="Concurrent users")
    parser.add_argument("--habits", type=int, default=len(HABITS), help="Number of habits to donate")
    args = parser.parse_args()
    asyncio.run(run(args.concurrency, args.habits))
