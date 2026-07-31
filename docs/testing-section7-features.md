# Testing the §7 behavioral-principle features

Manual test guide for Habit Distinction (§7.4), Habit Stacking (§7.1),
Implementation Intention Reminder (§7.2), Information Overload (§7.3), and
Gamification (§7.5). Reference documentation: `DOCUMENTATION.md` §13.

---

## ⚠️ Read this first: the admin-portal gap

The new per-study/per-group settings (`habitStackingEnabled`,
`reminderContentMode`, `informationOverloadGuard`) and the tunable
`admin_settings` keys are **fully implemented and enforced in the backend**, but
they have **no toggles in the admin portal UI yet**. The admin Studies page was
not extended.

So "testing from the admin site" currently means one of:

| Path | Use for |
| --- | --- |
| **Admin REST API** (curl/Postman) | The study/group config. Fully implemented, Zod-validated, audit-logged — the same endpoints the portal itself uses. |
| **Direct Mongo** (`mongo-express` at `localhost:8081`, or `mongosh`) | The `admin_settings` tunables (unlock tier, reminder templates, gamification XP), which have no API and no UI — consistent with the pre-existing `reminder_weight_*` keys. |
| **Admin portal UI** | What *does* already work: Participants → Progress (created habits, SRHI check-ins) and the **fast-forward** dev tool, which is essential here. |

If you want real toggles in the portal, that's a follow-up task — see the end of
this document.

---

## 0. Setup

```bash
make dev          # start local stack
make seed         # seed Mongo, Neo4j, Keycloak
make ios          # run the Flutter app on the simulator
```

Local URLs (Traefik):

- API — `http://app.localhost/api/v1`
- Admin portal — `http://admin.localhost`
- Keycloak — `http://keycloak.localhost`
- mongo-express — `http://localhost:8081`
- Neo4j Browser — `http://localhost:7474`

`ENABLE_TEST_TOOLS=true` is already set in your local `.env` — this is what
exposes the fast-forward button. Confirm:

```bash
curl -s http://app.localhost/api/v1/admin/participants/test-tools \
  -H "Authorization: Bearer $ADMIN_TOKEN"
# {"enabled":true}
```

### Getting tokens

**Admin token** — simplest reliable path: log in to `http://admin.localhost`,
open DevTools → Network, and copy the `Authorization: Bearer …` header from any
`/api/v1/admin/...` request. Export it as `$ADMIN_TOKEN`.

**Participant token** — same trick against the running Flutter app, or via the
ROPC client (`hhh-ropc`) in the `hhh` realm:

```bash
curl -s -X POST \
  "http://keycloak.localhost/realms/hhh/protocol/openid-connect/token" \
  -d grant_type=password -d client_id=hhh-ropc \
  -d username=<participant> -d password=<password> | jq -r .access_token
```

### The single most useful verification endpoint

Everything the admin configures is resolved into one participant-facing payload.
After **any** admin change, call this as the participant and check the values:

```bash
curl -s http://app.localhost/api/v1/me/habit-config \
  -H "Authorization: Bearer $USER_TOKEN" | jq '{
    habitStackingEnabled, reminderContentMode,
    informationOverloadGuard, informationOverloadUnlockTier
  }'
```

This is the fastest admin→user feedback loop; use it before touching the app UI.

---

## 1. Admin-side testing

### 1a. Study- and group-level config (REST API)

Find your study and group ids:

```bash
curl -s http://app.localhost/api/v1/admin/studies \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  | jq '.studies[] | {id, name, habitStackingEnabled, reminderContentMode,
                      informationOverloadGuard,
                      groups: [.groups[] | {id, label}]}'
```

**Set study-level config** (`PUT /admin/studies/:id`):

```bash
curl -s -X PUT http://app.localhost/api/v1/admin/studies/$STUDY_ID \
  -H "Authorization: Bearer $ADMIN_TOKEN" -H 'Content-Type: application/json' \
  -d '{
    "habitStackingEnabled": false,
    "reminderContentMode": "implementation_intention",
    "informationOverloadGuard": { "enabled": true, "userOptOutAllowed": true }
  }'
```

**Set a group override** (`PATCH /admin/studies/:id/groups/:groupId/config`) —
non-null wins over the study value, `null` means inherit:

```bash
curl -s -X PATCH \
  http://app.localhost/api/v1/admin/studies/$STUDY_ID/groups/$GROUP_ID/config \
  -H "Authorization: Bearer $ADMIN_TOKEN" -H 'Content-Type: application/json' \
  -d '{ "habitStackingEnabled": true, "reminderContentMode": null }'
```

**What to verify:**

| Check | Expected |
| --- | --- |
| Study value with group `null` | `/me/habit-config` reflects the study value |
| Group value set | Group value wins over study |
| Group set back to `null` | Falls back to the study value |
| Unenrolled/public user | Defaults: stacking on, `generic`, guard off |
| Invalid enum (e.g. `"reminderContentMode": "loud"`) | `400` from Zod validation |
| Any change | Appears in the admin **Audit Log** (`update_study`) |

### 1b. `admin_settings` tunables (Mongo)

No API/UI — set these directly (mongo-express → `admin_settings`, or `mongosh`):

```js
// §7.3 — the tier an existing habit must reach to unlock another of its type.
// 'daily' | 'every_2_days' | 'twice_weekly' | 'weekly' (default) | 'off' (hard cap of 1)
db.admin_settings.updateOne({ key: 'information_overload_unlock_tier' },
  { $set: { value: 'every_2_days' } }, { upsert: true });

// §7.2 — rotating reminder phrasings ({cue} / {behavior} placeholders)
db.admin_settings.updateOne({ key: 'reminder_ii_templates' },
  { $set: { value: JSON.stringify([
      'TEST A: {cue} → {behavior}',
      'TEST B: when {cue}, {behavior}'
  ]) } }, { upsert: true });

// §7.5 — XP economy (exaggerate to make levelling obvious)
db.admin_settings.updateOne({ key: 'gamification_xp_per_log' },
  { $set: { value: 500 } }, { upsert: true });
db.admin_settings.updateOne({ key: 'gamification_level_curve_base' },
  { $set: { value: 50 } }, { upsert: true });
```

Verify: unlock tier via `/me/habit-config`; templates via
`GET /habits/intentions/reminder-plans`; XP via
`GET /habits/intentions/gamification`. Set a deliberately malformed value
(e.g. `reminder_ii_templates: "{not json"`) and confirm it falls back to the
defaults instead of erroring.

### 1c. Fast-forward (the key to time-dependent features)

Admin portal → **Participants** → open a participant's **Progress** panel →
**Fast-forward N days**. This shifts their whole timeline backwards (habit
`createdAt`, daily logs, SRHI windows), making future windows due now. Also
available as:

```bash
curl -s -X POST \
  http://app.localhost/api/v1/admin/participants/$PARTICIPANT_ID/fast-forward \
  -H "Authorization: Bearer $ADMIN_TOKEN" -H 'Content-Type: application/json' \
  -d '{"days": 14}'
```

Use this to reach reminder tier-ups, which drive the overload unlock, the
traffic light, and the *Building Momentum* / *Second Nature* badges.

### 1d. Admin views that already surface the new data

- **Participants → Progress** — "Created habits" lists real
  `implementation_intentions`; confirm build vs. quit habits both appear.
- **Neo4j Browser** (`localhost:7474`) — verify the graph signals directly:

```cypher
// §7.4 — build/quit on donated habits
MATCH (h:Habit) RETURN h.habit_type, count(*) ORDER BY count(*) DESC;

// §7.1 — the stacking network
MATCH (a:Habit)-[r:STACKED_WITH]->(b:Habit)
RETURN a.sentence AS anchor, b.sentence AS stacked, r.at;

// §7.4 — the one-property filter the bubble graph uses
MATCH (h:Habit {is_habit: true}) WHERE h.habit_type = 'quit' RETURN h LIMIT 25;
```

---

## 2. User-side testing (Flutter app)

### §7.4 Habit Distinction

1. My Habits → **New habit**. The first control is a **Build a new habit /
   Break a habit** segmented selector (green vs. red tint).
2. Create one of each.
3. **Expect:** build habits show a green card border + `+` icon; quit habits red
   + "no entry" icon.
4. Explore → bubble graph → **All / Build / Quit** filter chips; switching
   filters the bubbles (donated habits only).
5. **Negative test:** `POST /habits/intentions` without `habitType` → `400`.

### §7.1 Habit Stacking

*Requires `habitStackingEnabled` (default on).*

1. New habit → cue step → expand **"Stack onto an existing habit"**.
2. Either pick an existing habit from the dropdown (prefills the first cue with
   "After I …") **or** free-type an anchor you don't track.
3. Finish creation.
4. **Expect:** the new habit renders **indented beneath its anchor** with an
   elbow connector and a link icon; the *Habit Architect* badge appears in
   Profile → Achievements.
5. With community sharing on, the free-typed anchor is donated first and a
   `STACKED_WITH` edge appears in Neo4j (query above).
6. Test the merge endpoint directly:

```bash
curl -s -X POST http://app.localhost/api/v1/habits/stack-merge \
  -H "Authorization: Bearer $USER_TOKEN" -H 'Content-Type: application/json' \
  -d '{"anchor_text":"make my morning coffee","new_behavior_text":"take my vitamins","language":"en"}'
# → {"sentence":"After I make my morning coffee, I will take my vitamins."}
```

Also try `"language":"de"` — the sentence must come back in German, not
translated English.

7. **Negative test:** set `habitStackingEnabled: false` for the study → the
   stacking card disappears from the cue step.

### §7.2 Implementation Intention Reminder

1. Set `reminderContentMode: "implementation_intention"` (§1a) and custom
   templates (§1b).
2. In the app, create a habit with a reminder time a few minutes out, then pull
   to refresh My Habits (this re-syncs reminders).
3. **Expect** the scheduled notification body to read e.g.
   `TEST A: After dinner → Walking` rather than the generic
   "Your plan: stay on track today."
4. With several habits/reminders, consecutive notifications should cycle
   templates A → B → A (rotation by index).
5. Switch back to `generic` → notifications revert to the generic nudge.
6. Inspect the payload directly:

```bash
curl -s http://app.localhost/api/v1/habits/intentions/reminder-plans \
  -H "Authorization: Bearer $USER_TOKEN" \
  | jq '{reminderContentMode, reminderTemplates,
         plans: [.plans[] | {frequency, cueText, behaviorLabel}]}'
```

### §7.3 Information Overload

1. Admin: `informationOverloadGuard: {enabled: true, userOptOutAllowed: true}`,
   unlock tier `every_2_days` (reachable without SRHI — see §3).
2. In the app, create **one build habit**. An info card explaining the rationale
   appears on the creation path.
3. Try to create a **second build habit** → blocked, with the explanatory
   message (not a bare "limit reached").
4. Create a **quit habit** → **allowed**: caps are per type, not global.
5. Raise the first habit to the unlock tier (§3) → creating a second build habit
   now succeeds.
6. Settings → toggle **"Allow multiple new habits"** on → creation is
   unrestricted again.
7. **Negative tests:**
   - `userOptOutAllowed: false` → the toggle disappears from Settings, and
     `PATCH /me/preferences/information-overload-opt-out {"optOut":true}` →
     `403` (a stale client can't bypass the protocol).
   - Unlock tier `off` → a hard cap of 1 per type, even for a fully automatic
     habit.
   - Inspect the blocked response shape:

```bash
# → 409 {"reason":"information_overload","unlockTier":"...","currentTier":"..."}
```

### §7.5 Gamification

1. Create a habit → Profile → **Achievements** shows *First Step*, a level, and
   an XP bar; Settings shows a compact level + XP row.
2. **Expect** a one-time praise notification per newly earned badge, with
   rotating copy — and **no** notification on ordinary daily logs (this is the
   deliberate anti-"Overinvested" design).
3. Log the habit daily → XP rises; the badge does **not** re-fire.
4. Habit cards show a **traffic light**: red `daily` → amber
   `every_2_days`/`twice_weekly` → green `weekly`/`off`.
5. Reach a tier-up (§3) → *Building Momentum*; 14-day streak → *Steady Habit*;
   `off` tier → *Second Nature* (+ *Quit Champion* for a quit habit).
6. Inspect:

```bash
curl -s http://app.localhost/api/v1/habits/intentions/gamification \
  -H "Authorization: Bearer $USER_TOKEN" \
  | jq '{totalXp, level, xpToNextLevel,
         badges: [.badges[].badgeKey], newlyEarned}'
```

Call it twice — `newlyEarned` must be non-empty on the first call and empty on
the second (badges persist so they aren't re-notified).

---

## 3. Reaching a reminder tier-up (needed by §7.3 and §7.5)

The tier comes from `autonomyScore = 0.5·SRHI + 0.35·adherence14d + 0.15·streak`
(`reminderPlanService.js`), so tier-ups can't be clicked into existence.

**Option A — no SRHI needed (fastest).** 14 consecutive enacted days alone give
`0.35 + 0.15 = 0.50`, which clears the tier-1 threshold (0.45) →
`every_2_days`. Set the unlock tier to `every_2_days` and seed logs:

```js
// mongosh — 14 consecutive enacted days ending yesterday
const intentionId = ObjectId("<INTENTION_ID>");
const userId = "<KEYCLOAK_SUB>";
const docs = [];
for (let i = 1; i <= 14; i++) {
  const d = new Date(Date.now() - i * 864e5).toISOString().slice(0, 10);
  docs.push({ intentionId, userId, date: d, enacted: true, loggedAt: new Date() });
}
db.daily_behavior_logs.insertMany(docs);
```

Then re-open My Habits: the traffic light turns amber, *Building Momentum*
fires, and a second build habit becomes creatable.

**Option B — full automaticity (`weekly`/`off`, for *Second Nature* /
*Quit Champion*).** Also needs two consecutive strong SRHI weeks (hysteresis:
one good week is deliberately not enough):

```js
db.srhi_responses.insertMany([
  { intentionId, userId, weekNumber: 1, score: 6.5,
    scheduledFor: new Date(Date.now() - 14 * 864e5),
    submittedAt: new Date(Date.now() - 14 * 864e5), createdAt: new Date() },
  { intentionId, userId, weekNumber: 2, score: 6.8,
    scheduledFor: new Date(Date.now() - 7 * 864e5),
    submittedAt: new Date(Date.now() - 7 * 864e5), createdAt: new Date() },
]);
```

**Option C — through the UI only.** Log daily in the app, then use admin
fast-forward (§1c) to make SRHI check-ins due, complete them in My Habits with
high slider values, and repeat for a second week.

**Recovery check (worth doing):** stop logging for 4+ days → 7-day adherence
drops below 0.5 → the plan snaps straight back to `daily` (red light), and the
overload guard tightens again.

---

## 4. Automated tests

```bash
make test-backend   # Node: prettier + eslint + 486 unit + integration tests
make test-python    # API-service: 156 pytest (incl. stack-merge)
make test-flutter   # Flutter: analyze + widget/unit tests
make test-admin     # Admin: typecheck
```

`make test-flutter` and `make test-admin` were **not** runnable in the
environment where these features were written — run them locally first. You will
also want:

```bash
cd mobile && flutter gen-l10n   # regenerate localizations from the .arb files
```

The 15 new l10n keys were added to all five `.arb` files *and* hand-written into
the generated Dart files, so the app compiles as-is; regenerating keeps them
canonical. English strings are currently used as placeholders for de/fr/ja/nl —
translate them before any real study run.
