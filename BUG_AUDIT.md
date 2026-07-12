# Health Habit Hub — Bug & Improvement Audit

**Date:** 2026-07-11
**Auditor:** Claude (Sonnet 5)
**Scope:** Fresh, full-codebase review — Node.js backend, Python API service, Next.js admin, Flutter mobile, infrastructure/DevOps.
**Method:** Five parallel read-only reviews, one per service, each cross-checking the prior `AUDIT.md` (2026-04-10) backlog for what's since been fixed vs. still open, plus a fresh pass for new bugs. `DEAD_CODE_AUDIT.md` (2026-07-10) already covers dead/unreachable code in `mobile/` and elsewhere — not repeated here except where new dead code was introduced since.

---

## Executive summary

`AUDIT.md`'s backlog is mostly resolved: the plaintext participant password is now bcrypt-hashed, `insertedId` leaks are gone, the Python API service now has a real auth layer (HMAC-verified service token, fail-closed), the two path-traversal issues are moot (the code they applied to was rewritten), and most infra P1s (hardcoded Mongo creds, exposed Neo4j/Mongo ports, docker.sock without `:ro`, committed real domain/IP) are fixed in production. `libretranslate:latest` is the one previously-flagged item still open.

This pass found one new **P0**: a middleware-ordering bug in `app/app.js` makes the internal WebSocket-push router completely unreachable in the running app — the recommendations push-notification feature is silently broken in production right now. It also found a cluster of **P1** authorization/reliability gaps that share a pattern — a feature works for the common case but an edge case (another user's ID, a standalone service call, a slow network) slips past an ownership or timeout check: an IDOR on daily habit logs, an unguarded router-prefix gap on mobile leaving `/habits` unauthenticated-reachable, a notification-scheduling bug that silently cancels a user's pending reminders, unbounded Keycloak network calls with no timeout, an unbounded LLM prompt field, and a non-timing-safe auth check gating the backup service's full DB wipe/restore.

None of this session's new admin code (welcome onboarding, MUI `ToggleSwitch` migration) introduced a P0/P1 bug — one latent, currently-unexploited footgun was found (see Admin P1-9).

---

## P0 — fix immediately

| # | Area | Finding |
|---|------|---------|
| 1 | Backend | **`app/app.js:212-228`** — `app.use('/api/internal', ...)` is registered *after* the catch-all 404 handler and error handler, and after the main `router` (which applies a CSRF check with no path filter). Any real request to `/api/internal/*` is intercepted by CSRF (403, no `_csrf` cookie from the Python service) or the 404 catch-all — **both mounted before the internal router**. This makes the WebSocket "new recommendation" push path completely unreachable in production. The regression test (`tests/integration/ws.recommendations.test.js`) doesn't catch it because it builds an isolated Express app mounting `internalRouter` directly, bypassing `app.js`'s real middleware order. **Fix:** move the `/api/internal` mount before the catch-all/error handlers (and before/exempt from the CSRF-checking `router`, since this is service-to-service, not browser, traffic). |

---

## P1 — high priority

| # | Area | Finding |
|---|------|---------|
| 2 | Backend | **IDOR on daily habit logs.** `GET /:id/logs` and `DELETE /:id/logs/:date` (`app/routes/intentionsRouter.js:140-194`) call into `dailyLogService.js` with no `userId` — filtering only by `intentionId`. Any authenticated user who learns another user's `intentionId` can read or delete that user's adherence log. `POST /:id/logs` (upsert) takes a `userId` but never checks the `intentionId` actually belongs to that user first. Untested gap — `tests/unit/dailyLogService.test.js` only checks functional correctness, not ownership. Every sibling endpoint (`updateIntentionStatus`, `srhiRouter`) does check ownership, so this looks like an oversight, not a design choice. |
| 3 | API-service | **Unbounded per-string length in `stitch_intention.py`.** `cues: List[str]` caps the list to 5 items but each string is unconstrained (contrast `embed_habit.py`, which correctly caps item length at 2000 chars). The Node proxy (`habitsCrudRouter.js:588-642`) only checks the array isn't empty — no length validation before forwarding. An authenticated app user can submit multi-megabyte cue strings straight into the LLM prompt, undermining the field-length-limit hardening done in the prior audit. |
| 4 | Infra | **Non-timing-safe auth check on the backup service.** `backup-service/api/server.js:52` compares the internal service token with plain `!==` instead of `timingSafeEqual`. This is the exact vulnerability class rated P0 and fixed elsewhere in the codebase (`app/routes/internalRouter.js`), but missed here — and this endpoint gates `/trigger`, `/restore`, `/delete`, `/upload`, i.e. full database wipe/restore. Higher-value target than the router that already got the fix. |
| 5 | Infra / Mobile | **Keycloak `hhh-flutter` client has `directAccessGrantsEnabled: true` (ROPC)**, and the mobile app uses it: `auth_service.dart` stores the user's raw password in `flutter_secure_storage` and replays it via `grant_type=password` for silent re-auth, bypassing the PKCE authorization-code flow entirely for re-auth and keeping a durable plaintext credential on-device for the session's life. Materially larger attack surface than "PKCE correctly implemented" suggests. Worth a deliberate risk/tradeoff decision, not just a quiet fix — flagging for product/security judgment. |
| 6 | Mobile | **`/habits` and all its sub-routes are missing from the router's auth guard.** `router/redirect.dart:25-32`'s `protectedPrefixes` lists `/share`, `/donate`, `/explore`, `/recommend`, `/settings`, `/questionnaire` — not `/habits`, even though the entire My Habits tab (list, creation wizard, detail, SRHI forms) lives there. An unauthenticated user reaching `/habits` (deep link, push notification, stale back-stack after logout) isn't redirected to onboarding — providers throw `UnauthorisedException` and render a broken error screen instead. No test covers this path. |
| 7 | Mobile | **`ReminderSchedulerService.syncReminders()` calls `cancelAll()` unconditionally**, wiping *every* pending local notification app-wide — including the unrelated questionnaire-reminder and end-of-study notification ranges. This is masked at app start (all three sync methods run together), but `syncReminders()` is also called *alone* after creating a habit (`new_habit_screen_3_confirm.dart:220`) and after an SRHI submission (`srhi_form_screen.dart:80-81`) — both comment "rescheduled on next app start" but don't actually re-run the other two syncs. **Concretely: creating a habit or submitting an SRHI check-in mid-session silently cancels the user's pending questionnaire-due and end-of-study reminders until they fully restart the app.** |
| 8 | Mobile | **Keycloak token calls have no timeout in production.** `auth_provider.dart:22-28` constructs `AuthService` without a configured `Dio`, so `refreshToken`/`reauthenticate`/`logout` (`auth_service.dart:88,126,280`) all fall back to a plain `Dio()` with default (infinite) timeouts — directly contradicting the documented rationale for `dioProvider`'s explicit timeouts. A slow/stuck Keycloak hangs the single-flight token refresh that every authenticated screen awaits: a silent, unbounded app freeze. Same raw-`Dio()` pattern also appears in `passphrase_screen.dart`, `restore_screen.dart`, and `locale_provider.dart`. |
| 9 | Admin | **Latent `sx`-prop collision in `ToggleSwitch`** (this session's new component). `toggle-switch.tsx` does `<Switch sx={switchSx} ... {...switchProps} />` in both branches; `sx` isn't excluded from the prop type the way `color`/`className` are, so a future caller passing `sx` would silently *replace* (not merge with) all brand-color/hover/disabled styling — reverting to default MUI grey with no light/dark theming. Not currently triggered (no call site passes `sx` today), but the type permits it. **Fix:** omit `sx` from `ToggleSwitchProps` like `color`, or merge it (`sx={[switchSx, switchProps.sx]}`). |

---

## P2 — worth fixing / improvements

**Backend**
- `app/schemas/adminSchemas.js:59,79` — `createStudySchema` allows up to 8 groups, `updateStudySchema` caps at 4 (likely copy-pasted from an unrelated schema). Any study created with 5–8 groups can never have its groups edited again — every such `PUT` fails validation.
- `app/utils/healthCheck.js:33-43` — still reassembles the Mongo URI independently of the real connection setup elsewhere; a second source of truth, low risk (health-check only).

**Python API-service**
- `map_bcio.py` — per-phrase length is capped but phrase count and dimension count aren't; unbounded embedding calls and an O(phrases × concepts) loop.
- Inconsistent LLM-failure handling: only `classify_habit.py` converts `chat_complete` failures to a structured 503; five other routers let it surface as a generic unhandled 500.
- Two independent Redis client implementations (`deps.py` vs `routers/_cache.py`) with different default URLs if `REDIS_URL` isn't set identically in both.
- Neo4j driver (`extract_habits.py`) is never explicitly closed on shutdown, unlike Redis/Mongo in `deps.py`'s lifespan handler.
- Prompt-injection screening exists only in `recommend.py`; `extract_habits.py`/`extract_profile.py` interpolate the same kind of free-text `goal` field with no system-message isolation or injection screen (low blast radius — no privileged action gated on the output — but inconsistent posture).

**Infrastructure**
- `docker-compose.yml:167` — `libretranslate/libretranslate:latest` still unpinned in production (dev compose already pins a version).
- `:-admin`/`:-neo4j` **username**-only fallbacks remain on several services in prod compose (passwords no longer have fallbacks — lower severity than the original finding, but still worth removing so misconfiguration fails loudly).
- `backup-service/backup.sh` / `restore.sh` — Mongo and Keycloak-admin credentials passed as CLI args (visible via `ps aux`/`/proc/<pid>/cmdline`); the Postgres path in the same scripts already uses the safer `PGPASSWORD` env-var convention — worth extending.
- `restore.sh:59` — untrapped `tar -xzf` failure under `set -euo pipefail` skips the later cleanup step, potentially leaking a partially-extracted DB dump in `/tmp`.
- `stack.env:27-31` — stale Fuseki config lingering after that service was fully removed; confusing for operators.
- `docker-compose.local.yml` — dev-only ports (Mongo, Neo4j, Keycloak, Redis, Grafana, mongo-express) published in the bare `"host:container"` form, which binds `0.0.0.0` — real exposure on a shared/unfirewalled devbox. Consider `127.0.0.1:<port>:<port>`.
- `keycloak/hhh-realm.json` — `passwordPolicy` string contains literal `"(undefined)"` fragments (likely an admin-console export artifact); probably harmless but unverified — worth a manual check on the next Keycloak upgrade.

**Mobile**
- Duplicated `YYYY-MM-DD` date-formatting logic, copy-pasted in 6 places with no shared utility.
- `services/recommendation_service.dart` is newly-dead code (post-dates `DEAD_CODE_AUDIT.md`): targets an older API surface than the one actually wired up (`recommendation_feature_service.dart`); referenced only by its own test.
- Inconsistent error handling in `habit_service.dart` — some methods convert 401 to a typed exception, others let a raw `DioException` propagate (currently masked by blanket catches in callers).
- Silent error-swallowing via `.when(error: (_, _) => SizedBox.shrink())` in several places; at least one instance (a habit card's "logged today" state) is indistinguishable from genuinely-no-data on a transient network failure.
- `PushNotificationService.initialize()` has no try/catch around the *first* token registration (unlike the equivalent `onTokenRefresh` path) — a transient failure there skips notification-tap navigation wiring for the whole session.
- `QuestionnaireFormWidget._onSubmit` has no `mounted` checks around its network await, unlike its sibling `intention_stitch_screen.dart` — possible "setState after dispose" if the user backs out mid-submit.

**Admin**
- Dead CSS left behind by this session's own checkbox→`ToggleSwitch` migration: `.qCheckbox` in `studies/page.module.css:749` is now unreachable.
- A few list pages (`cue-pools`, `participants`, `comments`) re-fetch on pagination/filter change with no in-flight-request guard — a slow older response can resolve after a newer one and overwrite fresher state. Pre-existing, not from this session.
- `profile-fields/page.tsx` — the "required" toggle has no `label`/`aria-label` (pre-existing gap, carried through the conversion unchanged); cheap to fix now that the component supports `aria-label` cleanly elsewhere.
- `WELCOME_COOKIE` is set without `Secure`, consistent with the existing `LOCALE_COOKIE` pattern — carried forward, not introduced.

---

## Flagged for human judgment, not asserted as bugs

- `passphrase_screen.dart` copies the full 24-word recovery passphrase to the system clipboard with no expiry — likely intentional (users need it in a password manager), but worth a deliberate security-review sign-off.
- A `_HabitCard`'s `ref.invalidate(...)` after an await, with no disposed-check — unclear whether the pinned Riverpod version throws in this case; needs a version-specific check rather than being treated as confirmed.
- Keycloak `passwordPolicy` `"(undefined)"` artifact noted above — plausibly harmless but unverified against actual Keycloac realm-import parsing.

---

## Backlog verification — AUDIT.md (2026-04-10) status today

| Prior finding | Status |
|---|---|
| Plaintext participant password in Mongo/API response | **Fixed** — bcrypt-hashed, no plaintext in response. |
| `insertedId`/`_id` leaks on POST responses | **Fixed** — spot-checked inserts return named, stringified ids or nothing; GETs strip `_id`. |
| Python API service has no auth layer | **Fixed** — HMAC-verified shared-secret header, fail-closed if unset, wired on every router except `/health`. |
| Two path-traversal vectors in API service | **Moot** — the affected code was rewritten to proxy through LightRAG over HTTP; no filesystem ops on user input remain. |
| Hardcoded Mongo credentials in compose | **Fixed.** |
| Neo4j/Mongo ports exposed in prod | **Fixed** — no `ports:` published in prod compose; only the dev compose still does. |
| docker.sock without `:ro` | **Fixed and hardened further** — backup service now goes through a scoped `docker-socket-proxy` instead of touching the socket directly. |
| Real domain/IP/email committed to `stack.env` | **Fixed** — placeholders only. |
| `libretranslate:latest` unpinned | **Still open** in production (dev compose already pins a version). |
| `adminRouter.js` size / inline business logic, dead `getDbHeader()`, stale comments | **Fixed** per spot-check. |
