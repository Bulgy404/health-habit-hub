<!--
  Design document — APPROVED, NOT YET IMPLEMENTED (as of 2026-09-04).
  Status: planning complete; no code written.
  Phase 0 (recommendation lineage fix, disk/memory alerting) is independently
  valuable and can ship without the rest.
  See also: docs/identity-mode-plan.md, docs/runbook.md, DEPLOYMENT.md.
-->

# Product Analytics — self-hosted PostHog on the study VM

## Context

During a running study we cannot currently answer basic questions about how the app is actually used. What exists today is either **infrastructure metrics with no user dimension** (`app/middleware/metrics.js` → Prometheus: one HTTP histogram and a BullMQ failure counter) or **study-outcome analytics derived from domain records** (`app/services/studyAnalyticsService.js` → DAU/WAU, SRHI trajectories, dropout, questionnaire completion). There is **no event stream at all** — no screen views, no funnel primitives, no client-side emission, and no collection to hold them.

Four things are invisible as a result, and each changes a decision:

1. **Funnel drop-off.** Onboarding is five screens (`welcome → consent → passphrase → profile-setup → study-code`) and habit creation is four (`behavior → cue → stitching → confirm`). We only see who finishes. If a large share abandons at the 24-word passphrase screen — the scariest screen in the app — nothing surfaces it.
2. **Whether recommendations are followed.** Currently *unmeasurable, not merely unmeasured*: `results_screen.dart` `_addToHabits()` drops the `recommendation_id` on the floor, `implementation_intentions` has no field to receive it, and the documented `recommendations_log` collection is read by `adminStatsService.js:84` but **written by nothing**, so the participant drawer permanently shows `accepted: 0, dismissed: 0`.
3. **Notification effectiveness.** Sends are recorded at campaign granularity only — no delivery, no open, no tap, no "did they log a behaviour after the reminder". We run an adaptive reminder algorithm (`reminderPlanService.js` fades frequency as automaticity rises) with **no feedback signal**.
4. **Real engagement vs logging.** `enrollments.lastActiveAt` is touched by exactly two code paths (a daily log, an SRHI submit). Someone who opens the app daily and browses is indistinguishable from a dropout. `participants.lastActive` is set to `null` at creation and never written again.

Plus one research-validity concern that is not a product question: **per-arm app health**. Recommendation generation proxies to the Python service with a **180 s timeout** and we have no idea of the p95 or timeout rate. If arm 3 waits longer than arm 1, that is an unplanned intervention difference confounding the outcome data.

### Decisions already taken

| | |
|---|---|
| Tool | **Self-hosted PostHog** on the existing VM |
| Identifiability | **Per-user, no opt-out** — telemetry framed as part of study participation; consent already covers app analytics |
| Recommendation lineage | **Fix end to end** — carry `recommendation_id` into `implementation_intentions` |
| Retention | Raw **1 year**, rollups indefinitely, rollups exportable on demand |
| Export | Both the per-study export ZIP **and** an on-demand rollup export |

### Capacity — measured, not estimated

`free -h` / `docker stats` on `habitvm`: **15 GiB total, 3.6 GiB used by 23 containers, ~10 GiB available**, 5 GiB swap untouched, **8 vCPU**, and `/data` (ext4, 1 TB) with **940 GB free**. PostHog's documented recommendation is a dedicated 4 vCPU / 16 GB / >30 GB box; its hobby minimum is ~4 GB. A tuned instance at this scale lands ~5–8 GB. **It fits, with less headroom than ideal.**

### Risks accepted (state these in the DPIA and the runbook)

- **Event ceiling.** PostHog advises migrating to Cloud above ~100k–300k events/month. At 200 participants × 100 events/day that is ~600k/month — **2–6× over**. Advisory, not a hard cap, but it is why §3 imposes an event budget rather than instrumenting everything.
- **No versions.** Self-hosted ships continuously from master; you cannot pin a known-good release for a multi-year study. Mitigate by pinning a specific image **digest** in compose and upgrading deliberately, off-study-critical periods, after a restore drill.
- **No support, no published CVEs** for self-hosted. Security patching is "track master".
- **SSO is Cloud-only.** Self-hosted means local PostHog email/password accounts, not Keycloak. Keep the account list short and document offboarding.
- **Headroom shrinks** as the graph and participant count grow. §7 adds the alerting that currently does not exist.

---

## 1. Deployment

**Separate compose stack**, not merged into the 23-service `docker-compose.yml` — so PostHog can be restarted, upgraded or removed without touching the study platform. New file `posthog/docker-compose.posthog.yml` (+ `posthog/README.md`), based on PostHog's `docker-compose.hobby.yml`.

Services: `posthog-web`, `posthog-worker`, `posthog-plugin-server`, `clickhouse`, `kafka`, `posthog-db` (Postgres), `posthog-redis`. **Drop PostHog's bundled Caddy** — Traefik already terminates TLS. **Drop MinIO** unless session replay is enabled, which it is not (§4).

Non-negotiables, each of which addresses a specific risk above:

- **`mem_limit` on every container.** ClickHouse by design expands into whatever is free; without a cap the kernel OOM-killer picks the largest RSS on the host, which is Neo4j or Mongo — i.e. analytics would take down the study platform. Suggested start: ClickHouse 3g, Kafka 1.5g, plugin-server 1g, web 1g, worker 1g, Postgres 512m, Redis 256m. Tune from `docker stats`, do not remove.
- **All volumes on `/data`** (Docker's `data-root` is already `/data/docker`), never the 20 GB btrfs root — see [DEPLOYMENT.md § 7](../DEPLOYMENT.md#7-server-storage-layout).
- **Pin the image by digest**, not `:latest`, despite PostHog's advice. Record the digest in `posthog/README.md` with the date and who verified it.
- **Traefik route** on the existing `hhh-proxy` network at `analytics.${DOMAIN}` (or `${DOMAIN}/analytics`), `websecure` + `letsencrypt`, plus a rate-limit middleware. It must **not** be reachable without TLS.
- **No network path from PostHog to `mongo` or `neo4j`.** Verify by inspecting the `networks:` lists — the cheapest structural control available.

---

## 2. What to track — the event taxonomy

Deliberately an **allowlist**, defined once in a shared registry, not autocapture (§4). Grouped by the question each answers.

**Onboarding funnel** (the highest-value set — five steps, currently invisible)
`onboarding_started`, `consent_viewed`, `consent_accepted`, `passphrase_shown`, `passphrase_confirmed`, `profile_setup_started`, `profile_setup_completed`, `study_code_entered` / `study_code_skipped`, `onboarding_completed`. Property: `step_index`, `duration_ms`.

**Habit creation funnel** (four steps)
`habit_creation_started` (with `entry_point`: my_habits | recommendation | auto), `habit_behavior_selected`, `habit_cue_selected` (`cue_source`), `habit_stitch_shown` / `habit_stitch_accepted`, `habit_created`, `habit_creation_abandoned`. Also `habit_creation_blocked` when `InformationOverloadException` fires — a first-class product signal today thrown away.

**Recommendations** (the top ask; needs §5 to be answerable)
`recommendation_requested`, `recommendation_generated` (`latency_ms`, `count`, `cache_hit`), `recommendation_failed` (`reason`: timeout | error), `recommendation_viewed`, `recommendation_expanded`, `recommendation_adopted` (`recommendation_id`, `position`), `recommendation_feedback_submitted`. **Never** the goal text or recommendation body — free text is banned from properties.

**Core engagement**
`app_opened` (`source`: organic | notification | deeplink, `cold_start`), `app_backgrounded` (`session_duration_ms`), `screen_viewed` (`screen`, normalized path — see budget below), `habit_logged` (`enacted`, `backfill` true/false — backfilling is different behaviour and worth separating), `habit_log_undone`, `srhi_submitted` (`week_number`, `latency_from_scheduled_ms`), `questionnaire_started` / `questionnaire_submitted` / `questionnaire_abandoned`, `habit_donated` (`input_mode`: freeText | structured | voice), `explore_habit_viewed`, `comment_posted`, `annotation_added` (`type`).

**Notifications** (closes the biggest measurement gap)
`notification_sent` (server-side), `notification_opened` (`notification_type`, `cold` | `background` | `foreground`), and the derived question — did a behaviour log follow within 30 minutes — answered by query, not a stored event. All three notification-open paths funnel through `shell_screen.dart` `_initNotifications()`, so this is one insertion point.

**App health, segmented by arm** (the validity check)
`api_error` (`endpoint`, `status`, `duration_ms`), `offline_queue_depth`, `sync_failed`, `app_cold_start_ms`. Emitted from the `dioProvider` interceptor so every call is covered without touching each service.

**Every event carries**: `study_id`, `group_id`, `app_version`, `platform`, `locale`, `schema_version`. Group analytics: **study** as a PostHog group so arm comparison is native.

### Event budget — how to stay near the ceiling

`screen_viewed` is the volume driver and the least informative event. Ship it **behind a config flag, default off**, and rely on funnel-step events instead. If it is enabled, sample it. Budget ~30–50 events/participant/day rather than 100–150; at 200 participants that is 180k–300k/month, inside the advisory band. Re-check monthly against the ingestion graph.

---

## 3. Client instrumentation (Flutter)

`posthog_flutter` (official SDK), initialised in `mobile/lib/main.dart` beside the existing Sentry block, which already models build-time-gated opt-in via `String.fromEnvironment`.

**Configuration is the privacy control, so it is explicit:**
- `captureApplicationLifecycleEvents: true` (gives `app_opened` / `app_backgrounded` free)
- **`autocapture: false`** — autocapture hoovers up widget text, which in a health app means habit descriptions and free-text goals
- **`sessionReplay: false`** — non-negotiable in a health app
- `personProfiles: 'identified_only'`

**Insertion points** (all seams that already exist — no architectural change):
- **Screen views**: `observers:` on the top-level `GoRouter` in `mobile/lib/router/app_router.dart`, which currently has none. Caveat: `StatefulShellRoute.indexedStack` branch navigators are **not** seen by a top-level observer — tab switches go through `shell_screen.dart` `onDestinationSelected` → `goBranch()`, so capture those there. `stats_screen.dart` and `results_screen.dart` are reached without routes and need explicit calls.
- **API timing/errors**: a second interceptor on `dioProvider` (`mobile/lib/core/dio_provider.dart`), alongside `AuthInterceptor`.
- **Identify**: on login and restore, `identify(userId)` from `userIdProvider`, with `study_id`/`group_id` from `studyConfigProvider`.
- **Lifecycle**: `_ShellScreenState` is currently the app's only `WidgetsBindingObserver` and only exists once inside the shell — onboarding is outside it. A global observer belongs in `HhhApp`.

**Test seam — do this or ~40 widget tests break.** Expose analytics as a Riverpod `Provider<AnalyticsService>` and override it with a no-op in tests, following the established `reconsentRequiredProvider` / `habitReminderSyncProvider` pattern in `shell_screen.dart`. Calling the SDK directly from screens will fail on missing platform channels.

**Server-side events** via `posthog-node` in `app/`, for anything a client must not be trusted to report or could silently drop: `recommendation_generated` (with real latency, from `app/routes/recommendRouter.js` where the 180 s timeout lives), `recommendation_failed`, `notification_sent` (`notificationService.js`), `enrollment_completed`. Fire-and-forget, never blocking a response — mirror the non-blocking `res.on('finish')` discipline of `app/middleware/auditAdminActions.js`.

---

## 4. Privacy and DSGVO

- **No free text in any property, ever.** Specifically: the recommendation *goal* the participant types, habit names, cue text, comments. Enforce with a shared event registry (typed names + allowed property keys) that both client and server import — a rule in a document will drift.
- **No autocapture, no session replay** (§3), and `sendDefaultPii` equivalents off.
- **`distinct_id` = Keycloak `sub`** — the same pseudonym as all other study data. No new identifier, and no PII enters PostHog.
- **Art. 17 erasure now spans a third system.** `DELETE /api/v1/users/me` must also delete the PostHog person. Add it to the deletion path and to `docs/data-model.md`'s retention matrix.
- **Art. 20 export**: PostHog events must join `GET /api/v1/users/me/export` (`app/routes/usersRouter.js:133-147`, the `USER_COLLECTIONS` list) and `studyExportService.js`'s collection list — a new data store that escapes both lists is a compliance bug.
- **Verzeichnis von Verarbeitungstätigkeiten**: a separate entry — different purpose (product improvement / study conduct), different retention, different system.
- **Retention**: 1 year raw, enforced by PostHog's own retention setting; rollups (§6) kept indefinitely.

---

## 5. Recommendation lineage fix (prerequisite, ships first)

Without this, "are recommendations followed?" stays unanswerable no matter what is instrumented.

- **`mobile/lib/features/recommendation/results_screen.dart` `_addToHabits()`** — add `recommendationId` to the `extra` map. **Also fix the catalog-restricted branch**, which currently does `context.push('/habits/new/behavior')` with *no extra at all*, losing lineage entirely for restricted arms.
- **Thread it through the funnel**: `new_habit_screen_2_cue.dart` (the `extra` map at ~L174 is the choke point), `intention_stitch_screen.dart` (re-pushes to confirm), `new_habit_screen_3_confirm.dart` (`ConfirmPlanScreen` fields + `_submit()`).
- **`my_habits_service.dart` `createIntention`** — new optional named param, added to the POST body.
- **`app/routes/intentionsRouter.js`** — destructure and validate it (ObjectId-or-null).
- **`app/services/intentionService.js` + `app/models/implementationIntention.js`** — add `sourceRecommendationId` (`['objectId','null']`) to `properties`, **not** to `required`, following the `cadence` precedent. The validator has no `additionalProperties: false`, so this is additive and safe.
- **Replace, don't revive, `recommendations_log`.** It is a dead schema; `adminStatsService.js:84` should read adoption from `implementation_intentions.sourceRecommendationId` instead, which also makes the participant drawer's `accepted` count real for the first time.

This makes the genuinely interesting metric computable: not just *adopted*, but **adopted and still logged 14 days later**.

---

## 6. Rollups and export

PostHog is the exploration surface; it is **not** the system of record for research output.

- **Nightly rollup job** in `app/` writing daily aggregates (per study, arm, event) into Mongo, so they live inside the existing backup and export story and survive PostHog being wiped or migrated. Use the **`node-cron` + Redis-lock pattern already proven** in `app/services/notificationService.js` (`cron.schedule`, `hhh:notif-lock` → a new `hhh:rollup-lock` with a longer TTL), started from `app/app.js` next to `startNotificationScheduler`.
- **On-demand rollup export** — CSV/JSON endpoint plus an admin download button, mirroring `app/services/exportService.js`.
- **Study export ZIP** — raw events for that study's participants pulled via the PostHog API and added to the existing bundle, keyed by the same identifier as every other file.

---

## 7. Backup and monitoring

**Backup — the condition attached to choosing self-hosted.** Extend `backup-service/backup.sh` with `INCLUDE_POSTHOG` as a seventh step, mirroring the existing Keycloak step (lines 232–289) exactly: `PGPASSWORD=… pg_dump -h posthog-db -U … -F c -f …` for Postgres, plus `clickhouse-backup` for ClickHouse. The backup image **already ships `postgresql16-client`**, so only the ClickHouse tool is new. Add `posthogDbOk`/`posthogDbSkipped` to the `jq` manifest (~lines 355–370) and the counterpart to `restore.sh` (which already has the `pg_restore` pattern at lines 188–207). Kafka state is transient and deliberately not backed up.

**Run a restore drill before the study starts.** An untested ClickHouse backup is not a backup, and this is the one dataset outside the pipeline you already trust.

**Monitoring — none of this exists today.** Grafana alerts cover reachability, BullMQ failures and 5xx only; there is no node-exporter, so no filesystem or memory metrics at all. Add: node-exporter, disk-space alerts on `/`, `/var` and `/data`, container-memory alerts (so a ClickHouse creep is caught before the OOM-killer acts), and a blackbox probe on PostHog. **Also add an ingestion-volume alert** at ~250k events/month so the ceiling is hit as a warning, not as a degradation.

---

## 8. Phased delivery

**Phase 0 — prerequisites, independently valuable.** Recommendation lineage fix (§5). Disk/memory alerting + node-exporter (§7) — worth doing regardless, and it protects everything that follows.

**Phase 1 — pipeline proven end to end, narrow.** PostHog deployed with memory limits, digest-pinned, Traefik-routed, on `/data`. `INCLUDE_POSTHOG` in `backup.sh` **plus the restore drill**. Shared event registry. Flutter SDK with autocapture/replay off, `identify()`, the Riverpod test seam. **Only the onboarding funnel** instrumented — highest value, smallest surface, and it proves the whole chain before committing to breadth.

**Phase 2 — the rest of the taxonomy.** Habit-creation funnel, recommendations (now measurable), engagement, notifications, server-side events via `posthog-node`.

**Phase 3 — research plumbing.** Nightly rollups, rollup export, study-export integration, Art. 17 deletion path, Art. 20 export.

**Phase 4 — hardening and review.** Ingestion-volume alerting, a measured re-check of the event budget against the real number, DPIA/Verzeichnis entry, and a documented decision point: stay self-hosted, or move.

---

## Verification

- **Volume before breadth.** After Phase 1, read actual events/participant/day off PostHog's own ingestion graph and extrapolate to full enrolment. If it projects past ~300k/month, cut `screen_viewed` or sample before Phase 2 — this is the check that keeps the ceiling from becoming a mid-study surprise.
- **Privacy assertion as a test, not a promise.** A CI check asserting every event name and property key in the registry is on the allowlist, and a manual review that no free-text field (goal, habit name, cue, comment) reaches a property. Then verify empirically: run the onboarding + recommendation flows against a local PostHog and grep the captured payloads for the typed goal string — it must be absent.
- **Funnel correctness.** Drive the five onboarding screens on a simulator, deliberately abandon at the passphrase step, and confirm PostHog shows a 4/5 funnel with the drop at that step — the exact question this feature exists to answer.
- **Lineage.** Generate a recommendation → adopt it → confirm `implementation_intentions.sourceRecommendationId` is set, `recommendation_adopted` carries the same id, and `adminStatsService` reports a non-zero `accepted` for the first time. Repeat on a **catalog-restricted** arm, which is the branch that silently loses lineage today.
- **Resource safety.** `docker stats` after 24 h under load: PostHog's total RSS must sit inside its limits with Mongo and Neo4j unchanged. Deliberately stress ClickHouse and confirm its `mem_limit` binds rather than the host OOM-killer firing.
- **Backup.** `pg_dump` + `clickhouse-backup` restore into a scratch instance and a known event is queryable. **The negative test**: stop PostHog entirely and confirm the app still functions and nightly rollups still run — analytics must never be load-bearing.
- **Regression.** `npm run test:unitTests` (1006 passing today) and the Flutter widget suite, which is the one that breaks if the analytics provider is not overridable in tests.
