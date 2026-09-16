<!--
  Design document — APPROVED, REPOSITORY SETUP COMPLETE (as of 2026-09-05).
  Status: the deployable/configurable repository work described in the status
  table is implemented on branch `monitoring`. No VM has been deployed or
  contacted. Live-only activation and governance work remains deliberately
  pending until the future VM and PostHog project exist.
  Phase 0 (recommendation lineage fix, disk/memory alerting) is independently
  valuable and can ship without the rest.
  See also: docs/identity-mode-plan.md, docs/runbook.md, DEPLOYMENT.md.
-->

# Product Analytics — self-hosted PostHog on a dedicated TU-internal VM

## Implementation status (2026-09-05)

The repository is ready to be cloned onto an as-yet-unknown VM and configured
without changing source code. Empty PostHog variables leave every integration
inert, so this branch is safe to deploy to the existing stack before the
analytics VM exists.

| Area                       | Repository status                       | Evidence / remaining live action                                                                                                                                                                                                                                                                                          |
| -------------------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Recommendation lineage     | Complete                                | UUID lineage flows from recommendation results through habit creation into `implementation_intentions.sourceRecommendationId`; admin adoption statistics use that record instead of the unwritten legacy collection.                                                                                                      |
| Analytics VM package       | Complete and validated                  | `analytics-vm/manage.sh` fetches an exact 40-character upstream revision, applies digest-pinned/private-port/resource overrides, validates the merged 39-service Compose model, and provides preflight, status, logs, stop and backup commands. The validation starts no containers.                                      |
| Separate data services     | Complete                                | The pinned upstream Compose keeps Kafka/ZooKeeper, ClickHouse, PostgreSQL, Redis/Valkey, object storage, Temporal, web, capture, ingestion and worker processes in separate containers.                                                                                                                                   |
| Public ingest / private UI | Complete, disabled by default           | Traefik renders a rate-limited `/ingest` router only when `POSTHOG_INTERNAL_URL` is configured. Its allowlist covers `/i/`, `/e/`, `/decide[/]`, `/flags[/]`, `/batch[/]` and `/array/`; `/` is never forwarded.                                                                                                          |
| Event contract             | Complete for the initial high-value set | One versioned JSON registry generates the Flutter contract and is checked in CI. Client and server reject unknown names, keys, types and free-form values and add controlled common context.                                                                                                                              |
| Instrumentation            | Initial production set complete         | Onboarding, habit-creation, recommendation and enrollment events are wired. Recommendation outcomes and accepted habits are emitted authoritatively by the backend; session replay and SDK autocapture are disabled. Lower-value engagement/notification events listed below remain candidates, not a deployment blocker. |
| Monitoring                 | Complete for activation                 | Both VMs expose node/container metrics, PostHog has a private blackbox probe, Grafana alerts on reachability/exporters/disk/memory/container pressure, and Traefik request metrics provide a conservative ingestion-budget warning.                                                                                       |
| Backup                     | Complete for activation                 | A systemd timer runs custom-format PostgreSQL and ClickHouse backups, checksum manifests, retention and optional rclone offsite copy. A witnessed restore drill remains mandatory after the live stack exists.                                                                                                            |
| Documentation and diagrams | Complete                                | Deployment, operations, data-model, architecture, use-case overview, UC-40/UC-41 sequences and the rendered system architecture describe the cross-VM design.                                                                                                                                                             |

The following tasks cannot be truthfully completed in this repository because
they require the future infrastructure or an administrator's live-project
decision:

1. provision the VM, mount ext4 at `/data`, and set Docker's data root;
2. add the private firewall rules after both VM addresses are known;
3. create the PostHog project/accounts, copy its write-only project key, enable
   2FA, and set one-year raw-event retention in PostHog;
4. configure `.env`, the production Dart defines, and the `habitvm` stack
   variables, then run the first live smoke test;
5. configure the rclone remote and perform/document a PostgreSQL + ClickHouse
   restore drill on a scratch VM;
6. establish the real event-volume baseline and tune the conservative alert;
7. complete the DPIA/processing-activities entry and researcher account
   offboarding procedure;
8. decide whether raw PostHog data belongs in participant/study portability
   exports and erasure. The current account-deletion contract deliberately
   retains pseudonymous research contributions; an automatic destructive
   PostHog deletion would contradict that contract without a governance change.

Items 1–7 are the activation checklist, not missing code. Item 8 is recorded as
a conscious decision gate rather than an invented API integration with no live
project ID, administrator key, or approved retention semantics.

## Context

During a running study we cannot currently answer basic questions about how the app is actually used. What exists today is either **infrastructure metrics with no user dimension** (`app/middleware/metrics.js` → Prometheus: one HTTP histogram and a BullMQ failure counter) or **study-outcome analytics derived from domain records** (`app/services/studyAnalyticsService.js` → DAU/WAU, SRHI trajectories, dropout, questionnaire completion). There is **no event stream at all** — no screen views, no funnel primitives, no client-side emission, and no collection to hold them.

Four things are invisible as a result, and each changes a decision:

1. **Funnel drop-off.** Onboarding is five screens (`welcome → consent → passphrase → profile-setup → study-code`) and habit creation is four (`behavior → cue → stitching → confirm`). We only see who finishes. If a large share abandons at the 24-word passphrase screen — the scariest screen in the app — nothing surfaces it.
2. **Whether recommendations are followed.** Currently _unmeasurable, not merely unmeasured_: `results_screen.dart` `_addToHabits()` drops the `recommendation_id` on the floor, `implementation_intentions` has no field to receive it, and the documented `recommendations_log` collection is read by `adminStatsService.js:84` but **written by nothing**, so the participant drawer permanently shows `accepted: 0, dismissed: 0`.
3. **Notification effectiveness.** Sends are recorded at campaign granularity only — no delivery, no open, no tap, no "did they log a behaviour after the reminder". We run an adaptive reminder algorithm (`reminderPlanService.js` fades frequency as automaticity rises) with **no feedback signal**.
4. **Real engagement vs logging.** `enrollments.lastActiveAt` is touched by exactly two code paths (a daily log, an SRHI submit). Someone who opens the app daily and browses is indistinguishable from a dropout. `participants.lastActive` is set to `null` at creation and never written again.

Plus one research-validity concern that is not a product question: **per-arm app health**. Recommendation generation proxies to the Python service with a **180 s timeout** and we have no idea of the p95 or timeout rate. If arm 3 waits longer than arm 1, that is an unplanned intervention difference confounding the outcome data.

### Decisions already taken

|                        |                                                                                                                  |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Tool                   | **Self-hosted PostHog** on a dedicated, TU-internal VM; ingest reverse-proxied through `habitvm`                 |
| Identifiability        | **Per-user, no opt-out** — telemetry framed as part of study participation; consent already covers app analytics |
| Recommendation lineage | **Fix end to end** — carry `recommendation_id` into `implementation_intentions`                                  |
| Retention              | Raw **1 year**, rollups indefinitely, rollups exportable on demand                                               |
| Export                 | Both the per-study export ZIP **and** an on-demand rollup export                                                 |

### Hosting — a dedicated, TU-internal VM

**PostHog runs on its own VM, not on `habitvm`** (decided 2026-09-04, VM requested).

Sizing it separately was measurement-driven. `habitvm` has **15 GiB RAM with 3.6 GiB used by 23 containers** and 8 vCPU — PostHog would fit in the ~10 GiB available, but PostHog's documented recommendation is a _dedicated_ 4 vCPU / 16 GB / >30 GB box, and a shared host means ClickHouse competing for page cache with Neo4j's 2560-dimension vector indexes and Mongo's working set. A separate VM removes that contention entirely and, more importantly, means **analytics can never OOM the study platform**.

Requested spec:

|                   | Value                        | Rationale                                                                                                                                                              |
| ----------------- | ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| vCPU / RAM        | 4 / 16 GB                    | PostHog's documented recommendation                                                                                                                                    |
| Systemfestplatte  | 50 GiB                       | Sufficient **provided** Docker's `data-root` is moved to the data disk before the first `docker pull`                                                                  |
| Datenfestplatte   | 200 GiB                      | ClickHouse compresses to ~100 MB per million events, so this is generous headroom; session replay (the real disk consumer) is off                                      |
| Filesystem        | **ext4**                     | Deliberately not btrfs — `habitvm`'s btrfs root produced a near-outage when `Device unallocated` hit 13 MiB (see [runbook § 14](runbook.md#14-filesystem-maintenance)) |
| IP / reachability | **private, TU-internal**     | See below                                                                                                                                                              |
| OS                | Match `habitvm`'s Ubuntu LTS | One runbook, one patching routine                                                                                                                                      |

**Set `/etc/docker/daemon.json` to `{"data-root": "/data/docker"}` before installing anything.** This is the single change that keeps the 50 GiB system disk from filling — it is what saved `habitvm`, where the 20 GiB root would otherwise have been overwhelmed by images and volumes.

### Reachability — TU-internal, ingest reverse-proxied through `habitvm`

The VM has a **private IP and is not reachable from the internet**. This is the security-relevant decision in the whole design.

**Why.** Self-hosted PostHog has **no SSO** (§ Risks) — it is local email/password accounts. Publishing that admin panel to the internet would expose per-user behavioural data from a health study, behind a form login, on software that ships continuously from master with no published CVEs, for the multi-year life of the study. Not acceptable.

**How participants' phones reach it anyway.** They don't, directly. `habitvm` is already world-reachable and already on the TU network, so Traefik there reverse-proxies **only the ingest endpoints** inward:

```
phone (internet)
   │  POST https://habit.wiwi.tu-dresden.de/ingest/…
   ▼
Traefik on habitvm  (public, existing TLS cert)
   │  private TU network
   ▼
posthog-web on the analytics VM  (private IP, TU-internal only)
```

The Flutter SDK is configured with `host: https://habit.wiwi.tu-dresden.de/ingest` rather than the PostHog hostname — a documented, supported PostHog reverse-proxy pattern (commonly used to avoid ad-blockers; here it buys a much smaller attack surface). **The admin UI is never proxied** and stays reachable only from the TU network or VPN.

Consequences, accepted deliberately:

- **Researchers need TU network or VPN** to open dashboards. Given the data, that is closer to a feature than a cost.
- **`habitvm` becomes a dependency for event ingest.** If it is down, events are lost — but the app is down in that case anyway, so nothing meaningful is added to the failure surface.
- **A firewall rule is required**: `141.76.16.16` (`habitvm`) → the analytics VM's HTTP port, added in the Self-Service-Portal after provisioning. **The ingest path silently fails without it** — this is the most likely single cause of "events aren't arriving" on first setup, so check it first.
- Proxy only the ingest paths (`/i/`, `/e/`, `/decide[/]`, `/flags[/]`,
  `/batch[/]`, `/array/`). Do **not** blanket-proxy `/`, which would republish
  the admin UI and undo the entire rationale.

### Risks accepted (state these in the DPIA and the runbook)

- **Event ceiling.** PostHog advises migrating to Cloud above ~100k–300k events/month. At 200 participants × 100 events/day that is ~600k/month — **2–6× over**. Advisory, not a hard cap, but it is why §3 imposes an event budget rather than instrumenting everything.
- **No versions.** Self-hosted ships continuously from master; you cannot pin a known-good release for a multi-year study. Mitigate by pinning a specific image **digest** in compose and upgrading deliberately, off-study-critical periods, after a restore drill.
- **No support, no published CVEs** for self-hosted. Security patching is "track master".
- **SSO is Cloud-only.** Self-hosted means local PostHog email/password accounts, not Keycloak — which is precisely why the admin UI is TU-internal only. Keep the account list short, use strong unique passwords, enable PostHog's own 2FA, and document offboarding: a leaver's PostHog account is _not_ revoked by disabling their Keycloak account.
- **Two hosts to patch, not one.** A dedicated VM removes resource contention but adds a machine to the OS-patching and monitoring routine. Match `habitvm`'s OS so it is one routine rather than two.
- **Headroom shrinks** as the graph and participant count grow. §7 adds the alerting that currently does not exist.

---

## 1. Deployment

**On the analytics VM.** The deployment wrapper lives in
`analytics-vm/`. It checks out a reviewed PostHog upstream commit into an
ignored runtime directory and layers a tracked security/resource override on
top of the official `docker-compose.hobby.yml`. This keeps the deployment
reviewable without copying a fast-moving upstream stack into this repository.

The 2026-09-05 upstream stack resolves to 37 PostHog/dependency services rather
than the older seven-service layout originally assumed here. It includes
separate web, worker, ingestion and capture processes plus PostgreSQL, Redis,
Valkey, ClickHouse, ZooKeeper, Kafka/Redpanda, object storage and Temporal. The
wrapper adds node-exporter and cAdvisor (39 services total). Upstream Caddy is
retained only as an internal HTTP router; its public TLS ports are replaced by
one private bind. Current PostHog workers depend on the bundled object stores
even with replay disabled, so their host ports are removed rather than dropping
the services.

Non-negotiables:

- **`mem_limit` on every long-running container.** The tracked override starts
  ClickHouse at 4 GiB, Kafka and the main web/worker processes at 1 GiB, and
  bounds the remaining services between 128 MiB and 1.5 GiB. Tune from measured
  `docker stats`; do not remove limits.
- **All volumes on the data disk** (`/data`), with Docker's `data-root` moved there before the first pull — see the hosting table above.
- **Pin the image by digest**, not `:latest`, despite PostHog's advice. The app,
  Node workers and upstream images that use mutable `master` tags are recorded
  with registry digests in `analytics-vm/`.
- **No public exposure.** No Traefik labels on this host, no published ports beyond what `habitvm` needs to reach. Reachability is the private TU network only.

**On `habitvm` — the ingest proxy.** A Traefik router forwarding _only_ the ingest paths to the analytics VM:

- Match `PathPrefix('/ingest')` on the existing `Host(${DOMAIN})` router, strip the prefix, forward to the analytics VM's private address.
- **Only** ingest endpoints (`/i/`, `/e/`, `/decide[/]`, `/flags[/]`,
  `/batch[/]`, `/array/`). Never `/` — a blanket proxy would republish the
  admin UI on the public internet and defeat the reason for a private VM.
- Reuse the existing Let's Encrypt certificate for `${DOMAIN}`; no new cert or DNS record is needed, which is a real simplification over a public `analytics.${DOMAIN}`.
- Apply a rate-limit middleware — this is a public, unauthenticated write endpoint.
- Define the backend as a Traefik `file` provider entry (an external host, not a Docker container), so it lives in tracked config like everything else `config-sync` manages.

**Structural control, now stronger than before.** PostHog previously needed only to be kept off the `mongo`/`neo4j` networks. On a separate VM with a private IP it has **no route to them at all** — enforced by the TU firewall rather than by a `networks:` list someone could edit. The only permitted flow is `habitvm` → analytics VM on one HTTP port.

---

## 2. What to track — the event taxonomy

The deployed taxonomy is deliberately an **allowlist**, defined once in
`app/analytics/event-registry.json`, not autocapture (§4). The registry—not this
prose—is authoritative. Schema version 1 contains the following initial set:

- **Lifecycle and onboarding:** `app_opened`, `onboarding_started`,
  `onboarding_step_viewed`, `onboarding_step_completed`, and
  `onboarding_completed`.
- **Habit creation:** `habit_creation_started`, `habit_behavior_selected`,
  `habit_cue_selected`, `habit_stitch_shown`, `habit_stitch_accepted`,
  `habit_created`, and `habit_creation_blocked`.
- **Recommendations:** `recommendation_requested`,
  `recommendation_generated`, `recommendation_failed`,
  `recommendation_viewed`, `recommendation_adopted`, and
  `recommendation_feedback_submitted`. Never the goal, recommendation body,
  habit name, cue, or other free text.
- **Enrollment:** `enrollment_completed`.

PostHog's SDK-level `$identify`/`$set` protocol record is the only exception to
the capture registry. The wrapper supplies only the opaque Keycloak subject and
validated study/group IDs; all other person properties are forbidden.

The initial set intentionally excludes generic screen views, background/session
events, every API error, and notification delivery/open events. Those are
candidate schema-version-2 additions after the live event-volume baseline is
known. Adding names to prose or calling `Posthog().capture` directly is not an
implementation: a future event must first be reviewed for research value and
privacy, added to the shared registry, generated for Flutter, and tested at its
source. Notification delivery in particular needs a token-to-participant
success result from Firebase; campaign-level recipient counts must not be
misrepresented as one successful send per participant.

**Every event carries**: `study_id`, `group_id`, `app_version`, `platform`, `locale`, `schema_version`. Group analytics: **study** as a PostHog group so arm comparison is native.

### Event budget — how to stay near the ceiling

Generic `screen_viewed` would be the volume driver and is therefore absent from
schema version 1. Rely on funnel-step events. Budget ~30–50
events/participant/day rather than 100–150; at 200 participants that is
180k–300k/month. Re-check monthly against PostHog's ingestion graph and the
conservative Traefik request-volume alert before expanding the registry.

---

## 3. Client instrumentation (Flutter)

`posthog_flutter` (official SDK), initialised in `mobile/lib/main.dart` beside the existing Sentry block, which already models build-time-gated opt-in via `String.fromEnvironment`.

**Configuration is the privacy control, so it is explicit:**

- `captureApplicationLifecycleEvents: false`; `app_opened` is emitted through
  the allowlisted service instead, because native lifecycle events bypass the
  SDK's `beforeSend` privacy gate
- rage-click, push-token/open, survey, feature-flag and error-step autocapture
  are explicitly off — the Flutter SDK has no single generic `autocapture` flag
- **`sessionReplay: false`** — non-negotiable in a health app
- `personProfiles: 'identified_only'`
- **`host: https://<WEBSITE/API domain>/ingest`** — the reverse proxy on `habitvm`, **never** the analytics VM's own hostname, which is private and unreachable from participants' devices. Configure it as a `--dart-define` alongside `API_BASE_URL` in `mobile/lib/config/app_config.dart`, so dev, staging and production can differ without a code change.

**Insertion points** (all seams that already exist — no architectural change):

- **Onboarding steps**: a top-level navigation observer emits controlled funnel
  steps without capturing arbitrary route strings.
- **Identify**: login/restore identifies with `userIdProvider`; enrollment then
  refreshes `study_id`/`group_id` from `studyConfigProvider`.
- **Lifecycle**: startup emits the allowlisted `app_opened` event. Automatic SDK
  lifecycle capture remains off.

**Test seam — implemented.** Analytics is exposed as a Riverpod
`Provider<AnalyticsService>` and defaults to a no-op unless the application root
injects a configured service. Unit and widget tests can override it with an
in-memory sink, so screens never call native SDK channels directly.

**Server-side events** use `posthog-node` in `app/` for outcomes a client must
not be trusted to report or could silently drop: `recommendation_generated`
with real latency/cache status, `recommendation_failed`, `habit_created`,
`recommendation_adopted`, and `enrollment_completed`. Captures are detached and
fail closed, never blocking a response. `notification_sent` remains excluded
until Firebase success can be attributed accurately per participant.

---

## 4. Privacy and DSGVO

- **No free text in any property, ever.** Specifically: the recommendation _goal_ the participant types, habit names, cue text, comments. Enforce with a shared event registry (typed names + allowed property keys) that both client and server import — a rule in a document will drift.
- **No autocapture, no session replay** (§3), and `sendDefaultPii` equivalents off.
- **`distinct_id` = Keycloak `sub`** — the same pseudonym as all other study data. No new identifier, and no PII enters PostHog.
- **Account deletion and erasure are distinct.** The existing
  `DELETE /api/v1/users/me` contract removes the identity and retains
  contributed research data under an orphaned random UUID. PostHog follows the
  same one-year pseudonymous-retention rule. A separate request to erase
  contributed data must include PostHog, but automatically deleting raw events
  during account deletion would silently change the approved research-retention
  contract.
- **Art. 20 export is a governance decision before an API task.** The existing
  participant and study exports contain research-system records; PostHog is an
  exploratory replica with separate retention. If it is declared in scope,
  implement the export through a server-held private administrative key after
  the live project ID exists—never expose that key to Flutter or commit it.
- **Verzeichnis von Verarbeitungstätigkeiten**: a separate entry — different purpose (product improvement / study conduct), different retention, different system.
- **Retention**: 1 year raw, enforced by PostHog's own retention setting; rollups (§6) kept indefinitely.

---

## 5. Recommendation lineage fix (prerequisite, ships first)

Without this, "are recommendations followed?" stays unanswerable no matter what is instrumented.

- **`mobile/lib/features/recommendation/results_screen.dart` `_addToHabits()`** — add `recommendationId` to the `extra` map. **Also fix the catalog-restricted branch**, which currently does `context.push('/habits/new/behavior')` with _no extra at all_, losing lineage entirely for restricted arms.
- **Thread it through the funnel**: `new_habit_screen_2_cue.dart` (the `extra` map at ~L174 is the choke point), `intention_stitch_screen.dart` (re-pushes to confirm), `new_habit_screen_3_confirm.dart` (`ConfirmPlanScreen` fields + `_submit()`).
- **`my_habits_service.dart` `createIntention`** — new optional named param, added to the POST body.
- **`app/routes/intentionsRouter.js`** — destructure and validate it (UUID-v4-or-null). The recommender generates `recommendation_id` with Python's `uuid4()`; it is not a Mongo ObjectId.
- **`app/services/intentionService.js` + `app/models/implementationIntention.js`** — add `sourceRecommendationId` (`['string','null']`) to `properties`, **not** to `required`, following the `cadence` precedent. The validator has no `additionalProperties: false`, so this is additive and safe.
- **Replace, don't revive, `recommendations_log`.** It is a dead schema; `adminStatsService.js:84` should read adoption from `implementation_intentions.sourceRecommendationId` instead, which also makes the participant drawer's `accepted` count real for the first time.

This makes the genuinely interesting metric computable: not just _adopted_, but **adopted and still logged 14 days later**.

---

## 6. Future rollups and export decision

PostHog is the exploration surface; it is **not** the system of record for
research output. Recommendation adoption is already durable in MongoDB through
`sourceRecommendationId`, so no live study outcome depends on PostHog.

- **Possible nightly rollup:** daily aggregates per study, group and event in
  MongoDB, using the existing `node-cron` plus Redis-lock pattern.
- **Possible on-demand export:** CSV/JSON rollups, with raw events added to a
  study ZIP only if the approved export scope requires them.

These are intentionally not pre-wired against a guessed PostHog API. They need
the live project ID, a server-only personal API key, a chosen export scope, and
an explicit decision about whether indefinite rollups are compatible with the
one-year raw retention. Until then, PostHog dashboards can export aggregates
manually and the research system of record remains complete without them.

---

## 7. Backup and monitoring

**Backup — the condition attached to choosing self-hosted.** A dedicated VM changes _where_ this runs, and there is a real choice.

**Recommended: back up on the analytics VM itself.** A small local job runs `pg_dump` and `clickhouse-backup` against localhost and pushes the result to the same offsite remote used for the study data (see [issue #17](https://github.com/Bulgy404/health-habit-hub/issues/17)). Keeps analytics self-contained, requires no extra firewall holes, and avoids making `habitvm`'s backup window depend on a second host being up.

The alternative — extending `backup-service/backup.sh` on `habitvm` with an `INCLUDE_POSTHOG` step — would mirror the existing Keycloak step (lines 232–289) closely, and the backup image **already ships `postgresql16-client`**. But it needs firewall rules opening Postgres and ClickHouse from `habitvm` to the analytics VM, which widens the flow beyond the single ingest port and weakens the isolation that justified a separate VM. Prefer the local job.

Either way: Postgres via `pg_dump -F c`, ClickHouse via `clickhouse-backup`, **Kafka state deliberately not backed up** (transient), and the manifest gains `posthogDbOk`/`posthogDbSkipped` so a silent failure is visible.

**Run a restore drill before the study starts.** An untested ClickHouse backup is not a backup, and this is the one dataset outside the pipeline you already trust.

**Monitoring is implemented and activation-gated.** Both hosts have
node-exporter/cAdvisor coverage, disk-space alerts on `/`, `/var` and `/data`,
host/container-memory alerts, exporter health alerts, and a private blackbox
probe on PostHog. Traefik's internal Prometheus endpoint labels the ingest
router. Because one SDK request can contain roughly 20 events, the warning
fires conservatively at 12,500 requests in 30 days and operators confirm the
exact event count in PostHog.

---

## 8. Phased delivery

**Phase 0 — complete.** Recommendation lineage fix (§5), disk/memory alerting,
node-exporter and cAdvisor (§7).

**Phase 1 — repository complete, live activation pending.** The private,
digest-pinned deployment package, `/ingest` router, backup job, shared registry,
Flutter privacy configuration, identification and onboarding funnel are ready.
VM provisioning, firewall configuration, first startup and the restore drill
must wait for the future VM.

**Phase 2 — high-value set complete.** Habit creation, recommendation and
enrollment events are implemented. Generic engagement, notifications and
client API-health events are deferred until the live budget is measured; they
are not silently emitted outside the registry.

**Phase 3 — governance decision pending.** See §6 and §4. There is no missing
system-of-record lineage; rollups, raw export and contributed-data erasure need
live-project credentials and approved retention/export semantics.

**Phase 4 — code complete, live review pending.** Ingestion-volume warning is
implemented. The measured budget check, DPIA/processing-activities entry and
self-hosted-versus-migrate decision require the live deployment.

---

## Verification

- **Ingest path, before anything else.** From a device **off** the TU network (mobile data, not eduroam), confirm an event posted to `https://<domain>/ingest/…` arrives in PostHog. Then confirm the admin UI is **not** reachable from that same off-network device — a `curl` to the analytics VM's address must fail. Both halves matter: the first proves the proxy works, the second proves the private VM is actually private. If events do not arrive, check the `habitvm → analytics VM` firewall rule first; that is the most likely cause and it fails silently.
- **Volume before breadth.** After activation, read actual
  events/participant/day from PostHog's ingestion graph and extrapolate to full
  enrolment. If it projects past ~300k/month, do not add the deferred generic
  engagement events and reduce existing low-value client events first.
- **Privacy assertion as a test, not a promise.** A CI check asserting every event name and property key in the registry is on the allowlist, and a manual review that no free-text field (goal, habit name, cue, comment) reaches a property. Then verify empirically: run the onboarding + recommendation flows against a local PostHog and grep the captured payloads for the typed goal string — it must be absent.
- **Funnel correctness.** Drive the five onboarding screens on a simulator, deliberately abandon at the passphrase step, and confirm PostHog shows a 4/5 funnel with the drop at that step — the exact question this feature exists to answer.
- **Lineage.** Generate a recommendation → adopt it → confirm `implementation_intentions.sourceRecommendationId` is set, `recommendation_adopted` carries the same id, and `adminStatsService` reports a non-zero `accepted` for the first time. Repeat on a **catalog-restricted** arm, which is the branch that silently loses lineage today.
- **Resource safety.** `docker stats` after 24 h under load: PostHog's total RSS must sit inside its limits with Mongo and Neo4j unchanged. Deliberately stress ClickHouse and confirm its `mem_limit` binds rather than the host OOM-killer firing.
- **Backup.** Restore the `pg_dump` and `clickhouse-backup` artifacts into a
  scratch instance and confirm a known event is queryable. **The negative
  test:** stop PostHog entirely and confirm participant and backend flows still
  function—analytics must never be load-bearing.
- **Regression.** Run the generated-registry drift check, backend lint and
  unit/integration suites, Flutter analysis/widget tests, Python recommendation
  tests, both Compose model checks, shell syntax checks, PlantUML validation and
  Mermaid rendering. Do not record a fragile repository-wide test count here.
