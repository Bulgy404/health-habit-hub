# DFG Study Integration Design
**Date:** 2026-06-01  
**Project:** CuB — Contextual Cues for Habit-Based Behavior Change (DFG Grant, TU Dresden / Jeannette Stark)  
**Status:** Approved

---

## 1. Context & Goals

The Health-Habit-Hub (HHH) serves two audiences from a single app:

- **General public** — downloads from the app store, uses habit donation + exploration + recommendations as today, and optionally forms new habits via the Implementation Intention module with an admin-configured default cue setup.
- **Study participants** — redeem a study code (already live: `HHH-XXXXX` onboarding screen), get assigned to one of six experimental conditions (C1–C6), and use a condition-configured version of the same Implementation Intention module.

The DFG study tests how **contextual cue dimensions** (quality, combination, person-cue fit) embedded in implementation intentions influence habit strength (SRHI) and behavioral enactment over a longitudinal field study (~9 months, N ≈ 1,000 enrolled, N = 600 analyzable).

Three hypotheses drive the data requirements:
- **H1** — cue dimensions influence habit strength (SRHI trajectory)
- **H2a** — cue dimensions influence daily behavior enactment
- **H2b** (exploratory) — cue dimensions influence dropout

### Non-goals
- The existing habit donation / exploration / recommendation pipeline is **not changed**.
- The existing questionnaire system is **not extended** for SRHI or implementation intention logic — these are separate first-class modules.
- No second app. One codebase, one app store listing.

---

## 2. Overall Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Flutter App                           │
│                                                          │
│  [Donate flow] ──── existing, unchanged                  │
│                                                          │
│  [My Habits tab] ── NEW: Implementation Intention        │
│                      └─ Behavior selection               │
│                      └─ Cue specification (condition-    │
│                           configured or public default)  │
│                      └─ Daily behavioral log             │
│                      └─ Heatmap + 7-day strip            │
│                                                          │
│  [SRHI prompt] ─── NEW: Weekly habit-strength check-in   │
│                      └─ Scheduled per intention date     │
│                      └─ Per habit, 12-item instrument    │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│               Node.js Backend (new routes)               │
│                                                          │
│  /api/v1/habits/intentions   IM CRUD + daily log         │
│  /api/v1/srhi                SRHI submit + schedule      │
│  /api/v1/me/habit-config     resolved cue config         │
│  /api/v1/admin/studies/:id/export   research CSV export  │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│                  MongoDB (new collections)               │
│                                                          │
│  implementation_intentions                               │
│  daily_behavior_logs                                     │
│  srhi_responses                                          │
│  cue_pools                                               │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│              Admin Panel (new pages)                     │
│                                                          │
│  /cue-pools                  manage pre-rated cues       │
│  /studies/:id/groups/:gid/cue-config  attach cue pool   │
│  /studies/:id/export         research data export        │
│  /settings  (extended)       public default cue config   │
└─────────────────────────────────────────────────────────┘
```

### Cue configuration resolution

```
study.groups[].cueConfig
       │
       ▼ (on enrollment)
enrollments.cueConfig  (snapshot at enrollment time)
       │
       ▼ (on app load)
GET /api/v1/me/habit-config  →  Flutter app
```

The Flutter app never needs to know whether a user is in a real study or on the public default — it consumes the resolved config from one endpoint and renders accordingly.

---

## 3. Module A: Implementation Intention & Cue Configuration

### 3.1 MongoDB collections

#### `implementation_intentions`

| Field | Type | Description |
|---|---|---|
| `_id` | ObjectId | |
| `userId` | string | Keycloak sub |
| `enrollmentId` | ObjectId\|null | null for public users |
| `studyId` | ObjectId\|null | |
| `groupId` | ObjectId\|null | |
| `behaviorKey` | string | e.g. `"walking"`, `"cycling"`, `"yoga"` |
| `behaviorLabel` | string | Localized display label |
| `durationMinutes` | number | 5–20 for study; user-defined for public |
| `cues` | array | 1 or 2 entries (see below) |
| `intentionStatement` | string | Assembled if-then statement stored for display and reminders |
| `status` | string | `"active"`, `"paused"`, `"completed"`, `"abandoned"` |
| `createdAt` | Date | |
| `updatedAt` | Date | |

**`cues[]` entry:**

| Field | Type | Description |
|---|---|---|
| `text` | string | The cue phrase |
| `cueId` | ObjectId\|null | Ref to `cue_pools`; null if self-selected |
| `source` | string | `"pre_rated"` or `"self_selected"` |

#### `daily_behavior_logs`

One document per calendar day per intention. Idempotent upsert on submission.

| Field | Type | Description |
|---|---|---|
| `_id` | ObjectId | |
| `intentionId` | ObjectId | Ref to `implementation_intentions` |
| `userId` | string | |
| `date` | string | `"YYYY-MM-DD"` |
| `enacted` | boolean | Did the user perform the behavior? |
| `loggedAt` | Date | |

Compound unique index on `(intentionId, date)`.

#### `cue_pools`

Researcher-managed pre-rated cues.

| Field | Type | Description |
|---|---|---|
| `_id` | ObjectId | |
| `text` | string | e.g. `"After dinner each evening"` |
| `quality` | string | `"low"` or `"high"` |
| `dimensions.stability` | number | 1–5, researcher-rated |
| `dimensions.salience` | number | 1–5 |
| `dimensions.specificity` | number | 1–5 |
| `domain` | string | e.g. `"physical_activity"` |
| `language` | string | `"en"` or `"de"` |
| `createdAt` | Date | |

### 3.2 Study group cue config

`study.groups[]` is extended with a `cueConfig` object:

```js
{
  id: ObjectId,
  label: string,            // e.g. "C3 — High quality, single cue"
  index: number,
  cueConfig: {
    cueCount: "single" | "multi",
    cueSource: "low_quality" | "high_quality" | "self_selected",
    cuePoolId: ObjectId | null,
    behaviorOptions: string[],   // allowed behavior keys
    maxHabits: number | null,    // 1 for study participants, null for public
  }
}
```

**Six study conditions:**

| Condition | `cueCount` | `cueSource` | Example intention |
|---|---|---|---|
| C1 | `single` | `low_quality` | "When I have some free time in the evening, I will go for a 20-min walk." |
| C2 | `multi` | `low_quality` | "When I get home in the evening and have some free time, I will go for a 20-min walk." |
| C3 | `single` | `high_quality` | "After dinner each evening, I will go for a 20-min walk." |
| C4 | `multi` | `high_quality` | "After dinner each evening, at home on weekdays, I will go for a 20-min walk." |
| C5 | `single` | `self_selected` | "After my morning coffee, I will go for a 20-min walk." |
| C6 | `multi` | `self_selected` | "After my morning coffee, on workdays at home, I will go for a 20-min walk." |

**Public default** (admin-configurable via `/settings`): defaults to `multi` / `high_quality`. Stored as `admin_settings` keys `default_cue_count` and `default_cue_source`. The default study's group `cueConfig` is populated from these on creation and can be edited via the admin panel.

### 3.3 API endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/v1/me/habit-config` | Returns resolved cue config for the authenticated user |
| `GET` | `/api/v1/habits/intentions` | List user's intentions |
| `POST` | `/api/v1/habits/intentions` | Create a new intention |
| `PATCH` | `/api/v1/habits/intentions/:id` | Update status or cues |
| `GET` | `/api/v1/habits/intentions/:id/logs` | Log history (`?from=&to=`) |
| `POST` | `/api/v1/habits/intentions/:id/logs` | Submit today's log (idempotent) |

`maxHabits` enforcement: if `maxHabits = 1` and the user already has an active intention, `POST /intentions` returns `409`.

---

## 4. Module B: SRHI Measurement System

The Self-Report Habit Index (Verplanken & Orbell 2003) is a 12-item scale (each 1–7). It is delivered **weekly relative to each intention's `createdAt` date**, independent of calendar time, and is entirely separate from the existing questionnaire system.

### 4.1 MongoDB collection: `srhi_responses`

| Field | Type | Description |
|---|---|---|
| `_id` | ObjectId | |
| `intentionId` | ObjectId | Which habit this measures |
| `userId` | string | |
| `studyId` | ObjectId\|null | |
| `groupId` | ObjectId\|null | |
| `weekNumber` | number | 1-indexed, relative to `intention.createdAt` |
| `scheduledFor` | Date | Date this window opened |
| `submittedAt` | Date\|null | null = not yet submitted |
| `items` | object | `{ srhi_1: number, ..., srhi_12: number }` (1–7 each) |
| `score` | number\|null | Mean of 12 items, computed on submission |

Compound unique index on `(intentionId, weekNumber)`.

### 4.2 Scheduling logic

- Window opens: `intention.createdAt + (weekNumber - 1) * 7 days`
- Window duration: 3 days (missed = `submittedAt` remains null)
- Study participants: up to 39 weeks
- Public users: indefinite until intention is abandoned/completed
- A background job (extending existing backup cron) pre-generates the next 4 week documents for each active intention, ensuring `GET /api/v1/srhi/due` is fast (read-only query).

### 4.3 API endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/v1/srhi/due` | Returns all open SRHI windows for the user |
| `POST` | `/api/v1/srhi/:intentionId/week/:weekNumber` | Submit responses; computes and stores score |
| `GET` | `/api/v1/srhi/:intentionId/trajectory` | Returns `[{ weekNumber, score, submittedAt }]` for sparkline |

---

## 5. Flutter UX

### 5.1 New "My Habits" tab

Added to the existing shell alongside Donate and Explore.

**Habit card** displays:
- Behavior label + intention statement
- 7-day log strip (7 circles: ✓ enacted / ✗ missed / ○ pending)
- SRHI score sparkline (last 4 weeks, shown after week 2)
- "Log today" button (primary action, disabled after today's log is submitted)

Tapping the card opens the **habit detail screen** with:
- Full heatmap (GitHub-style grid, one cell per day, color intensity = enacted)
- Full SRHI trajectory chart
- Edit / abandon actions

### 5.2 "New Habit" flow (3 screens)

**Screen 1 — Pick behavior**
Scrollable list from `habitConfig.behaviorOptions`. Study participants see a constrained list; public users see all options (walking, jogging, cycling, yoga, calisthenics, plus free-text for public).

**Screen 2 — Set your cue**
Depends on `cueSource`:
- `pre_rated`: shows assigned cue(s) from pool, participant reads and confirms. No editing.
- `self_selected`: structured free-text input with prompts ("When does this happen?", "Where are you?"). Minimum length validation.

**Screen 3 — Your plan**
Displays the assembled if-then statement:
> *"[Cue(s)], I will [behavior] for [duration] minutes."*

Participant confirms. This screen is also accessible later as the "reminder view" from the habit card.

### 5.3 SRHI prompt card

Appears at the top of the My Habits tab when `GET /api/v1/srhi/due` returns an open window. In-app card (not a push notification) to avoid clinical feel:
> *"Time for your weekly habit check-in — takes about 2 minutes."*

Tapping opens a full-screen 12-item form with 1–7 sliders. After submission: score shown with a brief encouraging label + sparkline update.

### 5.4 Onboarding routing change

- **Study participants** (code redeemed): after the study code screen, routed directly into "New Habit" flow step 1.
- **Public users** (skipped code): "My Habits" tab shows an empty state with a "Start forming a habit" CTA on first open.

### 5.5 Visualization widgets

**`HabitHeatmapWidget`**
- GitHub-style calendar grid
- Data source: `GET /api/v1/habits/intentions/:id/logs?from=&to=`
- Gaps (no log doc) rendered as grey (no judgment, not marked as missed)
- Scrollable horizontally, grouped by week

**`DayStripWidget`**
- Last 7 days as a row of 7 circles
- ✓ (green) = enacted, ✗ (red) = explicit miss logged, ○ (grey) = no log yet
- Lives on the habit card

**`SrhiSparklineWidget`**
- Mini line chart, last N weeks
- Data source: `GET /api/v1/srhi/:intentionId/trajectory`
- Shown on card after week 2; full chart on detail screen

---

## 6. Admin Panel Changes

### 6.1 `/cue-pools` (new page, `researcher` + `admin`)
- List, create, edit, delete pre-rated cues
- Fields: text, quality, stability/salience/specificity ratings, domain, language
- Bulk CSV import (columns: `text, quality, stability, salience, specificity, domain, language`)

### 6.2 `/studies/:id/groups/:groupId/cue-config` (new page, `researcher` + `admin`)
- Dropdown: `cueCount` (single/multi)
- Dropdown: `cueSource` (low_quality / high_quality / self_selected)
- Cue pool selector (filtered by quality when pre_rated)
- Behavior options checklist
- `maxHabits` toggle (1 = study, unlimited = public)
- Preview panel: shows an example intention statement for the selected config

### 6.3 `/studies/:id` dashboard (extended)
- Per-group enrollment count
- Weekly active rate (% of enrolled with ≥1 log in last 7 days)
- Cumulative dropout curve per condition
- Mean SRHI trajectory per condition (line chart)

### 6.4 `/studies/:id/export` (new page, `researcher` + `admin`)
- Date range picker
- Download ZIP containing three CSVs (see Section 7)

### 6.5 `/settings` (extended, `admin` only)
- "Public Default Cue Config" section
- Dropdowns for `default_cue_count` and `default_cue_source`
- Saves to `admin_settings` collection and syncs to default study group

---

## 7. Research Data Export

`GET /api/v1/admin/studies/:id/export` returns a ZIP with three R-ready CSV files.

### `srhi_trajectories.csv`
```
userId, studyId, groupLabel, cueSource, cueCount,
weekNumber, scheduledFor, submittedAt, score, missed
```
- One row per scheduled SRHI window
- Missed windows included with `score=NA, missed=TRUE`
- Feeds H1 nonlinear mixed-effects growth model

### `daily_logs.csv`
```
userId, studyId, groupLabel, cueSource, cueCount,
date, dayNumber, enacted, loggedAt
```
- One row per calendar day from enrollment
- Days with no log doc written as `enacted=NA`
- `dayNumber` = days since `intention.createdAt`
- Feeds H2a logistic random-intercept model

### `dropout.csv`
```
userId, studyId, groupLabel, enrolledAt, lastActiveDate,
droppedOutAt, daysObserved, dropped
```
- `droppedOutAt` = first day of a 14-day inactivity window
- `dropped = TRUE/FALSE`
- Feeds H2b time-to-event model

### Dropout detection (background job)
Daily cron (extending existing backup service) scans active enrollments. Any enrollment with no `daily_behavior_logs` or `srhi_responses` activity in 14 days gets `enrollment.droppedOutAt` stamped. Reversible: if participant becomes active again, `droppedOutAt` is cleared and the date appended to `enrollment.reactivations[]`.

**`enrollments` collection gets three new fields:**
```
lastActiveAt: Date          // updated on every log or SRHI submit
droppedOutAt: Date | null
reactivations: Date[]
```

---

## 8. Testing Strategy

### 8.1 Backend unit tests (Jest)

| Test file | Coverage |
|---|---|
| `intentionService.test.js` | Create/update/abandon, `maxHabits` enforcement (1 vs null), `habit-config` resolution for all 6 conditions + public default |
| `dailyLogService.test.js` | Idempotent upsert (same day = update not insert), date boundary (midnight UTC), `enacted` toggle |
| `srhiScheduler.test.js` | Window generation from `createdAt`, open/close timing, missed window detection, 39-week cap for study participants |
| `exportService.test.js` | CSV shape for all three files, NA handling for sparse data, dropout detection logic, reactivation rollback |
| `cueConfigResolution.test.js` | All 6 study conditions resolve correctly, public default fallback, admin_settings override |

### 8.2 Integration tests

Extend `Mongo.test.js` pattern:
- Full enrollment → cue config resolution → intention creation → daily log → SRHI submit flow
- `maxHabits=1` blocks second intention for study participant
- Default study fallback when no code used (skip-code path)
- Export produces valid CSV rows with correct NA padding

### 8.3 Test seed user (`scripts/seed-local.js`)

New `seedTestParticipant()` function creates:

| User | Condition | Habits | Data |
|---|---|---|---|
| `test-c1@hhh.test` | C1 (single, low quality) | 1 | 8 weeks SRHI + 56 daily logs |
| `test-c2@hhh.test` | C2 (multi, low quality) | 1 | 8 weeks SRHI + 56 daily logs |
| `test-c3@hhh.test` | C3 (single, high quality) | 1 | 8 weeks SRHI + 56 daily logs |
| `test-c4@hhh.test` | C4 (multi, high quality) | 1 | 8 weeks SRHI + 56 daily logs (dropped at day 30) |
| `test-c5@hhh.test` | C5 (single, self-selected) | 1 | 8 weeks SRHI + 56 daily logs |
| `test-c6@hhh.test` | C6 (multi, self-selected) | 1 | 8 weeks SRHI + 56 daily logs (dropped at day 45) |
| `test-public@hhh.test` | Public default | 3 | Mixed habits, varying log density |

Fake data characteristics:
- SRHI trajectories: ascending curve from ~3.0 to ~5.5, with realistic per-item variance
- Daily logs: ~80% enactment rate, random gaps, no logs on dropped participants after drop date
- Two participants marked as dropped (C4 at day 30, C6 at day 45) for H2b export testing

### 8.4 Flutter widget tests

| Test | Assertion |
|---|---|
| `HabitHeatmapWidget` | Renders grey cells for days with no log doc |
| `DayStripWidget` | Handles partial week at start of tracking (< 7 days) |
| SRHI form | Disables submit until all 12 items are answered |
| `habit-config` gate | `maxHabits=1` hides "New Habit" button when one active intention exists |

---

## 9. What Does Not Change

- Habit donation flow (`POST /api/v1/habits/donate`, Neo4j pipeline)
- Habit exploration and annotations
- Recommendation pipeline (LightRAG + FastAPI)
- Existing questionnaire system (`questionnaires`, `form_responses`)
- Study code generation and redemption logic
- Keycloak auth, roles, JWT validation
- Backup service (extended, not replaced)
- BCIO ontology integration

---

## 10. Resolved Design Decisions

1. **SRHI item wording** — resolved. Use the validated German/English translations from Mena et al. (2023, https://link.springer.com/article/10.1007/s11469-023-01057-3). Stem: “Behavior X is something…” / “Verhalten X ist etwas…”

| Item | English | German |
|---:|---|---|
| 1 | I do frequently | das ich häufig tue |
| 2 | I do automatically | das ich automatisch tue |
| 3 | I do without having to consciously remember | das ich tue, ohne mich bewusst erinnern zu müssen |
| 4 | that makes me feel weird if I do not do it | bei dem ich mich komisch fühle, wenn ich es nicht tue |
| 5 | I do without thinking | das ich tue, ohne darüber nachzudenken |
| 6 | that would require effort not to do it | das mich Anstrengung kosten würde, es nicht zu tun |
| 7 | that belongs to my daily, weekly, or monthly routine | das zu meiner täglichen, wöchentlichen oder monatlichen Routine gehört |
| 8 | I start doing before I realize I’m doing it | mit dem ich anfange, ohne zu bemerken, dass ich es tue |
| 9 | I would find hard not to do | das mir schwerfallen würde, es nicht zu tun |
| 10 | I have no need to think about doing | worüber ich nicht nachdenken muss, um es zu tun |
| 11 | that’s typically “me” | das typisch für mich ist |
| 12 | I have been doing for a long time | das ich schon seit langer Zeit mache |

These items are seeded as a hardcoded constant in the backend (not configurable — the SRHI is a validated instrument and must not be modified).

2. **Behavior option list** — resolved. Initial list: `walking`, `light_jogging`, `cycling`, `structured_calisthenics`, `yoga`. This list is **configurable via admin portal** per study group (`cueConfig.behaviorOptions`). The public default group starts with all five options.

3. **Cue pool seed data** — resolved. The implementation generates realistic seed cues for development/testing. Low-quality cues have low stability/salience/specificity ratings (e.g., “When I feel like it”, “When I have some free time”). High-quality cues have high ratings on all three dimensions (e.g., “After dinner each evening”, “After my morning coffee, at home”). The cue pool is fully manageable via the admin portal `/cue-pools` page.

4. **Notification strategy** — resolved. Cue-aware push reminders are delivered **server-side via Firebase Admin SDK** (existing Firebase project). The Node.js backend calls FCM directly — no third-party service needed. Reminder time is set per-intention by the participant (with a default configurable by researchers in the admin portal). Reminder content references the user’s cue text: *”[Cue] — time for your [behavior].”* e.g. *”After dinner — time for your walk.”* The existing `notificationService.js` and `push_notification_service.dart` are extended rather than replaced.
