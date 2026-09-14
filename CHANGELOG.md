# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Verified Identity Mode** — an optional, per-study capability for clinical studies that must identify their participants, without weakening the platform's anonymity for every other study. `identity.mode` is absent on all existing studies and defaults to `anonymous`, so nothing changes for them and the new service need not be deployed at all.
  - New `identity-service/`: a separate Node/Express service with its own **PostgreSQL** database. A different engine from the research stores is deliberate — it makes it structurally impossible for the register to be swept into `mongodump` or into `studyExportService`'s collection loop; that mistake would need a code change, not a mis-set connection string.
  - Every identifying field is AES-256-GCM encrypted under a per-register data key, with the AAD bound to **both** the row id and the column name, so ciphertext cannot be moved between rows or between fields by an attacker holding `UPDATE` but not the key. One 32-byte master key, mounted as a `0400` file (never an env var); everything else HKDF-derived, with key-encryption and blind-index versions rotating independently.
  - Exact-match lookups use keyed blind indexes. There is deliberately **no** searchable name index: at clinical-study scale an n-gram index over German surnames is trivially frequency-analysable. Nurse search decrypts a bounded roster in memory instead.
  - Enrolment uses a **reserve / confirm / release** protocol, because the enrolment spans two databases with no shared transaction. Reserving first leaves a recoverable state; a single-phase redeem would burn the code if the Neo4j enrolment then failed, which needs a nurse to issue a replacement. A sweeper reclaims reservations abandoned mid-protocol. No personal data crosses the boundary — the internal API has no route that returns a name.
  - Re-identification requires a stated legal basis, a substantive reason, a **second approver enforced by a database trigger**, and a time-limited grant. Every reveal is recorded and never deduplicated. There is no bulk-reveal endpoint and none accepting a list of subject codes.
  - New Keycloak roles `identity-manager`, `study-nurse`, `monitor`, with `researcher` refused alongside any of them at runtime — the person analysing the pseudonymous data cannot resolve the pseudonyms.
  - Researcher CSV exports emit the study-local subject code for verified studies and withhold the raw Keycloak sub entirely. Anonymous studies are byte-identical to before.
  - `identity-service` shares **no Docker network** with `mongo` or `neo4j`, asserted by a CI test against `docker-compose.yml`.
  - Docs: `docs/identity-register.md` (operator and study-site runbook), `docs/identity-mode-plan.md` (design), plus `SECURITY.md`, `DEPLOYMENT.md` and `.env.example`.
  - **Study consent documents, authored in the admin portal.** A verified study asks participants for an additional consent after they redeem their code, and until now that text could only be changed by editing a markdown file in the repository and redeploying — not a workable loop for wording an ethics committee revises. A new **Consent Documents** page writes it per language, backed by `study_consent_documents` in Mongo, which **overrides** the file shipped with the image; deleting the row falls back to it, and the portal shows which of the two is live per language.
  - **A study can no longer be configured with a consent document a participant could not read.** `PUT /admin/studies/:id` returns `409 consent_document_not_ready` unless the named document is present in all five languages, published, free of `⟦…⟧` placeholders, and at one version across every locale. Previously the failure surfaced as a 404 to the participant *after* they had enrolled — the worst possible moment, and invisible to the person who could fix it. `scripts/checkLegalDocs.mjs` enforces the same completeness rules over the shipped files in CI.
  - **Documentation and diagrams.** Eight new use cases (UC-40 – UC-47) plus three supporting admin ones, three new actors, and an Identity Register package in the PlantUML use case diagram; two new sequence diagrams (`UC-44-verified-enrolment`, `UC-46-re-identification`); the register's nine entities and the two new Mongo collections in the domain class diagram; SMTP and the deliberate *absence* of a Sentry edge in the system architecture; and new `docs/architecture.md` sections on scoped researcher access, study consent documents, erasure and alerting.
  - **The whole chain now has an end-to-end test** against a real PostgreSQL (`identity-service/tests/e2e.routes.test.js`), with a Postgres service container added to CI. Every other test in the service uses hand-rolled SQL-shaped fakes, which cannot falsify the things only a database decides: the four-eyes rule is a **trigger**, the single live account link is a **partial unique index**, and reveal counting is a `RETURNING` clause specifically so two concurrent views cannot report the same number. It covers reserve → confirm, a crash mid-protocol releasing the code rather than burning it, self-approval being refused, a reveal returning only the fields asked for, revocation, erasure deleting the person outright and leaving only an audit entry, and the audit log recording *that* a name was disclosed without recording the name. It skips itself loudly without `IDENTITY_TEST_DB_URL`, and CI fails if that skip ever happens there.
  - **`consent-habconnect-clinical`** — the clinical-arm consent for HabConnect, written in all five languages from the study's real details, shipped as a **draft**. It states explicitly which parts of the platform consent it overrides: that document promises no name and no date of birth are stored, which for a verified arm is not true, and two consent texts must not be left to contradict each other. Three `⟦…⟧` placeholders mark what only the ethics submission can supply — the recruiting institution, the approval reference, and the register's retention period.

### Fixed

- **The Identity tab was written but never rendered.** `IdentityTab` was imported by nothing except its own test, so there was no way to switch a study into verified mode from the portal at all. Wired into the study modal as its own tab, with the two 409s the backend can answer surfaced as prose: frozen fields once anyone has enrolled, and a consent document that is not ready to attach.
- **Six identity-register endpoints had no UI**, and two of them blocked the feature outright. Creating a register (nothing works before it exists — the only route was a hand-rolled `curl`) and site assignments (whose API client functions had been written and were imported by no page, so only the register's creator could use it). Also added: roster CSV import, sending an enrolment code by email, Art. 17 erasure of a subject behind a typed confirmation, and revoking an approved re-identification grant before its window expires.
- **Per-study researcher membership had no UI.** `requireStudyAccess` has enforced it since the identity feature shipped, but memberships had to be inserted into Mongo by hand, so the first researcher added to a verified study needed a database operation. New admin endpoints and a *Researcher access* panel on the study's Identity tab, which also says plainly when a study is still open and entries have no effect yet.
- **`apiFetch` discarded the API's own explanation of a refusal.** It built its error message from the terse `error` code and dropped the `message` beside it, so the register's careful "This is the only identity-manager … assign another before removing this one" reached the operator as `last_manager`. Found by writing the test for the assignments panel.
- **The identity register was English-only**, while its own sidebar entries were translated into four languages. A German study nurse — the role that lives on that screen daily — got a German menu and an English page. All five surfaces (roster, register setup, assignments, roster import, re-identification queue, audit trail, researcher access, the study Identity tab) are now translated into `en`/`de`/`fr`/`nl` and use the shared admin stylesheet instead of the inline styles they had grown. Legal bases, field names, actions and sensitivities deliberately stay as their raw identifiers in every language: they are what the API and the audit log record, and an auditor comparing the screen against an exported trail should be reading the same token in both places.
- **All three identity pages asked for a 24-character hexadecimal study id, typed from memory.** The study list lives behind `/admin/studies`, which needs `admin` or `researcher` — and a study nurse is neither, so the one role that uses the page daily was the one that could not discover what to type. New `GET /identity/api/v1/registers` returns the registers the caller is actually assigned to, and the page offers them as a picker, selecting the only one automatically.
- **Printed code sheets said "Study" and invitation emails said "the study".** Both took the name from whatever the caller passed. The register now stores a display label, set when it is created, and both read it from there — what a participant is told they enrolled in should not depend on the request that happened to generate it.
- **The Identity tab replaced the API's specific refusal with a vaguer one of its own.** The frozen-fields 409 already names the exact fields ("Cannot change mode, subjectCodePrefix on a study that already has enrolments"); matching on the word "frozen" and substituting a generic sentence lost the list the operator needed. Only the one refusal that arrives as a bare code is now translated.
- **Two sequence diagrams had been unrenderable for months.** A `;` in a Mermaid arrow message is a statement separator, so one semicolon breaks the whole diagram — and the files look perfectly reasonable in review. `UC-07-request-recommendations` and `UC-19-manage-studies` are fixed, and `scripts/checkDiagrams.mjs` now catches both this and a PlantUML relation naming an undeclared alias (which renders as an empty element rather than erroring). Wired into CI.
- **An Art. 17 erasure never appeared in the study's audit view, and was recorded twice.** `eraseSubject` took its register id from a request-body field the admin portal never sent, so both audit rows landed with `register_id` NULL — and `GET /studies/:id/audit` filters on exactly that column, so the one action most likely to be asked about in an inspection was the one action invisible on the page. It was also written twice: once by the service and once by the route's ordinary auditor. The register is now read from the subject row, and only the route records it. Found by the new end-to-end test.
- **Three admin-portal sidebar entries rendered as raw message keys.** `identity`, `identityRequests` and `identityAudit` were added under `sidebar.*` in all four locale files, but the sidebar looks labels up as `sidebar.nav.*` — so the Identity register, Re-identification and Identity audit links showed their key paths instead of their names. Moved them into `nav`.

### Security

- **Every IP-keyed rate limiter in the backend did nothing.** `ipKeyGenerator` takes an IP **string**; every call site passed the whole request object. That does not throw and does not warn — it returns the object, which `express-rate-limit` then uses as the bucket key, so object identity gave each request its own bucket and no limit was ever reached. The endpoints relying on it were the pre-auth, credential-adjacent ones where the limit *is* the control: `POST /onboard` (account creation) and `POST /restore` (passphrase recovery, documented as 5/hour and the only defence against walking the username space, since a valid phrase is a re-encoding of a Keycloak username UUID). Fixed at all six call sites, with tests that drive real requests and count how many get through — asserting the key *looks* right would not have caught it, because the broken key looked perfectly plausible.
- **The identity service had no rate limiting at all**, on either port (19 CodeQL high-severity alerts). Added a broad public limiter mounted *before* authentication, so failed token verification is covered rather than being the one unlimited path; a much tighter limiter on `reveal`, the only endpoint returning plaintext identity; and one on the internal API — which is reachable only with the service token, but `codes/reserve` looks an enrolment code up by keyed digest, and a code enrols someone as a specific identified subject, so a keyspace walk is worth bounding if that token ever leaks. Keys prefer the authenticated subject over the IP because study sites sit behind institutional NAT and one busy nurse must not spend the clinic's budget.
- **Hardened the study-consent path construction** (`consentDocumentService`, CodeQL "uncontrolled data used in path expression"). Every current caller validates the slug, so this was redundant today — which is why it was worth writing down: the function is reached from a URL path segment via an exported helper, and the next caller added is the one that forgets. The slug and locale are now validated inside the reader, and the resolved path is re-checked against the language directory.

- **Resolved two further high-severity Dependabot advisories in `admin/`** (both development scope). `browserslist` ≤4.28.6 (prototype write via untrusted `browserslist-stats.json` custom stats in `normalizeStats`, GHSA-73wf-gq98-2v4g; unbounded cache growth leading to OOM, GHSA-c83g-rgw3-j3cx) and `brace-expansion` (DoS via unbounded expansion, GHSA-mh99-v99m-4gvg and GHSA-rgw5-rvv9-x895). `npm audit fix` resolved neither — `@babel/*` pins a narrower `browserslist` range, and `brace-expansion` is present in **three mutually incompatible major lines** at once (1.1.16 under eslint 8's `minimatch@3`, 2.1.2 under `glob`'s `minimatch@9`, 5.0.8 under `@typescript-eslint`'s `minimatch@10`). A flat override would have forced `minimatch@3` onto the 5.x API and broken linting, so each line is pinned separately using npm's version-scoped override syntax (`brace-expansion@1`/`@2`/`@5`). Verified with lint (clean), the admin jest suite (165 tests, 28 suites) and a full `next build`; `npm audit` reports 0 vulnerabilities.

### Security

- **Resolved five Dependabot advisories** (2 high, 3 moderate) across `app/` and `backup-service/api/`. `fast-uri` (host confusion via skipped IDN canonicalization on scheme-relative references; SSRF via repeated hostname percent-decoding) and `@humanfs/node` (recursive copy following symlinks outside the source tree, dev-only) were resolved by `npm audit fix` — 3.1.5 → 3.1.7 and 0.16.6 → 0.16.8 respectively. `qs` (array-limit bypass via bracket-key comma parsing, plus two related DoS advisories) could not be: it is pinned transitively by `express@4.x` → `body-parser@1.x`, and npm's only registry-side fix is a breaking bump to `express@5`. Pinned it forward with an `overrides` entry (`"qs": "^6.16.0"`) in both packages instead — extending `app/package.json`'s existing overrides block and adding one to `backup-service/api/package.json`. Express itself stays on 4.x. Verified that query parsing is unaffected (simple, nested, array and percent-encoded/UTF-8 params) since `qs` is Express's query parser; `npm audit` reports 0 vulnerabilities in both packages.

## [1.1.5] - 2026-08-20

### Fixed

- **The Android app crashed immediately on every launch** with `ClassNotFoundException: ...MainActivity`. `MainActivity.kt` was still sitting in its old package directory (`de.tu_dresden.hhh`) from before the app was renamed to `de.felixreinsch.healthhabithub` — `build.gradle.kts`'s `namespace`/`applicationId` were updated at the time, but the Kotlin source file was never moved to match, so the manifest pointed at a class Android could never find in the compiled dex. Moved the file to the correct package directory and updated its `package` declaration.
- **Scheduled local notifications (habit reminders, SRHI/questionnaire check-ins, end-of-study) never fired on Android at all** — not merely failing to survive a reboot. `flutter_local_notifications` v16+ only auto-merges the bare `POST_NOTIFICATIONS`/`VIBRATE` permissions into the manifest; the receiver that actually delivers a `zonedSchedule()`-based notification is an opt-in addition the app must declare itself, and it was missing entirely. Added `RECEIVE_BOOT_COMPLETED` plus the `ScheduledNotificationReceiver` and `ScheduledNotificationBootReceiver` entries to `AndroidManifest.xml`.
- **The Android notification icon was a leftover from before the app was rebranded** — a stale, unused `@mipmap/ic_launcher` (Flutter's stock template icon) rather than the app's actual current icon. The app's own `AndroidManifest.xml` `android:icon` already correctly pointed at `@mipmap/launcher_icon`; the notification initialization code just hadn't been updated to match, and since it's a single default set at plugin init (no per-notification override anywhere), every notification in the app showed the wrong icon. Also removed the now fully-unused stale `ic_launcher.png` files across all density buckets.
- **Tapping a local notification (a habit reminder, the weekly SRHI check-in, or a badge/praise notification) never opened the screen it should have — it only foregrounded the app.** Three compounding issues, all on iOS: (1) `Runner/AppDelegate.swift` never set itself as `UNUserNotificationCenter`'s delegate, which `flutter_local_notifications` requires (see its own example `AppDelegate.swift`) — without it, `didReceive` never reaches Flutter at all, so a tap opens the app (default OS behavior, independent of any app code) but no route is ever resolved, for every local notification. (2) `PushNotificationService.initialize()` ran the Firebase-specific permission/presentation-options calls *before* registering that tap callback — a throw there (simulator/APNs limitations, flaky network) aborted the whole method early, silently taking the unrelated local-notification wiring down with it; the two are now isolated so an FCM failure can never block local-notification taps. (3) The "First Step"-style badge notification's payload pointed at `/profile`, which was never a registered route (badges live at `/settings/achievements`). Also hardened: `ShellScreen`'s tap handler now logs a failed `context.go()` instead of swallowing it silently.
- **The weekly SRHI check-in card only ever appeared on My Habits after a manual pull-to-refresh** — switching to that tab from another one, or staying on it right after creating the new habit that qualified for one, never picked it up on its own. `dueSrhiProvider` (and the intentions/activity providers) are fetched once and cached; switching tabs doesn't rebuild the screen since go_router's `StatefulShellBranch` keeps it alive. `ShellScreen` now invalidates them whenever the My Habits tab is tapped, and habit creation invalidates twice — once immediately and once ~6s later, since the first SRHI window is anchored `HABIT_ANCHOR_DELAY_MS` (5s) after creation and an immediate refresh alone could still race that anchor.
- **No push notification was ever sent for a participant's first (baseline) SRHI check-in.** `syncQuestionnaireReminders()` schedules a local notification at the study's configured reminder hour on the due date — but the first SRHI window is anchored just 5 seconds after habit creation, so that recomputed fire time almost always falls earlier the same day than "now" and was silently treated as "already passed → shown as a card." A window that's already due when synced now fires an immediate, once-only notification instead, deduped per-window via a persisted id so re-syncing on every app start never re-notifies it.
- **Notifications (both FCM pushes and local habit/SRHI reminders) never showed while the app was open on iOS.** `firebase_messaging` registers its own `UNUserNotificationCenter` delegate, which by default suppresses the system alert/sound/badge presentation for *any* notification while the app is foregrounded — including ones shown locally via `flutter_local_notifications`, unrelated to FCM. Fixed by calling `FirebaseMessaging.setForegroundNotificationPresentationOptions(alert/badge/sound: true)`.
- **The "add your own habit" free-text step's Next button could become unreachable, with no way to scroll to it.** `_FreeEntryBehaviorForm` (`new_habit_screen_1_behavior.dart`) used a plain non-scrollable `Column` with a `Spacer()` — when both onboarding explainer cards ("what's a habit?" and the information-overload guard) were showing above it, they could leave too little height for the field and button to fit, clipping the button off-screen. Wrapped in a `SingleChildScrollView`.
- **The Share screen's green "share a habit today" card flashed to a plain white card the instant it detected a donation made today.** `myStatsProvider` resolving mid-visit swapped the card outright, in a single frame. It now cross-fades over 350ms, matching the app's existing implicit-transition convention (`intention_stitch_screen.dart`).
- **The admin Studies page's three donation self-report question toggles (frequency / health-benefit / wellbeing) always displayed as off regardless of the study's actual saved state, and an untouched toggle could silently fail to persist a change.** `studyService.js`'s `listStudies()` — which backs the Studies page's list and edit dialog — was missing `donationAskFrequency`/`donationAskHealthBenefit`/`donationAskWellbeing` from its per-study mapping, unlike the sibling `getStudy()`. The toggle UI read `undefined` for all three (rendering as unchecked), and if an admin saved without touching an already-"off"-looking toggle, `JSON.stringify` dropped the `undefined` fields from the request body entirely, so nothing was written to Mongo. Added the three fields to `listStudies()`, matching `getStudy()`.
- **Voice-donation audio uploads failed in production with `EACCES: permission denied` writing to `/data/audio-recordings/<uuid>.<ext>`.** `app/Dockerfile` runs the container as the non-root `node` user, but `/data/audio-recordings` never existed in the image, so the (empty) `audio-recordings-data` volume mounted there inherited Docker's default root-owned permissions, which `node` can't write into. Fixed by pre-creating the directory in the image, owned by `node:node`, before `USER node` — Docker copies an image directory's ownership onto an empty volume mounted over it, so this self-heals on the next deploy without any manual volume surgery.
- **The post-donation "share another habit" success screen briefly flashed before an already-known post-donation questionnaire, and completing that questionnaire always returned the participant to their profile instead of back to sharing.** The questionnaire slug is known synchronously from the donation response, so the mobile app previously showed a success screen for a hardcoded 2-second delay before auto-navigating to the questionnaire — cosmetic, not a technical wait. It now skips straight to the questionnaire whenever one is configured. Separately, the questionnaire confirmation screen's CTA unconditionally returned to `/settings/profile`; it now returns to `/share` specifically for a post-donation questionnaire (identified by a `habitUuid` query param), while general/scheduled questionnaires (SLIQ, RAND-36) are unaffected.
- **Participant records were keyed by a throwaway locally-generated id instead of Keycloak's real assigned one.** `onboardRouter.js` (self-onboarding) and `adminParticipantService.js` (admin-created participants) each generated a random `userId`, asked Keycloak's user-create API to assign it as the new user's `id` — which Keycloak never actually honours, it always assigns its own — then persisted the throwaway id anyway instead of the real one both functions had already looked up. Since every JWT a participant authenticates with carries Keycloak's real id as `sub`, this silently broke any lookup keyed by the authenticated user's real identity: admin device/session matching, credential rotation and account deletion's Mongo record updates, and group-targeted survey resolution (`getParticipantGroup`, used throughout `surveyRouter.js`). Enrollments, habit donations, questionnaire responses, and device tokens were unaffected — they're written from `req.user.sub` live at request time, not copied from `participants.userId`. Fixed both creation sites; added `scripts/migrate-participant-userid.js` to backfill already-affected records where needed.
- **`GET /admin/habit-donations/:uuid` 500'd on every request in production** (`TypeError: Cannot read properties of undefined (reading 'collection')`). Its `getDb()` returned the raw injected `db` parameter directly instead of falling back to the app's real lazily-connected Mongo instance the way every other router does via `makeGetDb()` — and in production, no `db` is ever pre-injected (see `app.js`), so it was always `undefined`. Fixed to use `makeGetDb()` like the rest of the codebase.

### Added

- **The Android app now builds and runs at all — its first successful local build and its first Play Store–ready release** (previously never run on Android; see issue #11). Getting there required several first-time Android build-config fixes in `android/app/build.gradle.kts`: `compileSdk` pinned to `36` instead of Flutter's auto-resolved `37` (Android SDK 37 introduced a new minor-version naming scheme — `android-37.0`, `37.1`, ... — with no plain `android-37` package, which this Flutter version's bundled default doesn't yet account for, so Gradle failed to resolve a compile target at all); core library desugaring enabled with `desugar_jdk_libs:2.1.4` (required by `flutter_local_notifications`); and the `appAuthRedirectScheme` manifest placeholder set to `de.tu-dresden.hhh`, matching `AuthService._redirectUrl` (required by `flutter_appauth` for the Keycloak PKCE login redirect to route back into the app — without it, login would never complete on Android).
- **A release signing keystore and build configuration for the first Android Play Store submission** — `android/key.properties` (gitignored, machine-local) now points at a generated release keystore, so `flutter build appbundle --release` produces a properly signed `.aab` instead of falling back to debug signing.
- **Recorded habit-donation audio clips are now included in the automated backup/restore pipeline**, alongside MongoDB, Neo4j, LightRAG, and Keycloak — `backup-service/backup.sh`/`restore.sh` gained a new tar-based step for the `audio-recordings-data` volume (mirroring the existing LightRAG pattern; no container stop/start needed since it's flat files, not a database), and the volume is now also mounted read-only into the `backup` service.
- **A non-critical `audioStorage` health check**, surfaced via both the public `GET /api/v1/health` and the admin System page, plus a one-time boot log line (`Audio recordings storage is writable` / a `WARN` with the failure reason) — a real write+delete probe against `AUDIO_STORAGE_DIR`, so an audio-storage permission regression (see the EACCES fix above) is visible immediately in logs and monitoring instead of staying silent until a participant tries voice donation. Deliberately non-critical: it never flips overall health status to `error`/503, since that endpoint also gates the Docker/Portainer container healthcheck and this stack aborts the whole deploy on the first unhealthy container.
- **Admin Donations page rows are now clickable**, opening a detail view with the voice transcript, inline audio playback, a download button, the donation-form self-report answers, and the linked post-donation questionnaire response — backed by two new admin-only routes, `GET /admin/habit-donations/:uuid` and `GET /admin/habit-donations/:uuid/audio`. Previously this data was only reachable via `docker exec`/`mongosh` directly on the server.
- **Real device tracking for the admin Participants page, replacing the standalone Devices page.** The mobile app now reports device id, platform, model, and app version alongside its FCM push-token registration (`POST /participant/register-token`); `deviceTokens` now supports multiple documents per participant (older app builds that don't send a device id keep working via the original one-doc-per-participant fallback). A new `GET /admin/devices` endpoint feeds a clickable Devices column on the Participants page — click a participant's device count to see each device's real platform/model/app version/last-seen in a modal. The standalone Devices page is removed; it could only ever show Keycloak session metadata (no device model or app version exists there), which this replaces. "Revoke Access" is unchanged — still a full sign-out via Keycloak session revocation, deliberately independent of the device list, since a device registration and a login session aren't reliably the same thing.
- **Microphone permission is now requested upfront**, alongside notification permission, the first time a participant opens the app shell — but only when their study/group has voice donation input enabled. Previously this was requested lazily, the first time the participant actually tried to record a donation.

## [1.1.4] - 2026-08-17

### Fixed

- **LightRAG queries silently returned "No relevant context found for the query." during an upstream model outage, with no automatic recovery.** Three compounding issues: (1) `LIGHTRAG_LLM_MODEL`'s compose-file default (`alias-huge-no-thinking`) wasn't visible as a Portainer stack variable, and happened to equal `LLM_FALLBACK_MODEL` — `lightrag/entrypoint.sh`'s auto-failover only activates when the two differ, so it was silently disabled; the default is now `alias-ha`, matching `LLM_MODEL`. (2) Even with a correct fallback configured, `entrypoint.sh`'s health probe sent a bare, unstructured "ping" completion, while LightRAG's real extract/keyword/query calls always request `response_format=json_object` — the affected vLLM backend served plain completions fine while its JSON-mode path 500'd independently, so the probe kept reporting the primary as healthy and never switched over. The probe now sends the same JSON-mode request shape LightRAG actually uses. (3) Added a startup warning when `LIGHTRAG_LLM_MODEL == LLM_FALLBACK_MODEL`, so this exact collision is never silent again.
- **The release workflow's CI gate could be blocked by an unrelated, coincidentally-same-commit CI run.** Pushing a changelog commit to `main` and then tagging it triggers two separate `CI` workflow runs against the identical SHA (`ci.yml` matches both `branches: [main]` and `tags: ['v*']`); `release.yml`'s gate queried check-runs by name only, so a transient flake in the unrelated `main`-triggered run could grab priority over the tag's own passing run and block publication (hit during the v1.1.3 release — see release notes). The gate now filters workflow runs by `head_branch == the tag name`, scoping it to the run that actually validated the tag being released.

## [1.1.3] - 2026-08-17

### Fixed

- **Admin-initiated participant deletion left the participant's Keycloak account fully live.** `DELETE /admin/participants/:id` (the Participants page's delete/anonymize action) only anonymized the Mongo `participants` doc via `softDeleteParticipant()` — unlike the participant's own self-service `DELETE /users/me`, it never called `keycloak.deleteUser()` or cleared `deviceTokens`. The removed participant could still sign in, refresh tokens indefinitely, and remained a valid push-notification target, while no longer appearing in the Participants list. `softDeleteParticipant()` (`app/services/adminParticipantService.js`) now also deletes the participant's `deviceTokens` and Keycloak identity, matching the self-service flow; a failed Keycloak deletion is logged rather than left silently inconsistent.

### Added

- **Admin Devices tab now resolves each session's Keycloak `userId` against the Participants collection** instead of showing a bare, uncorrelatable UUID. `GET /admin/sessions` batches a single Mongo lookup per page and returns `username` + `participantStatus` (`active` / `deleted` / `no_matching_participant`) per session; the Devices table shows the resolved username, a "Deleted" badge for anonymized-but-still-Keycloak-live accounts, and a "No matching participant" badge for orphaned Keycloak sessions with no Mongo record at all — exactly the gap the previous fix above closes going forward.

## [1.1.2] - 2026-08-17

### Fixed

- **Admin Devices tab showed no active sessions even for participants actively using the app.** `keycloakAdminClient.js`'s `listSessions()` only queried Keycloak's `/user-sessions` endpoint (online SSO sessions, ~30-minute idle timeout), but the ROPC grant that mints participant tokens requests `offline_access` specifically so the app stays authenticated across infrequent opens (`keycloakRopcClient.js`) — so real participant sessions age out of the online list almost immediately and only exist as offline sessions. `listSessions()` now merges `/user-sessions` and `/offline-sessions`, de-duped by session id.
- **`app` could start serving requests before `keycloak-init` finished granting its Keycloak service account the `realm-admin` role**, intermittently 403ing any Keycloak admin-API call (onboarding's user creation, session listing, etc.) made shortly after a fresh stack start — surfaced reliably in the nightly E2E smoke test (`POST /onboard` → `Keycloak create user failed: 403`) and possible after a production redeploy. `app` now `depends_on: keycloak-init: condition: service_completed_successfully` in both `docker-compose.yml` and `docker-compose.local.yml`.

## [1.1.1] - 2026-08-13

### Fixed

- **Habit graph dimension labels (Time, Behavior, Location, Prior Behavior, Social, Mental State, Reasoning) were always shown in English on the Explore bubble graph, regardless of the participant's app language.** Both the mobile client and the `GET /habits/bubble-graph` endpoint now resolve dimension labels per-language (`app/routes/habits/habitsGraphRouter.js`'s new `DIMENSION_LABELS_BY_LANG`, new ARB keys `bubbleGraphDimension*` across `en`/`de`/`fr`/`ja`/`nl`), matching the same language set habit-sentence translation already supports.
- **iOS release/archive builds failed on current Xcode tooling.** Three independent issues, all addressed in `mobile/ios/Podfile`'s `post_install` hook: (1) `firebase_core` assigns `[NSNull null]` to an `NSString* _Nullable` pigeon property without an `(id)` cast, which current Xcode treats as a hard `-Wincompatible-pointer-types` error rather than a warning — demoted back to a warning for that pod. (2) Xcode's Module Verifier tried to compile each plugin pod as a standalone module and failed with `Flutter/Flutter.h file not found` (Release/Archive builds only, since the verifier doesn't run for Debug) — disabled verification for pods via `ENABLE_MODULE_VERIFIER`. (3) `firebase_core`/`firebase_messaging` bumped to 4.13.0/16.5.0.

### Changed

- iOS deployment target raised to 26.0.
- Silenced third-party pod build warnings (Firebase, Sentry, AppAuth, GoogleUtilities) via `inhibit_all_warnings!`, and a harmless `libtool` "no symbols" note from Flutter's placeholder CocoaPods integration pod via `OTHER_LIBTOOLFLAGS`.
- Refreshed app store mockups/screenshots in the README.

## [1.0.0] - 2026-08-09

### Added

- **A shared spring-based motion vocabulary, replacing ad hoc fixed-duration `Curves.easeOut` animations, in both the mobile app and the admin portal.** Audited against Apple's *Designing Fluid Interfaces* principles (damping ratio + response instead of raw duration/easing, interruptibility, momentum handoff, reduced motion) and reworked the highest-value gaps rather than every screen — some earlier draft passes (a heavier onboarding-screen redesign, a spring-driven recommendation-loading skeleton) were tried and reverted because they made specific interactions feel worse, not better; what shipped is what survived review.
  - **Mobile** (`mobile/lib/theme/motion.dart`, new): `AppSpring` (`damping`/`response`, wrapping Flutter's native `SpringSimulation` — no third-party spring package) with `standard` (critically damped, `1.0`/`0.35`), `momentum` (`0.8`/`0.35`, for motion following a drag release), and `quick` (`1.0`/`0.15`, for high-frequency taps); an `animateWithSpring()` extension on `AnimationController`; `PressableScale` (instant scale-to-`0.97` on press, spring back on release) now wraps the habit-type selector cards and the log checkbox; a `reducedMotion(context)` helper reading `MediaQuery.disableAnimations`; and a shared `AppShadows` consolidating the previously-duplicated `_kCardShadow`/`_kGreenGlow` constants. The bubble graph (`bubble_graph_gesture_handler.dart`) gained real momentum physics on drag release — a short position/timestamp history feeds a `FrictionSimulation`-based fling, and dragging mid-fling now cancels it instead of fighting it — where before a released bubble just stopped dead at the finger's last position.
  - **Admin** (`admin/src/lib/motion.ts`, new): added the `motion` package (Framer Motion's successor) as the app's animation primitive — previously the admin portal had no animation library at all — with `defaultSpring` (modals, tab switches), `drawerSpring` (the mobile sidebar), and `momentumSpring` (only for motion continuing a drag, e.g. the questionnaire drag-reorder drop) presets matching the same damping/response values Apple ships. Wired into: the mobile sidebar drawer (`sidebar.tsx`, replacing a linear CSS `transition: transform 0.2s ease`), the shared `Modal` (`modal.tsx`, now materializes with blur+scale together on open instead of an instant mount), the study-settings tab underline (`studies/page.tsx`, now a sliding `layoutId` element instead of an instant snap), and the questionnaire builder's drag-reorder (`questionnaires/page.tsx`, now animates the other questions moving out of the way and springs the dropped item into place instead of an instant array-splice re-render). `spinner.tsx` and `theme-toggle.tsx` got small crossfade polish. `MotionConfig reducedMotion="user"` is set once at the app root (`providers.tsx`) so every spring above degrades to a plain opacity cross-fade under the OS's reduced-motion setting, matching the mobile app's `reducedMotion()` gating.
- **Multi-persona QA seeding**: `make seed-user COUNT=1-5` (previously always exactly one fixed test user) now seeds up to five distinct personas with independently generated, deterministic identities (`scripts/seed-test-user.js`'s `deriveCredentials()` — SHA-256 of a fixed label into a UUID-format username + 32-hex password, so re-running is idempotent per persona) and different adherence stories: `steady` (the original persona — unchanged, always seeded first so `make seed-user` with no `COUNT` behaves exactly as before), `beginner` (days-old account, minimal history), `struggler` (declining adherence, one abandoned habit), `power_user` (six habits, two graduated to full automaticity, heavy donation/community activity), and `returning` (strong start, a silent gap, now rebuilding). Shared history-building helpers (`buildRampedLogs`, `buildSrhiHistory`, `runGraduationFlow`, `donateHabit`, `linkStackedWith`, `annotateAndComment`) were extracted so each persona's story is a short, readable sequence rather than copy-pasted seeding logic. See `docs/guides/local-dev.md` § Test Login Credentials.
- **Habit Stacking (§7.1) reworked so it reads as a genuinely different mechanism from typing a cue, not just a fancy way to prefill one.** Previously, picking or typing an anchor habit silently rewrote the cue field to "After I {anchor}" — functionally indistinguishable from a participant just typing that cue themselves, and researchers had no visible signal that this was a real anchor relationship. Now:
  - `implementation_intentions` has a new `anchorLabel` field (human-readable anchor name, independent of whether the anchor is itself tracked) — `app/models/implementationIntention.js`, `app/services/intentionService.js`.
  - Cues are no longer auto-faked to satisfy validation: `POST /habits/intentions` (`app/routes/intentionsRouter.js`) now accepts an empty `cues` array when `creationMode: 'stacked'` — the anchor itself is the trigger. The Mongo schema doc's `cues.minItems` dropped from 1 to 0 for this case.
  - The app now calls the previously-unused, purpose-built `POST /habits/stack-merge` LLM endpoint (`API-service/routers/stack_merge.py`, proxied via `habitsCrudRouter.js`) to compose the "after X, I will Y" sentence, instead of the generic `/habits/stitch-intention` treating the anchor as an ordinary cue (`study_config_service.dart`'s new `stackMerge()`, wired into `intention_stitch_screen.dart`).
  - The anchor is shown as its own labeled field — "Stacked onto: {anchor}" — on the confirm screen (`new_habit_screen_3_confirm.dart`) and the habit detail screen (`habit_detail_screen.dart`), instead of being folded into the intention sentence. When the anchor is itself a tracked habit, the detail screen renders a tappable `_AnchorHabitTile` (link icon + name + chevron) that navigates to the anchor's own detail page, resolved from the same `intentionsProvider` list already in memory.
  - **New opt-in**: when a participant free-types an anchor that isn't already one of their tracked habits, a Cupertino-style toggle ("Also track '{anchor}' as a habit I'm building") offers to create it as its own standalone habit. If enabled, `ConfirmPlanScreen._resolveStackedOn()` creates the anchor habit first (a short default duration, a generic self-selected cue, `habitType: build`) and links the main habit's `stackedOn` to its returned id; best-effort — a failure here never blocks creating the habit the participant actually came for.
  - Fixed a visual bug along the way: the "Stack onto an existing habit" `ExpansionTile` drew its own top/bottom divider border by default, showing as two stray thin lines inside the `Card` that already has its own border (`shape`/`collapsedShape: RoundedRectangleBorder(side: BorderSide.none)`).
  - The "What's a cue?" onboarding explainer now mentions stacking as an alternative to typing a cue, shown only when `habitStackingEnabled` (`habit_onboarding_widgets.dart`'s new `cueStackingHint`).
- **Profile Fields admin section reworked to match the Questionnaires page**, adding multi-language support that didn't exist before. `app/routes/profileFieldDefinitionsRouter.js` / `app/schemas/adminSchemas.js`: `label` and each select option's `label` are now locale-text maps (`{en, de, fr, ja, nl}`, reusing the same `localeText()` helper questionnaires use) instead of plain strings; the public endpoint resolves them to a plain string via `?lang=`, with each option's `value` kept as a stable, language-independent key (so a stored answer like `"male"` stays correct even if the participant later switches app language — mirrors the questionnaire-option `{value, label}` pattern). The two shipped defaults (**gender**, **age group** — `app/db/seedProfileFields.js`) are now seeded as library entries (`isLibrary: true`) with all 5 languages filled in, and library fields reject admin edits/deletes with `403`, matching how the questionnaire library is protected. Admin UI (`admin/src/app/(admin)/profile-fields/page.tsx`) now has **Library** (read-only, with a per-language preview modal) and **Custom** tabs, a language-toggle + per-language editing form for custom fields, mirroring `questionnaires/page.tsx`'s structure and CSS almost verbatim. Mobile: `ProfileFieldDefinition.options` is now `List<ProfileFieldOption>` (`value`/`label`) instead of `List<String>`; both `profile_setup_screen.dart` (onboarding) and `profile_screen.dart` (Settings) request `?lang=<current locale>` and submit the option's `value`, not its display text.
- **Highlights the classifier-matched context phrase in bold on the Explore graph's habit detail sheet.** Tapping a habit already showed a dimension badge (e.g. "Location"), but the sentence itself gave no clue *which words* the classifier had matched to it. The Cypher query behind `GET /habits/bubble-graph` (`app/db/habitQueries.js`) now returns `Context.text` — the exact phrase matched under each dimension — as `contextText`, scoped per-dimension (the same habit can match different phrases under different dimension bubbles). Flutter's `HabitBubble`/`HabitNode` models carry it through, and a new shared `HighlightedText` widget (`lib/widgets/highlighted_text.dart`, extracted for unit-testability rather than left as a private class) bolds the first case-insensitive occurrence of that phrase within both the habit name and the "Original: …" text, falling back to plain text when the phrase is empty or (e.g. after translation) no longer appears verbatim.
- **Replaced the recommendation-loading screen's phase-icon animations with a green-tinted skeleton loader.** The old version cycled through 4 hand-drawn animations (pulsing book, force-directed graph, scanning document, sparkle) on a fixed schedule — minimum 8s (4 × 2s) regardless of how long the actual recommend call took, then sat stalled replaying the last animation for however much longer a slow call needed, reading as broken. The rotating phase-label text now loops on a plain `Timer.periodic` for as long as the request actually takes — no more stall — above pulsing skeleton cards (`SkeletonBox`, now with an optional `color` param for this green tint; existing grey usages like the My Habits list skeleton are unaffected) previewing the shape of the results screen's recommendation cards.
  - **Recommendations are now capped at 3** (`_MAX_RECOMMENDATIONS` in `recommend.py`, enforced server-side by truncating the LLM's output — not just requested in the prompt, since models don't always follow count instructions exactly; the prompt itself now asks for "up to 3" rather than "3 to 5"). The skeleton mirrors this: exactly 3 placeholder cards.
  - **The 3 skeleton cards build up one at a time** rather than appearing all at once, via a new shared `EntranceFade` widget (`lib/widgets/entrance_fade.dart` — extracted from a one-off private copy in `project_info_screen.dart`'s data-flow diagram, now used in both places). The display floor was raised from 1.2s to 2.6s so a very fast response can never cut this build-up off mid-animation.
  - **Reworded the phase labels** to be warmer and to actually name what's used — "Asking experts…" (vague, and not really what happens) → "Comparing with habits people like you have tried…"; "Looking through your habits database…" → "Checking what's already working for you…"; "Reading academic papers…" → "Consulting behaviour-change research…"; "Generating your personalised recommendations…" → "Writing your personalized suggestion…". These now match the "Community habits" / "Your habits & answers" / "Research" terminology on the About page's data-flow diagram. Updated across all 5 app languages (en/de/fr/ja/nl); DE/FR/JA/NL are draft translations, same caveat as elsewhere in this changelog.
- **"How do recommendations work?" explainer card on the goal-input screen**, mirroring the donate screen's "Why share?" card: a short explanation + a link into the existing "About the Health Habit Hub" page (`/about-project`, retitled from "About Health Habit Hub"). New localized strings (`recommendWhyCard*`) added across all 5 app languages (en/de/fr/ja/nl); the DE/FR/JA/NL translations are draft and should get native review before shipping, consistent with this project's existing translation policy.
- **Reworked the "About the Health Habit Hub" page down to two sections** ("How your shared habit is used" and "How recommendations work") — dropped What's a cue?, Why this matters, Adaptive reminders, and What's SRHI?, which had nothing to do with why someone lands on this page (mostly from the recommend flow) and just made it a long scroll past unrelated content.
- **Rebuilt the recommendations diagram as a genuine data-flow diagram, and fixed a real bug in the first version**: the four inputs (goal, your habits/answers, community habits, research) were positioned by an unconstrained `Wrap` while a single connector line was drawn down the diagram's center, so visually only whichever chip happened to land in the middle read as "connected" — everything else looked disconnected. Now each input sits in its own fixed-width column and a `CustomPainter` draws one line from directly under *each* input down to a shared bus, then one line from the bus into the AI node, using the exact same column-center formula the layout uses — so every input visibly links in, not just the one nearest the center. Animated dots travel down each line into the node, which pulses gently (matching `docs/design-system.md`'s solid-fill `primaryDark` rule). A short one-line explanation for each input now sits below the diagram as a legend, since the icon + 2-word label alone wasn't self-explanatory. Along the way, switched the input chips from a horizontal icon+text row (which overflowed on long German labels — a real bug the previous version shipped with) to a vertical icon-badge + wrapped-caption layout, which is safe regardless of label length.
- **Behavioral-principle features (§7.1–§7.5).** Five habit-formation principles from the research plan, each following the existing nullable study→group config-override pattern, the Mongo (event/state) vs. Neo4j (structural/graph) split, and admin-tunable `admin_settings` thresholds. See `DOCUMENTATION.md` §13.
  - **Habit Distinction (§7.4)** — `implementation_intentions.habitType` (`build`/`quit`, required; validator-enforced, legacy docs backfilled to `build`). `POST /habits/intentions` now requires `habitType`. Donated `Habit` nodes carry a `habit_type` property; `GET /habits/bubble-graph` returns it. Mobile: build/quit chosen up front, colour-coded habit cards (green/red), and an All/Build/Quit filter chip on the Explore bubble graph.
  - **Habit Stacking (§7.1)** — `stackedOn` + `creationMode` on intentions; a `(:Habit)-[:STACKED_WITH]->(:Habit)` edge + `creation_mode` node property in Neo4j. New `POST /api/v1/llm/stack-merge` (API-service, prompt `stack_merge.txt`) proxied via `POST /habits/stack-merge` merges an anchor + new behaviour into one if-then sentence in the user's language. `habitStackingEnabled` study/group config. Mobile: "stack onto an existing habit" cue option (anchor need not be tracked) and a nested staircase render.
  - **Implementation Intention Reminder (§7.2)** — `reminderContentMode` (`generic`/`implementation_intention`) study/group config. `GET /habits/intentions/reminder-plans` now returns the resolved mode, per-plan cue/behavior text, and admin-editable rotating phrasing templates (`admin_settings` key `reminder_ii_templates`). Mobile: reminders spell out "when {cue}, {behavior}", rotating templates by index to avoid reminder-blindness.
  - **Information Overload guard (§7.3)** — a per-type (build/quit) active-habit cap that starts at 1 and grows by 1 each time an existing habit of that type reaches an admin-tunable reminder tier (`information_overload_unlock_tier`), reusing the Fading Reminders signal. Blocked creation returns `409 { reason: 'information_overload', unlockTier, currentTier }`. `informationOverloadGuard { enabled, userOptOutAllowed }` study/group config; per-user opt-out via `GET`/`PATCH /me/preferences` (`user_preferences`), honoured only when the study permits it. Mobile: rationale info card + a settings opt-out toggle.
  - **Gamification (§7.5)** — new `gamificationService.js` computes XP, levels, and badges fresh from existing signals (frequency tier, streak, adherence, SRHI); only `earnedBadges` is persisted per habit. `GET /habits/intentions/gamification` returns XP/level/badges/`newlyEarned`. Badges: First Step, Building Momentum, Steady Habit, Second Nature, Habit Architect (rewards stacking), Quit Champion. All XP weights/curve params are `admin_settings` (`gamification_*`). Mobile: Profile badges + XP bar, settings level/XP, per-habit traffic-light indicator, and one-time praise notifications with rotating copy.
- **Habit-scoped questionnaires** (delivered on habit creation instead of enrollment): a questionnaire *definition* now carries `scope: 'study'` (default, anchored to enrollment) or `scope: 'habit'` (anchored to each habit's creation time, +~5s). When a participant creates a habit (`POST /habits/intentions`), the backend generates any active habit-scoped assignment's week-1 window **per habit** and, once anything delivered, fires a fire-and-forget FCM push (~5 s later, reusing the existing device-token → FCM path) nudging them to complete it. `questionnaire_windows` now carries `intentionId`, part of its unique key so per-habit series don't collide. A habit-scoped questionnaire stays invisible to a participant (Profile list, Share tab) until they actually have a window for it — i.e. until they've created a relevant habit. New service functions `generateHabitCreationWindows` / `resolveHabitScopeAssignments` / `generateWindowsForUser` (the last now excludes habit-scoped assignments from its enrollment-anchored path). Admin Studies → Questionnaires shows a scope badge and a fixed (non-editable) cadence note for habit-scoped rows. See `DOCUMENTATION.md` §8 → Questionnaire Scheduling & Check-in Delivery and `docs/data-model.md`.
- **SRHI is now unconditional, not a toggleable assignment.** Previously SRHI was seeded as a `scope: 'habit'` library questionnaire like any other and had to be assigned to a study to activate (the default study auto-seeded a *deactivated* assignment via `ensureSrhiHabitCreationAssignment`). That required every participant-facing questionnaire endpoint to remember to exclude it — since it renders through a dedicated slider UI in My Habits, not the generic radio-button questionnaire screen — and one endpoint (`/participant/questionnaires`, backing the Profile "Health Questionnaires" list) didn't, letting SRHI be listed and filled from Profile even before a participant had created any habit. SRHI now runs unconditionally: `POST /habits/intentions` calls `srhiService.generateWindows` directly with no assignment/scope check, item text lives only in `app/utils/srhi.js` (served via `GET /me/habit-config`), and there's no `questionnaires` library entry or admin toggle for it anymore — `retireLegacySrhiLibraryEntry()` removes any leftover one on boot. This also fixes a side effect in adaptive reminder fading (`reminderPlanService.js`): a missing SRHI score maps to `0`, not "excluded," so any study that hadn't opted into the old toggle had every intention's autonomy score permanently capped at 0.5 — below every tier past `every_2_days`. Every study now gets real SRHI data, so fading works uniformly. Removed `srhiHabitScopeActive` and `ensureSrhiHabitCreationAssignment` (dead code). The SRHI push and the "adaptive habit reminder" local notification both now deep-link into My Habits (`payload`/`data.screen: "habits"`, wired via `onDidReceiveNotificationResponse` + `getNotificationAppLaunchDetails()` for cold start); the "questionnaire due" local reminder deep-links into My Profile instead.
- **Completed questionnaires can no longer be resubmitted, and now show as completed in the app.** Previously the Profile → Health Questionnaires list always rendered a plain, always-tappable button per assigned questionnaire, with no completion state and no server-side check — a participant could refill and resubmit the same questionnaire indefinitely. `GET /participant/questionnaires` now returns `available`/`completedAt`/`nextDueAt` per questionnaire, computed from `questionnaire_windows` (new `getQuestionnaireCompletionStatus`); the Flutter list shows a green, tappable button while a window is open and due, or a greyed-out, non-interactive tile with "Completed on {date}" once it closes, reverting to green only once the next cadence occurrence's window opens. `POST /questionnaire-responses` enforces this server-side too — `409` if the questionnaire has ever had a window but none is currently open-and-due — so a stale client cache can't bypass it; a questionnaire with no window at all (ad-hoc, outside the assignment system) is left ungated. Submitting now invalidates both `participantQuestionnairesProvider` and `dueQuestionnairesProvider` so the UI reflects completion immediately, not just after an app restart. See `DOCUMENTATION.md` §8 and `docs/data-model.md` → `form_responses`.
- **Corrected admin participant Progress view**: "Created habits" now lists the participant's actual `implementation_intentions` (previously it showed only Neo4j _donated_ habits, so a participant who created habits appeared to have none), and a new **SRHI check-ins** summary shows `completed / scheduled` + latest score (completed counts _submitted_ windows, not merely scheduled ones).
- **Study-configurable reminders** (habit, questionnaire, end-of-study, study-update): a new admin Studies → **Reminders** tab (merging in the former standalone Notifications tab — one-off/scheduled sends and campaign history now live under the study-update section) replaces the old single enabled/hour toggles with a shared mode model per type — habit reminders get `off` / participant picks the time / admin fixes the time (`ToggleSwitch`-based: "Reminder enabled" then "Admin fixes the time"); questionnaire, end-of-study, and study-update reduce to a plain "Set a time or don't" switch, since no participant-facing override exists for them. Every type's first control is a scope switch ("Configure per group"): study-wide shows one editor, per-group shows one editor per group with no inherit escape hatch — switching back to study-wide clears any stored group overrides. An overview strip at the top of the tab summarizes all 4 types at a glance. `app/services/reminderConfigService.js` resolves the effective config (schema-enforced per type, not just hidden in the UI); `intentionsRouter.js` enforces the habit-reminder mode server-side so a direct API call can't bypass an `off`/`admin_fixed` study condition. Fixes a real bug along the way: the mobile confirm screen used to show dead read-only text with no picker at all when a study "enabled reminders without a fixed time" — that state is now a working, editable picker. **Study update reminder** is new: a recurring broadcast push backed by one or more `notification_campaigns` documents with `recurrence: {intervalDays, until}` (one study-wide, or one per group when scoped per-group) — `sendCampaign` reschedules each after every send instead of terminating, so the existing node-cron dispatcher picks it up again automatically; saving cancels every tracked campaign for the type and recreates exactly what should exist (campaigns have no update endpoint). `endOfStudyNotification` is now content-only (`{title, body}`); its enabled/time moved into `reminders.endOfStudy`. See `docs/architecture.md` and `docs/data-model.md` for the full model.
- **Verbatim paper quotes on citations**: each cited source now carries an optional `quote` — a sentence or two copied word-for-word from the retrieved paper text that backs the recommendation — alongside the `Author (Year) — Title` citation. The LLM's `source_filenames` field is renamed to `sources` (`[{filename, quote}]`); the server verifies each `quote` is an actual (whitespace-normalised) substring of the retrieved LightRAG context before showing it, dropping anything that doesn't match to prevent fabricated wording. The app shows the quote in italics above the citation link.
- **Goal input guarding** (API-service): regex prompt-injection screen (EN + DE, e.g. "forget all previous instructions") rejects shady goals instantly with `422`; an LLM system-message backstop refuses harmful/off-topic goals with `{"refused": true, reason}` → `422`. The Flutter app shows the refusal reason verbatim. Refusals are logged and never cached.
- **Paper citations with links**: recommendations now cite academic papers per item (`source_filenames`, validated against the actually retrieved documents). `citations.py` parses Zotero-style KB filenames into `Author (Year) — Title`; curated DOI/links come from `API-service/data/references.json` (no links are guessed). The app renders tappable citations; plain text when no curated link exists.
- **Suggested cue per recommendation** (`suggested_cue`): a concrete "when/where" trigger phrase; the app shows it on the card and prefills the cue screen with it via "Add to my habits".
- **"Add to my habits"** on recommendation cards: forwards a recommendation into the guided habit flow (cue → LLM-stitched implementation intention → confirm screen with reminder + community-share options).
- **Language matching**: recommendations are written in the language of the goal (German goal → German output).
- **Anti-repetition context**: the user's last ≤15 recommendation titles (MongoDB) are fed back into the prompt; new rule against recommending habits the user already practises.
- **`LLM_RECOMMEND_MODEL`**: separate (fast) model for the final recommendation call, independent of `LLM_MODEL`.
- **Speed knobs** (`.env`): `RECOMMEND_MAX_CONTEXT_CHARS` (LightRAG context cap, default 30000 in `.env`) and `LLM_RECOMMEND_MAX_TOKENS` (completion cap); habit JSON in the prompt is now compact.
- `scripts/test-recommender.py` — smoke test for the recommender (health check with startup retry, timed `/llm/recommend` call, parsed output, proxy-timeout warning).
- **Questionnaire scheduling & completion tracking.** Assign a questionnaire to a whole study or a specific group (group overrides study-wide for that questionnaire), with a cadence: recurring interval (every _N_ days, _M_ times) or fixed timepoints as study **weeks and/or exact days** after enrollment. Per-participant scheduled windows are generated on enrollment and back-filled on assignment changes; submitting a response marks the next open window complete and links it to the answers. New admin **Schedule** tab (assignments + completion) and an answer-viewer to read a participant's answers per questionnaire/timepoint. New collections `questionnaire_assignments`, `questionnaire_windows`; new admin endpoints under `/admin/studies/:id/questionnaire-assignments` and `/admin/participants/:id/responses`.
- **Graph donation edges**: donated habits are linked in Neo4j via `(:User)-[:DONATED]->(:Habit)-[:DONATED_IN]->(:Study)`, enabling donor → habit → study traversals.
- **Study/group flags** for onboarding and self-habit-creation; **Redis result-cache** for the LLM stitch-intention step.
- **Recovery phrases + token cards** for participants surfaced in the admin portal, gated by `EXPOSE_RECOVERY_PHRASES` (off by default).
- **Dev fast-forward** (test tool): from a participant's Progress modal, advance their timeline by _N_ days so upcoming questionnaire windows, daily logs and SRHI become due immediately — useful for exercising time-based flows without waiting. Shifts timestamps across `enrollments`, `participants`, `implementation_intentions`, `daily_behavior_logs`, `srhi_responses`, `questionnaire_windows`, `form_responses`, and the Neo4j `ENROLLED_IN` edge. Gated by `ENABLE_TEST_TOOLS` (off by default; never enable in production). New endpoints `GET /admin/participants/test-tools` and `POST /admin/participants/:id/fast-forward`.
- **Critical-alert emails**, sent to `ALERT_EMAIL` via generic SMTP (`SMTP_HOST`/`PORT`/`USER`/`PASS`/`FROM`/`STARTTLS` — any provider, no vendor lock-in): backup success/failure (`backup-service/lib.sh`'s `send_smtp_mail()`, replacing the old Mailjet API call) and LLM-model-unavailable (new `API-service/alerting.py`, hooked into `llm_client.py`'s existing circuit breaker — fires once per `LLM_FALLBACK_COOLDOWN_S` window, not per failed request) both send directly from application code. BullMQ job failures (`bullmq_jobs_failed_total`, terminal failures only — see `habitQueue.js`'s `isTerminalFailure()`), service reachability (new `blackbox-exporter` container probing every long-running service with no host mounts), and sustained 5xx rates route through a new Grafana unified-alerting setup (`monitoring/grafana/provisioning/alerting/alerting.yaml`). See `docs/runbook.md` for the full picture and `DEPLOYMENT.md`'s Critical Alerts section for setup.

- **Study & Questionnaire graph connected in Neo4j**: `(:Study)-[:HAS_QUESTIONNAIRE]->(:Questionnaire)-[:HAS_ITEM]->(:QuestionnaireItem)` and `(:User)-[:SUBMITTED]->(:QuestionnaireResponse)-[:FOR_QUESTIONNAIRE]->(:Questionnaire)` / `-[:HAS_ANSWER]->(:QuestionnaireItem)` are now written on every questionnaire definition sync and response submission (`db/questionnaireQueries.js`), so a participant's answers are traversable alongside their study/enrollment/habit graph instead of living only in MongoDB `form_responses`. Recurring questionnaires get one `QuestionnaireResponse` node per completion (`occurrence`/`scheduledFor` from the closed window), forming a per-participant time series without duplicating the questionnaire or its items. Graph writes are best-effort/non-blocking; a startup reconcile (`services/questionnaireGraphSync.js`) self-heals drift. See `docs/data-model.md` §1.2.
- **Bubble graph dimension labels (Time, Behavior, Location, Prior Behavior, Social, Mental State, Reasoning) now follow the app's language setting.** Previously hardcoded English regardless of locale, unlike the habit-text bubbles inside them, which already localized correctly. Fixed in two layers: client-side, new `bubbleGraphDimension*` keys across all 5 ARB files (`mobile/lib/l10n/app_*.arb`) with a `localizedDimensionLabel()` lookup in `bubble_graph_widget.dart` keyed off the dimension's stable `id`, so future app builds resolve labels locally instead of trusting the network response; server-side, a new `DIMENSION_LABELS_BY_LANG` map in `habitsGraphRouter.js` keyed off the already-sent `?lang=` query param, so already-installed app versions — which render whatever `label` the backend sends verbatim — get correctly localized labels immediately on deploy, with no app update required. DE/FR/JA/NL strings are draft translations, same review caveat as elsewhere in this changelog.
- **`scripts/seed-habits.py` gained `--user-id` and `--random` flags** for generating targeted demo/test habit data. `--mode seed` (the fast, no-Keycloak direct-to-Neo4j path) now accepts `--user-id <id>` to assign every seeded habit to one caller-chosen userID instead of round-robining across the 10 synthetic seed users, and `--random` (both modes) to pick a random subset of the 100-habit pool instead of always taking the first N. `--user-id` is seed-mode-only — `--mode e2e` donates through the real `/habits/donate` pipeline and onboards genuine anonymous Keycloak accounts, so its userID comes from the resulting token, not a caller-chosen label; use `--concurrency 1` there to put an entire batch under one freshly-onboarded user instead.

### Changed

- **Default study now enables Implementation Intention reminders (§7.2) and the Information Overload guard (§7.3) with participant opt-out allowed**, and its post-study-code-redemption flow now lands on the Share screen instead of My Habits (`study_code_screen.dart` — matches the existing behaviour when a participant skips entering a code at all, so both paths through onboarding now end the same way). The health-questionnaire-due local reminder and its snackbar prompt on app resume were removed (`shell_screen.dart`'s `dueQuestionnaireProvider`/`_remindDueQuestionnaires()`, and the now-unused `questionnaireReminderMessage`/`questionnaireReminderAction` l10n keys) — this duplicated the questionnaire's own in-app due state with no added value. Logging a habit no longer shows a confirmation snackbar either (`my_habits_screen.dart`) — the log checkbox's own fill/checkmark state change plus a haptic tap already confirm the action; a snackbar on top of that for the single most frequent action in the app was pure noise. The now-unused `habitUnlogged` l10n key was removed.
- **Information Overload guard (§7.3) rationale card reworked**: now uses the same dismissible `OnboardingExplainerCard` style as the "what's a habit?" explainer (previously a plain, non-dismissible `Card`), tracked under its own persisted dismissal key (`HabitOnboardingPrefs.hasSeenOverloadGuardIntro`/`markOverloadGuardIntroSeen`, independent of the habit-intro card) so it doesn't reappear once dismissed. The copy now explicitly states the Settings opt-out exists but isn't recommended, and clarifies that habit stacking is exempt from the cap (`new_habit_screen_1_behavior.dart`, `informationOverloadTitle`/`informationOverloadInfo` l10n keys).
- **Habit-stacking anchor picker polish**: the "Anchor habit" dropdown label was clipped at the top of its field (`childrenPadding` top `0` → `12`); the dropdown, its popup menu, the free-text anchor field, and the cue field all now use `BorderRadius.circular(14)`, matching every other rounded input in the app instead of sharp corners; picking a tracked habit from the dropdown now hides the free-text anchor field instead of silently copying the picked habit's name into it (`new_habit_screen_2_cue.dart`).
- **Stacked habits are now visually distinguishable from standalone ones on My Habits**: a stacked child renders indented in a gutter with a drawn elbow connector (vertical trunk + horizontal joint) linking it up to its anchor, instead of a single small icon that was easy to miss (`my_habits_screen.dart`'s new `_StackConnectorPainter`).
- **Informed consent updated to v1.3.0** (`app/language/{en,de,fr,ja,nl}/consent.md`, DE authoritative). Adds an ethics-committee-requested amendment: neutrality toward participants recruited via a cooperating clinical institution (no influence on their treatment; no data from clinical records enters the study; the institution gets no access to study data), a corrected description of the target population for the intensive-care sub-study ("adult patients discharged from hospital after completing intensive-care treatment," replacing broader language that didn't explicitly exclude acutely-treated or non-consenting patients), and clarification that both public app sign-up and clinical referral are valid, equivalent recruitment paths. Also fixes an internal contradiction flagged during review: the document said data is fully anonymous while also describing account deletion of "your account and all associated data," which isn't coherent for genuinely anonymous data. Resolved by keeping data anonymous throughout (not pseudonymized, per explicit correction during drafting) and clarifying that deleting your account removes only the account — already-anonymous study data remains in the research database, since it can't be traced back to delete selectively — with an urgent-case path to contact the study team directly for full removal. Version bump triggers the app's existing mandatory re-consent flow for already-enrolled participants.
- **Backend lint toolchain: eslint 9 → 10, `eslint-plugin-json` 4 → 5.** Clears 5 high-severity advisories in the `brace-expansion` → `minimatch` → eslint chain (`npm audit` in `app/` now reports 0 vulnerabilities). eslint 10 removed the legacy `context.getFilename()` rule API, which `eslint-plugin-json@4` relied on, so that plugin was bumped in the same step; `eslint.config.js` needed no changes. Backend `format:check`, `lint`, and the full unit + integration suites all pass on the new toolchain. The **admin** package's audit findings were deliberately left alone: they are all devDependencies (jest/eslint/babel), and `npm audit fix --force` there proposes *downgrades* (jest 30 → 25, eslint-config-next 15 → 12) that would break the test suite and Next 15 linting.
- **Participant notification toggles removed.** The app's _Settings → Notifications_ section (per-channel switches for habit reminders, questionnaire reminders, and study updates) is gone — study reminders are part of the protocol and are always scheduled. Participants who don't want them can still mute the app at the OS level. Deleted the device-local `NotificationPrefs` store and its Riverpod provider; `ReminderSchedulerService` no longer consults per-user toggles (researcher/study-level controls — reminder hour, end-of-study notification — are unchanged). FAQ copy updated across en/de/fr/ja.

- **Removed the Mailjet integration.** `MAIL_USER`/`MAIL_PASS`/`MAIL_FROM` are gone; replaced by generic `SMTP_*` vars (see above). `ALERT_EMAIL`/`BACKUP_EMAIL` precedence is flipped — `ALERT_EMAIL` is now canonical and `BACKUP_EMAIL` is the deprecated fallback (previously the reverse) — since alerting now covers more than just backups. **Breaking** if you currently set both to different values: `ALERT_EMAIL` now wins.

- Recommendation responses no longer expose Neo4j habit UUIDs (`selected_habit_uuids`); they are logged and stored in MongoDB for debugging instead. Rationales are instructed to use plain language (no BCIO/ontology terms or internal identifiers).
- LLM client: configurable `LLM_TIMEOUT_S` (default 120 s) and `LLM_MAX_RETRIES` (default 0 — fail fast instead of 504ing through the proxy); every LLM call now logs model, prompt size, and duration.
- API-service MongoDB client honours `MONGO_SERVER_SELECTION_TIMEOUT_MS` / `MONGO_SOCKET_TIMEOUT_MS` (default 5 s) so Mongo outages degrade gracefully instead of blocking 30 s per call.
- Mobile admin section removed; participant / device / comment / donation management moved into the web admin portal.
- **`mobile-release.yml` no longer triggers automatically on a `mobile-v*` tag push.** Both the `beta` (TestFlight) and `release` (App Store submission) Fastlane lanes are now manual-only, triggered by hand from the Actions tab (`Run workflow`) — pushing a version tag is now purely a bookkeeping convention (see `mobile/RELEASING.md`) and no longer has the side effect of shipping a build to Apple.

### Fixed

- **An abandoned habit's weekly SRHI check-in kept showing on My Habits.** Two independent bugs, found while chasing one bug report: (1) `srhiService.getDueWindows` (backend) only filtered on `submittedAt`/`scheduledFor`, never on the owning habit's status, so a window generated before a habit was abandoned stayed "due" forever — fixed by joining against `implementation_intentions` and requiring `status: 'active'`, mirroring the pattern `getUpcomingSrhiQuestionnaireItems()` already used. (2) Even after that backend fix, the app's own `dueSrhiProvider` is a separately cached Riverpod provider — `habit_detail_screen.dart`'s abandon-confirm handler invalidated `intentionsProvider` but not `dueSrhiProvider`, so the My Habits list kept serving its stale cached list until something else happened to invalidate it. Both fixed; `app/tests/unit/srhiService.test.js`, `app/tests/integration/srhi.routes.test.js`, `mobile/test/widget/habit_detail_screen_test.dart` all gained regression coverage for this path (none existed before).
- **Information Overload guard (§7.3) incorrectly blocked stacking a new habit onto an existing one.** `intentionService.createIntention`'s overload check ran unconditionally, but a stacked habit is explicitly meant to be exempt from the per-type cap — it isn't a new, separately-attention-demanding habit, it's anchored to one already automatic. The check now short-circuits when `creationMode === 'stacked'`. `app/tests/unit/intentionService.test.js`.
- **The onboarding welcome screen's page dots visibly jumped down mid-swipe.** The page-indicator dots row was conditionally inserted (`if (_currentPage > 0) Padding(...)`) once the user swiped past the first page, which changed the `Column`'s layout height mid-drag — measured via a screenshot test at the 50% drag threshold: the content above jumped 158px → 146px. The dots row is now always rendered, faded in/out with `Opacity` instead of being added/removed, so the layout height never changes (`welcome_screen.dart`).
- **`make seed-user COUNT=5` (and any persona with a short adherence span) could crash with `MongoInvalidArgumentError: Invalid BulkOperation, Batch cannot be empty`.** `buildRampedLogs()` decides per-day whether to log a coin-flip against an adherence probability, and over a short span (e.g. a 3-day-old habit) it can legitimately come up with zero logged days — `insertMany([])` on the empty result crashed the whole run non-deterministically (roughly 1 in 8–10 runs for the `beginner` persona's 3-day habit). All 26 call sites across `scripts/seed-test-user.js` now go through a new `insertManyIfAny()` helper that no-ops on an empty array.
- **`cryptography` bumped 49.0.0 → 50.0.0 in `knowledge-mcp/requirements.txt`**, resolving PYSEC-2026-3552 (a Bleichenbacher timing oracle in PKCS#7 `EnvelopedData` decryption). Verified with `pip-audit` run inside the `python:3.11-slim` image this lockfile targets (local Python was 3.10, which can't resolve this fully pinned lockfile) — clean.
- **CodeQL "clear-text logging of sensitive information" alert on `scripts/seed-test-user.js`'s persona-credential output.** This is intentional: the script's entire purpose is printing freshly generated, disposable test-persona credentials to a developer's terminal so they can log in as that persona, it never runs in CI (only via `make seed-user` locally), and there is no real user secret involved. Redacting the output would defeat the tool, so resolved with GitHub's supported inline suppression (`// codeql[js/clear-text-logging]`) plus a one-line justification on both the `password` and `recovery phrase` log lines, rather than a code change.
- **`make test`/`make test-python` were silently sending real alert emails to `ALERT_EMAIL`.** `API-service/tests/test_llm_client.py`'s circuit-breaker tests deliberately simulate LLM outages to exercise `fire_alert_email()`, which does a real `smtplib` send whenever `SMTP_HOST`/`SMTP_USER`/`SMTP_PASS`/`ALERT_EMAIL` are set — true for the repo's real `.env`, which `make test`/`make test-python` source before running pytest. A new autouse `no_real_alert_emails` fixture (`API-service/tests/conftest.py`) patches `alerting.send_alert_email` for every test except `test_alerting.py` itself (which already mocks `smtplib` directly and uses fake env vars). Added `scripts/send-test-alert.py`, a manual-only smoke test for confirming the real SMTP path still works end-to-end, since it's now impossible to exercise accidentally via the normal test suite.
- **`POST /habits/intentions` rejected every habit-creation request from app builds that predate §7.4 Habit Distinction.** The route started hard-requiring `habitType` (`'build'`/`'quit'`) with no fallback, so any client that doesn't yet send it — i.e. every installed app older than the version that shipped habit distinction — got a `400` on the most common action in the app. `habitType` omitted entirely now falls back to `'build'` (same default the service layer and donation flow already use); an explicit but unrecognised value is still rejected. `app/routes/intentionsRouter.js`.
- **`LLM_MODEL` was set to `gpt-4o-mini`, a model `llm.scads.ai` doesn't serve.** Every LLM call that doesn't explicitly override the model (habit/context classification, profile/habit extraction, stack-merge, intention-stitching — everything except the recommend call, which already set its own `LLM_RECOMMEND_MODEL`) was silently failing on the primary attempt and falling through to `LLM_FALLBACK_MODEL` on every request past the first in each cooldown window. That routed far more traffic through the fallback model than intended, which is the likely root cause of a `RateLimitError: max_parallel_requests` alert against SCADS.AI's very low (2) concurrency cap. `LLM_MODEL` is now `alias-ha`; `LLM_FALLBACK_MODEL` changed from `alias-ha` to `alias-reasoning` — the two must differ, or `llm_client.py`'s `chat_complete()` treats an identical fallback as "no fallback configured" and fails outright instead of retrying (this exact bug was also why the original alert had no automatic retry). `.env.example`, `stack.env`, `DEPLOYMENT.md`.
- **The Share screen's green didn't match the rest of the app.** Its "Shared today" badge, "Share another habit" button, and the main pre-share task card explicitly overrode their fill color to the bright brand green (`#45B700`) instead of the darker shade (`#2E8C00`) every other button in the app defaults to — the only screen doing this out of ~35 button call sites. The darker shade isn't arbitrary: white text on `#45B700` measures 2.62:1 contrast, below WCAG AA's 4.5:1 minimum, while `#2E8C00` clears 4.31:1+. Separately, the Recommend screen's hero lightbulb icon used the filled glyph instead of the outline variant every other "icon in a tinted box" treatment in the app uses, reading as visually heavier/out of place. Fixed both (`donate_screen.dart`, `goal_input_screen.dart`), and wrote down the underlying rule — which shade of green goes where, and why — in a new `docs/design-system.md` so it doesn't drift again.
- **Local dev backups always failed on the Keycloak step, and `make seed` could hang indefinitely waiting on Neo4j.** Two independent regressions from the recent Keycloak-SSO-gating work: (1) `backup-service/backup.sh`/`restore.sh` hardcoded Keycloak's admin-token and realm-export/import URLs with a `/auth` path prefix — correct for production (`KC_HTTP_RELATIVE_PATH=/auth`, unchanged) but wrong for local dev, which never mounts Keycloak under `/auth`. Both scripts now read a `KEYCLOAK_URL` base (matching the convention `app/services/keycloakAdminClient.js` already uses) instead of hardcoding either path, set explicitly per environment in each compose file. (2) Local dev's Keycloak runs in `KC_DB=dev-file` mode (no Postgres, no `keycloak-db` service at all — unlike prod), but `.env`'s `KC_DB_PASSWORD` was still being passed into the local backup container, so `backup.sh` kept attempting (and failing) a `pg_dump` against a database that doesn't exist locally; `docker-compose.local.yml` now explicitly clears it so the script takes its existing graceful "not configured" skip path instead of erroring and sending a false alert email on every run. Separately (not a code bug, just a footgun worth documenting): a stale Docker/OrbStack host-port-forward for the Neo4j container can leave `127.0.0.1:7474`/`7687` refusing connections from the host even though the container itself is healthy and Bolt-via-`docker exec` works fine — `docker restart <neo4j container>` resolves it; see `docs/runbook.md`.
- **`scripts/seed-local.js` seeded a second, drifted copy of the questionnaire library** (`mongo/seed/questionnaires.json` — English-only, no `languages`, and still had the SRHI library entry retired earlier) instead of the canonical `app/db/seed/questionnaires.json` that the backend itself upserts on every boot. Repointed it at the canonical file and deleted the stale duplicate (`mongo/seed/questionnaires.json`, `mongo/seed/seed-questionnaires.js` — both unreferenced elsewhere).
- **Participants were silently logged out after normal gaps between app opens**: none of the mobile token-minting call sites requested the `offline_access` scope, so refresh tokens were bound to Keycloak's regular SSO session (30-minute idle default) — fine for a continuously-used website, wrong for a habit tracker checked a few times a day. All four call sites (`app/services/keycloakRopcClient.js`, used by `/onboard`, `/restore`, `/users/me/rotate-credentials`; and the PKCE `AuthService.login()`) now request `offline_access`, and the realm sets `offlineSessionIdleTimeout: 15552000` (180 days) with `offlineSessionMaxLifespanEnabled: false` (applied idempotently via `keycloak-init` in both compose files, so it also patches an already-running Keycloak). The result is a rolling 180-day idle window with no absolute cap: opening the app at least once every six months keeps the session alive indefinitely; explicit sign-out still revokes it. Existing dead sessions need one manual sign-out/sign-in to pick up the new scope. See `DOCUMENTATION.md` §11 → Session & Token Lifetime and `docs/architecture.md` → Auth Flow.
- **Study onboarding/self-habit-creation toggles reverted to "on" after saving**: `listStudies()` (the query backing the studies table and the edit modal) omitted `onboardingEnabled`/`selfHabitCreationEnabled` from its response, so reopening the edit modal always fell back to the default regardless of what was actually saved.
- **"Allow participants to create their own habits" reframed as "Enable habit creation"**: since there's no other way for a participant to get a habit, disabling it now hides the entire My Habits tab in the app (not just the add-habit button) and is enforced server-side on `POST /habits/intentions` (previously UI-only). Also closed a bypass: the Recommender's "Add to habits" button skipped the structured-catalog restriction entirely, letting a participant create an off-catalog habit even when the study required picking from a fixed activity list.
- **Notification campaigns always reported "Sent to 0 participants"**: the send route returned the pre-send campaign snapshot (`recipientCount: null`) instead of the actual send result. Now also surfaces _why_ a send reached nobody (no participants enrolled vs. no registered devices vs. every push failed) instead of a bare zero.
- Recommender container connected to `localhost:27017` instead of the `mongo` service (env override in `docker-compose.local.yml`), causing Mongo fetch failures and gateway 504s during recommendation generation.
- Flutter loading screen surfaced raw `DioException` text; it now shows the server's error message (e.g. the goal-guard refusal reason) or a friendly timeout message.
- **Account restore was broken**: onboarding minted a 32-byte password but the 24-word recovery phrase only encodes 16 bytes, truncating the restored password so login failed. Passwords are now 16 bytes and round-trip exactly.
- **Daily habit logging returned HTTP 500** — `loggedAt` was set in both `$setOnInsert` and `$set`, a MongoDB path conflict.
- **Opening a habit could force a logout** — concurrent token refreshes replayed a single-use Keycloak refresh token; refresh is now single-flighted.
- **Neo4j `User` nodes were being merged on two different keys** — `db/userQueries.js` used `userId` (lowercase `d`) while the uniqueness constraint and every other write path (enrollments, donations) used `userID`. Every questionnaire submission created a duplicate, orphaned `User` node with no `ENROLLED_IN` edge instead of matching the real one. Corrected to `userID` everywhere and folded into the graph-connection work above.
- **Admin panel sign-in loop / 404s under its own subpath**: the admin app is served under `/admin` (Next.js `basePath`), which requires `NEXTAUTH_URL` to include the *full* `/admin/api/auth` path (not just `/admin`) or NextAuth generates sign-in/callback links missing the basePath entirely (`/signin` instead of `/admin/signin`, 404). Also fixed a Traefik path collision between the admin app's own `/api/*` routes and the dashboard's `PathPrefix(/api)` rule. `docker-compose.yml` now sets `NEXTAUTH_URL=https://${DOMAIN}/admin/api/auth`; `docker-compose.local.yml` was just brought in line with the same pattern for local dev.
- Admin study creation returned 400 when a group label was left blank.
- **The activity heatmap (`ContributionGraphWidget` — My Habits, per-habit activity log, and the donate/share screen) misplaced days logged after the EU Daylight Saving Time change**, e.g. a habit logged on a real Monday rendered in the grid's Sunday row. The grid is built by walking day-by-day from the oldest visible week to today (`cursor.add(const Duration(days: 1))`) on a *local* `DateTime`, whose `add`/`subtract` is real-elapsed-time based, not calendar-aware; crossing the 23-hour spring-forward day (last Sunday of March) overshoots "+1 day" to 01:00 instead of 00:00, silently dropping a calendar day and shifting every subsequent date one weekday out of alignment for the rest of the season. The underlying logged data was never affected — only the grid's own day-stepping arithmetic. Fixed by doing that arithmetic in UTC (DST-free) and converting to local Y/M/D only once each day is stored. See `docs/guides/flutter-architecture.md` → Activity visualization.

### Security

- **`js-yaml` 4.3.0 → 4.3.1** (`app/`) — fixes [GHSA-5p4m-2wfm-xmqj](https://github.com/advisories/GHSA-5p4m-2wfm-xmqj) (CVE-2026-59870), quadratic CPU consumption in `!!omap` resolution; the 4.x fix hadn't been backported to the version previously pinned. High severity, direct dependency.
- **`nanoid` 3.3.16 → 3.3.18** (`admin/`, transitive) — fixes [GHSA-2v37-7h3g-55p8](https://github.com/advisories/GHSA-2v37-7h3g-55p8), custom generators could loop indefinitely when `size` is `0`. High severity.
- **`json` (RubyGems) 2.20.0 → 2.21.2** (`mobile/`, transitive via fastlane) — fixes a `JSON::ResumableParser#partial_value` freed-buffer dereference that could crash on a truncated duplicate-key stream. Low severity.

## [0.0.1] — 2026-06-23

Initial release of Health Habit Hub — a research platform for studying health habit formation, developed at TU Dresden as part of the DFG-funded research programme.

### Included in this release

- **Mobile app** (Flutter — iOS / Android / Web): habit donation, questionnaire-based health profiling, AI-powered personalised recommendations, DFG study protocol (implementation intentions, daily logging, weekly SRHI), adaptive reminders, data export, comment & like on community habits
- **Backend API** (Node.js / Express): full REST API at `/api/v1/*`, Keycloak OIDC auth, MongoDB + Neo4j persistence, service-to-service auth pattern
- **Recommendation pipeline** (Python / FastAPI): M3 pipeline — personal habit cosine ranking, 3-index community vector search (sentence / context / BCIO), LightRAG hybrid RAG retrieval, Redis response cache
- **Admin portal** (Next.js): study management, weighted round-robin group enrolment, questionnaire builder, analytics dashboard (Recharts), comment moderation, knowledge base management
- **Knowledge graph** (Neo4j): BCIO ontology mapping, vector indexes for habit / context / BCIO concept embeddings, community habit graph
- **Infrastructure**: Docker Compose stack (Traefik v3, Keycloak 26, MongoDB 7, Neo4j 5, Redis 7, LightRAG, LibreTranslate, Prometheus, Grafana, backup service)
- **CI/CD**: 13-job GitHub Actions pipeline (lint, unit tests, integration tests, Flutter analysis, ontology integrity, Docker build validation, security audit, nightly E2E smoke test, CodeQL)
- **Repository conventions**: CONTRIBUTING.md, CODE_OF_CONDUCT.md, PR template, issue templates, CODEOWNERS, release workflow with CI gate

### Added — Standalone analytics page, monitoring (2026-06-15)

- **Dedicated `/analytics` sidebar page (Recharts):** analytics moved out of the study-edit modal into its own first-class sidebar route accessible to both `admin` and `researcher` roles; the page has a study dropdown (defaults to the first active study), five KPI summary cards (total enrolled, active last 7 days, dropouts with colour-coded rate, avg SRHI at latest week, avg questionnaire completion), and four Recharts charts — vertical BarChart for weekly active rate per condition (reference line at 50%), LineChart for SRHI trajectory with a dashed habit-threshold line at 4, step-after LineChart for cumulative dropout, and a horizontal BarChart for questionnaire completion (reference line at 80%); a participant table at the bottom lists all enrolled members with group, enrolled date, last-active date, mini survey-completion bar, and status badge; `recharts` added to `admin/package.json`
- **Analytics tab removed from study edit modal:** the "Analytics" tab button, `ModalTab` union type entry, render branch, and `AnalyticsTab` import are all removed from `studies/page.tsx`; the `studies-analytics-tab.tsx` component is retained as a standalone module for potential reuse
- **Prometheus + Grafana (local):** `docker-compose.local.yml` now includes `prometheus` (port 9090, `prometheus.localhost`) and `grafana` (port 3002, `grafana.localhost`); Prometheus scrapes the existing Node.js `/metrics` endpoint at `app:9091`; Grafana auto-provisions the Prometheus datasource and the pre-built HHH App Metrics dashboard (`monitoring/grafana/dashboards/hhh-app.json`) with HTTP rate, latency percentiles, memory, and event loop panels; Makefile gains `monitoring`, `monitoring-stop`, `logs-prometheus`, `logs-grafana` targets

### Fixed — Admin portal (2026-06-15)

- **Keycloak issuer mismatch (OAuthCallbackError):** `KEYCLOAK_ISSUER` in `docker-compose.local.yml` corrected from `http://keycloak:8080/realms/hhh` to `http://localhost:8080/realms/hhh`; Keycloak `start-dev` stamps `iss` with the public-facing hostname, not the Docker-internal one; NextAuth v4 `idToken` auto-detects `true` when scope includes `openid` and then validates `iss` strictly via `client.callback()` — the internal URL caused every login to fail with "try sign in with a different account"
- **Knowledge Base HTTP 422:** all four `kbRouter.js` proxy calls were missing `X-Service-Auth-Token`; FastAPI returns 422 (not 401) for a missing required `Header(...)` parameter; added `serviceHeaders()` helper that injects `API_SERVICE_SECRET` into every upstream fetch
- **Questionnaires crash (React error #31):** MongoDB stores SurveyJS question options as `{value, label}` objects; the preview modal and edit handler rendered them directly as React children; options are now normalised to plain strings at load time in both places
- **LightRAG processing timeout:** `--timeout` increased from 360 → 3600 s in `lightrag/entrypoint.sh`; the external SCADS.AI LLM was timing out at chunk 18/23 on larger documents
- **LLM model:** changed from `alias-ha` → `alias-huge` in `.env` and `docker-compose.local.yml`

### Fixed — CI pipeline repairs (2026-06-10)

- **`npm ci` "Invalid Version:" repaired (2026-06-12):** the regenerated `app/package-lock.json` contained a corrupt entry — `node_modules/google-gax/node_modules/@grpc/grpc-js` had no `version`/`resolved`/`integrity` fields (just `{"optional": true}`), making npm's arborist throw `Invalid Version:` during every `npm ci` (all setup-node-app CI jobs + the app Docker build). Note: `npm ci --dry-run` does **not** catch this — verification now uses a real clean-room `npm ci` (612 packages, passes); `admin/package-lock.json` audited clean; full backend suite re-run (538/538)
- **Ontology constraint parser fixed:** the CI step split `constraints.cypher` on `;` _before_ removing comments — a semicolon inside a header comment produced a bogus statement (Cypher syntax error), and `//`-prefixed chunks bundled with real statements would have been silently dropped; the parser now strips comment lines first, and the header comment no longer contains a semicolon (10 clean statements verified)
- **Ontology – graph integrity job rewritten for the current schema:** it still seeded and asserted the retired `hhh__` legacy graph; now seeds a Habit→Context→BCIOConcept(+Comment) fixture and asserts constraint presence (`habit_uuid`, `bcio_uri_unique`, `comment_id_unique`), pipeline-shape retrievability, and integrity invariants (no duplicate uuids, no orphaned Context/Comment nodes)
- **Flutter – dependency audit:** `flutter_timezone` bumped `^4.1.1` → `^5.0.2` (latest major is 5.x; the audit gate flags lagging majors) and the scheduler adapted to the v5 `TimezoneInfo.identifier` API
- **Nightly E2E:** corrected service list for `docker-compose.local.yml` (no `keycloak-db` locally; added `keycloak-init`; removed the full-stack fallback that pulled LLM-dependent services); seeding now runs via `npm run seed` from `app/`
- **Deprecation warnings:** `actions/checkout@v5`, `actions/setup-python@v6`, `actions/upload-artifact@v5` across all workflows and composite actions (Node 24 runners)

### Added — Comment moderation, full localization, CI fixes (2026-06-10)

- **Comment moderation (UC-34/UC-27):** `GET /api/v1/admin/comments` (all participant comments newest-first with habit context, limit-capped) and `DELETE /api/v1/admin/comments/:commentId` (removes the anonymous Neo4j node + Mongo ownership mapping); new Flutter admin screen (list, refresh, confirm-and-delete) reachable from the habit monitor app bar; adminRouter gains the lazy production Neo4j fallback; 3 new integration tests (role enforcement, listing with context, delete-and-verify)
- **Localization completed:** 36 new l10n keys (consent flow, account deletion, data export, AI disclaimer, reminder picker, habit-strength chip, comments UI, moderation UI) translated to EN/DE/JA across the three arb files and the generated localization classes; all hardcoded English strings from the recent feature work replaced — JA strings pending native-speaker review like the consent translation
- **CI fixes:** committed `docs/api/openapi.yaml` regenerated (had re-staled after the moderation endpoints — the new drift gate would have caught it); Prettier formatting applied to 5 backend files; Dart import blocks normalized (dart:/package:/relative, each sorted) in all 20 session-touched files to satisfy `directives_ordering` in `flutter analyze`; `timezone` constraint fixed to `^0.11.0` for `flutter_local_notifications` 22 pub resolution; lockfile verified in sync with `npm ci --dry-run`

### Fixed — Account deletion was incomplete in production (2026-06-10)

- `usersRouter` lacked the production fallbacks the other routers have: with `createV1Router()` called without injected clients (the production path in `app.js`), `DELETE /users/me` wiped MongoDB but **silently skipped the Keycloak identity and the user's Comment nodes**. Now mirrors `adminRouter`/`habitsRouter`: lazily creates a real Keycloak admin client and Neo4j runner when none are injected; the nightly E2E smoke test exercises this path against real containers

### Added — Engineering robustness (2026-06-10)

- **Crash/error reporting (opt-in):** backend Sentry integration behind `SENTRY_DSN` (`app/utils/errorReporting.js` — central Express error handler, request bodies/cookies stripped, no-op without DSN); Flutter `sentry_flutter` behind `--dart-define=SENTRY_DSN` with PII/screenshots/view-hierarchy disabled; DEPLOYMENT.md documents the self-hosted-instance requirement
- **Nightly E2E smoke test:** `scripts/smoke-e2e.mjs` walks the real participant journey (health → legal docs → onboard → consent → enroll → habit-config → intention → log → reminder plan → export → deletion incl. erasure verification) against live containers; `.github/workflows/nightly-e2e.yml` boots the compose stack nightly and runs it — catches integration drift 535 mocked tests cannot
- **OpenAPI drift gate:** fixed `scripts/generate-spec.js` (js-yaml resolution from `app/node_modules`; the script was broken and the committed spec was **1119 lines stale**); spec regenerated; CI now regenerates and `git diff --exit-code`s `docs/api/openapi.yaml`; `npm run generate-spec` / `check:openapi` added
- **Backup hygiene:** optional offsite mirror in `backup.sh` via rclone (`OFFSITE_REMOTE` env + git-ignored `backup-service/rclone/rclone.conf`, failures alert like any backup error); runbook gains a quarterly restore-drill procedure and documents the nightly Neo4j dump downtime window (~1 min, container stop)
- **Secrets:** DEPLOYMENT.md gains a secrets-handling section (Portainer secrets over flat `.env`, `chmod 600`) and a rotation checklist — flagging the circulated Mailjet credentials for immediate rotation and the removed reCAPTCHA keys for revocation

### Added — Study features: re-consent, data export, adaptive reminders, habit social signals (2026-06-10)

- **Re-consent on version bump (UC-31):** app start compares the recorded consent version against the served document; a bump routes to a mandatory re-consent screen (accept → recorded server-side; decline → sign-out). Fails open on network errors
- **Participant data export (UC-32 / GDPR Art. 20):** `GET /api/v1/users/me/export` returns all 12 participant collections as a JSON download; Settings → "Export my data" shares the file via the system share sheet
- **Adaptive habit reminders (UC-33):** participants pick a reminder time (Cupertino wheel) at intention creation (`reminderTime` HH:mm on the intention); `reminderPlanService` computes a transparent autonomy score (0.5·SRHI + 0.35·adherence14d + 0.15·streak) mapped to fading tiers daily→every-2-days→twice-weekly→weekly→off, with two-week hysteresis before fading and immediate snap-back to daily when 7-day adherence drops below 0.5; weights tunable via `admin_settings` (`reminder_*` keys, per-study experimentation); `GET /habits/intentions/reminder-plans` + Flutter scheduler (`flutter_local_notifications` zonedSchedule, new `timezone`/`flutter_timezone` deps) resyncs on app start, intention creation, and SRHI submission; 12 algorithm unit tests
- **Habit comments & likes (UC-34):** `like` as third annotation type (Mongo dedup + `annotations_like` counter on Habit nodes); anonymous `(:Comment)-[:COMMENT_ON]->(:Habit)` nodes with ownership mapped only in `habit_comments` (validator + indexes, models/ pattern) for rate limiting and GDPR erasure — account deletion now also detach-deletes the user's Comment nodes; explore sheet gains ♥ button, like count, and a comment list/composer; community habits in the recommendation pipeline now carry `community_likes`, and the prompt instructs the LLM to prefer well-liked habits
- My Habits overview cards now show a per-habit "Habit strength" score chip (latest SRHI /7 with trend arrow) above the existing sparkline; full trajectory chart + heatmap remain on the detail screen
- Backend suite: 535 tests (21 new for likes/comments, 12 for the reminder algorithm, 2 for export); diagrams + catalogue extended (UC-33, UC-34), class diagram updated (Comment, ownership mapping, reminderTime, like counters)

### Changed — Neo4j legacy schema retired, Japanese added, consents hardened (2026-06-10)

- **n10s plugin dropped:** `NEO4J_PLUGINS=["n10s"]`, the n10s procedure allowlists, and the `EXTENSION_SCRIPT` workaround (`neo4j/extension.sh`, deleted) removed from both compose files — nothing has called n10s since the legacy donate flow was removed; requires a Neo4j container recreate on next deploy; also deleted the vendored 13 MB `neo4j/plugins/n10s.jar` (was git-tracked but not mounted by any compose file)
- **Neo4j legacy schema retired (no data migration needed — no legacy data exists):** the last legacy writer (`assignGroupLabel` on `hhh__Donor`) removed — group membership lives in MongoDB + Keycloak only; `seed-local.js` no longer seeds legacy Group/Donor nodes; `neo4j/init/constraints.cypher` rewritten for the current schema; US-133 constraints/indexes (`habit_uuid_unique`, `context_text_dimension`, `bcio_uri_unique`) now applied automatically at startup via `app/utils/neo4jSchema.js`; `docs/migration.md` documents the one-statement conversion should a legacy environment ever resurface
- **Japanese (ja) is now a full app language:** `app_ja.arb` + generated `AppLocalizationsJa` (188 strings), registered in `supportedLocales`, locale provider, and the settings picker (日本語); backend `preferredLanguage` and cue-pool `language` accept `ja` (legal documents and backend messages already existed in JA)
- **consents collection hardened:** `app/models/consent.js` with JSON-schema validator (semver `consentVersion`, locale enum) and `{userId, consentedAt}` compound index, applied at startup and via `scripts/add-mongo-validators.js`; 4 new model unit tests

### Fixed — Pre-submission audit (2026-06-10)

- Regenerated `app/package-lock.json` after the legacy-dependency removal — `npm ci` (used in CI) would have failed on the lockfile/manifest mismatch
- Added `ios/Runner/Runner.entitlements` (`aps-environment`) wired into all three Runner build configurations, plus `UIBackgroundModes: remote-notification` in `Info.plist` — without these, APNs registration and therefore the entire FCM push flow (UC-15/UC-24) silently fails on devices

### Added — App Store compliance (2026-06-10)

- **Informed consent (Guideline 5.1.3):** ethics-reviewed HabConnect consent document (v1.0.0, DE authoritative + EN/JA convenience translations) served at `/:lng/consent` through the versioned legal-doc pipeline; mandatory `ConsentScreen` before account creation in the Flutter onboarding; acceptance recorded locally and via `POST /api/v1/users/me/consent` (append-only `consents` collection); re-readable under Settings → Legal → Study consent
- **Account deletion (Guideline 5.1.1(v)):** `DELETE /api/v1/users/me` removes all participant-linked MongoDB documents (11 collections) and the Keycloak identity (new `deleteUser` admin-client method, idempotent); Settings → Delete account with explicit confirmation, local wipe, and logout
- **Privacy manifest:** `ios/Runner/PrivacyInfo.xcprivacy` (no tracking; Health/UserID/UsageData collection declared; required-reason APIs CA92.1, C617.1, 35F9.1) registered in the Runner Xcode target
- **Medical disclaimer (Guideline 1.4.1):** AI-provenance + not-medical-advice banner on the recommendations screen
- **Review package (Guideline 2.1):** `docs/app-store/review-information.md` with demo flow, study code instructions, reviewer notes, App Privacy label mapping, and guideline status; references ethics submission (2025-05-13) and DPO assessment (Az. 0543-025/001, 2025-03-28)
- 8 new integration tests (consent recording, deletion incl. idempotency); diagrams + use case catalogue extended (UC-31, UC-32)

### Added — Use-case test coverage completed (2026-06-10)

- UC-10: integration tests for `GET /me/habit-config` (enrollment cue config, cue sampling, SRHI items, admin-settings fallback, auth)
- UC-15: integration tests for `POST /participant/register-token` (auth, validation, upsert semantics)
- UC-25: integration tests for the Node `kbRouter` proxy against a mocked API-service (admin-only role enforcement, list/upload/delete/reindex pass-through, 502 on upstream outage) — the API-service side was already covered by `test_retrieve.py`
- UC-30: first test suite for `knowledge-mcp` (7 pytest cases for `search_knowledge` / `ingest_document` with mocked LightRAG, incl. auth header, modes, and error propagation); new CI job `knowledge-mcp-test` + `requirements-dev.txt`
- All 30 use cases now have automated coverage (UC-26 is a UI link; UC-29 covered by static backup-script checks)

### Added — Legal-document versioning (2026-06-10)

- YAML front matter (`version`, `effectiveDate`, `bindingLanguage`) on all 9 legal documents (`app/language/{en,de,ja}/{privacy,imprint,accessibility}.md`); legal wording unchanged
- `parseFrontMatter` in `app/utils/markdown.js` (no new dependency); legal-page API responses now include a `document` metadata field
- Flutter legal screen renders a localized footer (version · effective date) and, on non-German locales, an authoritative-version note — _wording of that note pending DPO confirmation_
- CI gate `app/scripts/checkLegalDocs.mjs` (`npm run check:legal`): fails the build when locales of a document carry different `version`/`effectiveDate`, preventing silent translation drift; 5 new unit tests for the front matter parser

### Removed — Legacy web experiment app (2026-06-10)

- Deleted the unauthenticated server-rendered experiment site: `donate`, `thanks`, `demo`, `about`, `reward`, and `contact` routes + controllers, their public JS assets, and the root redirect to `/:lng/donate`. Habit donation happens exclusively via `POST /api/v1/habits/donate`
- Deleted the old n10s/RDF Neo4j writer (`app/utils/Neo4jDatabase.js`) and its models (`donation.js`, `experimentGroup.js`, `contexts.js`), integration test, and script; existing legacy graph data is untouched (see `docs/migration.md`)
- Dropped now-unused dependencies (`express-recaptcha`, `nodemailer`), `RECAPTCHA_*` env vars (compose + `.env.example`), and `recaptcha`/`mail` config blocks; removed `test:neo4j` script
- **Kept:** legal pages (`/:lng/imprint`, `/privacy`, `/accessibility`) — the Flutter app fetches and renders them — and the surveys API (`/api/v1/surveys`), which the mobile app uses
- Scrubbed configuration & docs: `RECAPTCHA_*` removed from `.env`, `stack.env`, `DEPLOYMENT.md`, `DOCUMENTATION.md` (env section), and `docs/guides/developer-onboarding.md`; `MAIL_RECEIVER` dropped from `.env` (contact-form only — `MAIL_USER/PASS/FROM` kept for the backup service); legacy user manuals (`docs/MANUAL-{en,de,ja}.md`) carry a deprecation banner pointing to the participant guide; fixed stale "WebView survey" description in `docs/guides/flutter-architecture.md` (donation is a native form against the REST API)
- Verified: ESLint clean, 480/480 backend tests pass, compose files validate

### Fixed — Legacy donate flow crash (2026-06-10)

- `app/controllers/donateController.js`: `saveDonateData` dynamically imported `Neo4jSparqlDbClient`, a class renamed to `Neo4jDbClient` in the US-170 dead-code pass. The dynamic import evaded static analysis and resolved to `undefined`, so every submission of the legacy web donate form (`POST /:lng/donate`) crashed with `TypeError: Neo4jSparqlDbClient is not a constructor` (HTTP 500). Import corrected; verified against the exported class and full test suite (480/480 pass)

### Fixed — Architecture docs vs. actual stack (2026-06-10)

- Removed Fuseki from all current architecture diagrams and service tables — the service is no longer in `docker-compose.yml`; ontology/RDF sections in `docs/architecture.md`, `docs/data-model.md`, and `DOCUMENTATION.md` are now marked _retired/legacy_
- Corrected backup documentation: targets are MongoDB, LightRAG, Neo4j, Keycloak (not Fuseki); retention is configurable via `BACKUP_RETENTION_DAYS` (default 14 days, not 30)
- Clarified Redis's role in diagrams: API-service response cache consulted _before_ the LightRAG retrieval + LLM generation pipeline

### Added — Documentation & Diagrams (2026-06-10)

- New diagrams-as-code suite under `docs/diagrams/`: system architecture (Mermaid), UML use case diagram (PlantUML), structured use case catalogue with code traceability (30 use cases, 5 actors), one Mermaid sequence diagram per use case (`UC-01` … `UC-30`), and a domain class diagram covering MongoDB collections, Neo4j nodes, and backend domain classes
- `docs/diagrams/Makefile` + README for reproducible export to SVG/PNG/PDF via `mermaid-cli` and PlantUML; all Mermaid sources validated with `mermaid.parse()`
- Rewrote `README.md`: condensed Mermaid architecture overview, repository layout, use case section, full documentation index, contributing conventions (logo and badges retained)
- Replaced placeholder `SECURITY.md` with a real security policy (private reporting, scope, supported versions)
- Cross-linked `docs/architecture.md`, `docs/data-model.md`, and `DOCUMENTATION.md` to the new diagram suite

### Changed

- LightRAG upgraded from 1.3.9 to 1.5.0 (`lightrag/Dockerfile`)

### Changed — Full-Repo Clean Sweep (2026-06-03/04)

**Stack 1 — `app/` (Node.js/Express)**

- Renamed `token_card_service.js` → `tokenCardService.js` (camelCase convention); updated all import paths
- Deleted `app/controllers/defaultController.js` — confirmed unused (no active consumers)
- Split `habitsRouter.js` (888 lines) into three focused modules: `habits/habitsCrudRouter.js`, `habits/habitsStatsRouter.js`, `habits/habitsGraphRouter.js`; orchestrator reduced to 68 lines
- Converted `.then()` callback chains to `async/await` in `questionnaireResponsesRouter.js` and `adminRouter.js`; documented PDFKit `new Promise` wrapper in `tokenCardService.js`
- Added JSDoc (`@param`, `@returns`, `@throws`) to all 17 exported service functions and all 5 exported middleware functions
- Extracted single-responsibility helpers from long service functions in `habitDonationService.js`, `studyService.js`, `studyCodeService.js`, `notificationService.js`; private helpers prefixed `_camelCase`

**Stack 2 — `API-service/` (Python/FastAPI)**

- Extracted shared Redis lazy-initialisation pattern into `routers/_cache.py` (`get_redis`, `make_cache_key`, `_REDIS_TTL`); removed duplication from `extract_habits.py` and `extract_profile.py`
- Extracted shared LLM invocation helpers into `routers/_llm_helpers.py` (`load_prompt_template`, `call_llm_with_fallback`); simplified `refine_translation.py` and `refine_translation_de.py`
- Replaced all `Any` type hints with concrete types across all routers (`AsyncIOMotorDatabase`, `aioredis.Redis`, `list[str]`, `dict[str, object]`, etc.); used `cast` where JSON shapes are known at runtime
- Standardised `HTTPException` error handling: all routers use `status.HTTP_*` constants; replaced raw integer status codes
- Added Google-style docstrings (module-level + `Args`/`Returns`/`Raises` blocks) to all router functions, helper functions, and Pydantic models across all 12 Python files

**Stack 3 — `admin/` (Next.js 14)**

- Removed unused `useRef` import and dead CSS classes (`.categoryCell`, orphaned `.select` in knowledge-base module)
- Moved `analytics-tab.tsx` from `app/(admin)/studies/` into `components/studies-analytics-tab.tsx`; updated all import paths
- Replaced all remaining `any` TypeScript types with proper interfaces; exported `StudySummaryForAnalytics` type
- Added JSDoc to all exported page components (`StudiesPage`, `CuePoolsPage`, `KnowledgeBasePage`, `QuestionnairesPage`, `SettingsPage`, `ProfileFieldsPage`) and `Sidebar`, `AnalyticsTab`, `apiFetch`, `authOptions`
- Extracted data-fetching hooks into same-directory files: `useStudiesData.ts`, `useQuestionnairesData.ts`, `useCuePoolsData.ts`, `useKnowledgeBaseData.ts`; page components reduced to thin rendering shells

**Stack 4 — `mobile/` (Flutter)**

- Split `main.dart` (592 lines) into `app.dart` (HhhApp widget) and `router/app_router.dart` (GoRouter config + all routes); `main.dart` reduced to ~30-line entry point
- Split `bubble_graph_widget.dart` (529 lines) into `bubble_graph/bubble_graph_data.dart`, `bubble_graph/bubble_graph_painter.dart`, `bubble_graph/bubble_graph_gesture_handler.dart`
- Extracted reusable `AdminDataTable<T>` widget to `screens/admin/widgets/admin_data_table.dart`; refactored `admin_questionnaires_screen.dart` and `admin_surveys_screen.dart` to use it
- Split `donate_screen.dart` (646 lines) into `donate/widgets/donate_form_widget.dart` and `donate/widgets/donate_progress_widget.dart`
- Added `///` Dart doc comments to all public classes, methods, providers, and fields across 70+ files; added section headers (`// ── State reads ──`, `// ── Main layout ──`, etc.) to large `build()` methods

## [1.3.0] - 2026-04-16

### Security

- Participant passwords now stored as bcrypt hashes (was plaintext) — `adminParticipantService.js`
- Timing-safe secret comparison for shared-secret endpoints; security headers middleware added to all responses
- Shared-secret authentication added between Node.js backend and Python API service — new env var `API_SERVICE_SECRET`, new file `API-service/auth.py`
- IDOR vulnerability closed on recommendations feedback endpoint — query now scoped by `userId`; regression test added
- Field length limits added to all API request models in Python API service
- LLM call timeout added to Python API service
- Knowledge-base endpoint path traversal guard added
- PII redacted from survey submission logs
- `secure` and `sameSite` cookie flags added to session cookies
- `_id` field stripped from all API responses
- WebView navigation restricted to app origin in donate and profile screens

### Added

- Redis distributed lock on notification cron job — prevents duplicate dispatch across multiple instances
- Jest + React Testing Library test suite for Next.js admin app (`admin/src/__tests__/`)
- IDOR regression tests for recommendations feedback endpoint
- Interaction tests for questionnaires, studies, and knowledge-base admin pages
- `API-service/auth.py` — shared-secret middleware for all Python API routes

### Changed

- `adminRouter.js` refactored into domain sub-routers: `app/routes/admin/participantsRouter.js`, `studiesRouter.js`, `surveysRouter.js`, `notificationsRouter.js`
- Token card PDF generated at participant creation time (previously generated lazily on first download)
- Python API singletons consolidated into shared `API-service/deps.py` using FastAPI lifespan management
- Redis compare-and-delete now uses unique per-lock token to prevent accidental lock release

### Removed

- Age-consent middleware removed from Node.js backend
- Disclaimer routes removed from Node.js backend
- Legal document screen added to Flutter app to replace the removed middleware/routes

## [1.2.0] - 2026-03-22

### Changed — Clean Code Refactor Cycle (US-162 to US-170)

**Flutter app (`mobile/`)**

- Extracted shared `AuthInterceptor` + `DioProvider` (`lib/core/auth_interceptor.dart`, `lib/core/dio_provider.dart`) — removed duplicated `_authHeaders()` from 6 service files
- Extracted shared `OfflineBanner` widget to `lib/widgets/offline_banner.dart` — removed duplication between `DonateScreen` and `ProfileScreen`
- Decomposed `AdminParticipantsScreen` into `_FilterBar`, `_ParticipantsTable`, `_PaginationBar`, `_ErrorView`, `_CreateParticipantDialog` sub-widgets
- Decomposed `AdminHabitsScreen` into `_FilterBar`, `_DonationListView`, `_DonationTile`, `_ErrorView` sub-widgets
- Decomposed `QuestionnaireFormWidget` into 8 named sub-widget classes
- Split `ProfileScreen._init()` into `_init()` + `_initSurvey()` + focused helpers
- Fixed infinite-fetch loop in `ExploreScreen` annotate closure (catch block now sets `_fetchedLang`)
- Replaced all silent `catch(_) {}` blocks with `catch(e, st) { debugPrint(...) }` pattern
- `HabitDonation.donatedAt` changed to `DateTime?` (null-safe)
- `ProfileScreen` now uses `AppConfig.apiBaseUrl` (removed hardcoded production URL)

**Node.js backend (`app/`)**

- Extracted `app/utils/getDb.js` — removed 8 copy-pasted `getDb()` functions from route files
- Extracted `app/services/habitDonationService.js` — `POST /habits/donate` handler reduced from 143 to ~20 lines
- Split `translate()` into `fetchLibreTranslation()` + `refineLLMTranslation()` in `app/utils/translate.js`
- Extracted `app/services/keycloakAdminClient.js` — Keycloak admin API wrapper with 55s token TTL cache
- Extracted `app/middleware/roles.js` — `ROLES` constants + `isPrivileged()` helper
- `createAuthMiddleware` now composes `createTokenVerifier` — single JWKS cache (no duplication)
- Removed `console.log` debug statements from `app.js`, `donateRouter.js`; removed dead `/test-disclaimer` and `/submit-form` routes
- Replaced `uuid` npm package with `node:crypto.randomUUID` in `donateRouter.js` and `surveyRouter.js`

**Neo4j / data layer (`app/`)**

- Extracted `app/db/habitQueries.js` and `app/db/adminQueries.js` — moved all inline Cypher strings from routers and services
- Extracted `app/models/donation.js` — `Donor`, `Label`, `Donation`, `ExperimentalSetting` domain model classes (previously duplicated between `Neo4jDatabase.js` and `SparqlDatabase.js`)
- Extracted `app/utils/constants.js` — shared constants (RDF namespaces, group labels, etc.)
- `SparqlDatabase.js`: renamed `DbClient` → `SparqlDbClient` for naming consistency with `Neo4jDbClient`; fixed critical bug where `isClosedTaskClosedDescription` etc. were referenced without `()` (truthy function references)
- Fixed deprecated `exists()` call in `scripts/migrate-group-labels.cypher` (Step 2)

**CI / Scripts**

- Added reusable GitHub Actions composite actions: `.github/actions/setup-node-app/action.yml`, `.github/actions/setup-flutter/action.yml` — eliminated ~60 lines of duplicated setup steps across CI jobs
- `scripts/deploy-*.sh`: updated `docker-compose` → `docker compose` (Docker Compose v2 plugin CLI)
- `scripts/deploy-keycloak.sh`: replaced brittle `grep | cut` token extraction with `jq -r '.access_token'`
- `scripts/deploy-full.sh`: fixed health check — now polls Keycloak health endpoint (not backend) after Keycloak deploy
- `scripts/generate-spec.js`: removed dead 44-line `toYaml()` function; added `process.exit(1)` on error
- `scripts/restore.sh`: shebang updated to `#!/usr/bin/env bash`; timestamp format changed to UTC ISO 8601
- `.github/workflows/deploy.yml`: updated `actions/checkout@v6` → `@v4`

**Tests**

- Backend: 265 passing tests (up from 247 in v1.1.0)
- Flutter: `flutter analyze` zero issues; `flutter test` 49/49 passed

## [1.1.0] - 2026-03-21

### Added

**Habit donation pipeline (M1)**

- `POST /api/v1/habits/donate` — end-to-end habit donation: creates `Habit` node in Neo4j with BCIO context enrichment via API-service (`classify-context` + `map-bcio`); non-habits stored in MongoDB `habits` collection
- `GET /api/v1/habits` — returns all donated `Habit` nodes with `uuid`, `original`, `language`, `translationEN`, `translationDE`; `?lang=en|de` query parameter adds `displayText` convenience field

**Translation pipeline**

- Automatic English habit refinement: LibreTranslate EN draft → LLM tone refinement via `POST /api/v1/llm/refine-translation`; stored as `translationEN` on Habit node
- Automatic German habit refinement: LibreTranslate DE draft → LLM tone refinement via `POST /api/v1/llm/refine-translation-de`; stored as `translationDE` on Habit node
- `scripts/backfill-de-translations.js` — migration script to back-fill `translationDE` for all existing English Habit nodes (supports `--dry-run`)

**Python API-service (recommender)**

- `POST /api/v1/llm/classify-habit` — classifies a sentence as a habit or non-habit with confidence score
- `POST /api/v1/llm/classify-context` — extracts 7 BCIO context dimensions from a habit sentence
- `POST /api/v1/llm/map-bcio` — maps extracted context phrases to BCIO concepts via embedding similarity
- `POST /api/v1/llm/refine-translation` — refines a raw EN machine translation into natural English
- `POST /api/v1/llm/refine-translation-de` — refines a raw DE machine translation into natural German
- Redis LLM response caching (SHA-256 keyed, configurable TTL)
- `API-service/data/bcio.owl` — 32-concept BCIO stub OWL file for embedding-based concept mapping

**Questionnaire system**

- `GET /api/v1/questionnaires` and `GET /api/v1/questionnaires/:slug` — serve questionnaire definitions from MongoDB
- `POST /api/v1/questionnaire-responses` — store questionnaire answers (indexed on userId + slug + submitted_at)
- `GET /api/v1/questionnaire-responses/me` and `GET /api/v1/questionnaire-responses/me/:slug` — retrieve own responses
- Flutter `questionnaire_screen.dart` — step-by-step form for SLIQ, RAND-36 and custom questionnaires; all 4 question types (singleChoice, multiChoice, scale, text)

**User preferences**

- `GET /api/v1/users/me` and `PUT /api/v1/users/me` — read/write `preferredLanguage` ('en' or 'de') per user; stored in MongoDB `users` collection
- Flutter `user_settings_screen.dart` — Settings tab with Language dropdown; persists preference server-side
- Flutter `locale_provider.dart` — `StateNotifierProvider` driving `MaterialApp.router locale`; calls `PUT /api/v1/users/me` on change

**Recommendations**

- `GET /api/v1/recommendations/me` — retrieve personalised habit recommendations for the authenticated user
- `POST /api/v1/recommendations/:recommendation_id/feedback` — accept or dismiss a recommendation
- Flutter recommendation screen with rationale, citations, accept/dismiss actions, and local history cache

**Onboarding**

- `POST /api/v1/onboard` — unauthenticated endpoint; creates Keycloak user with random UUID username and 32-byte hex password; returns JWT pair (rate-limited to 5 req/hour per IP)
- Flutter passphrase screen — BIP39-style 36-word mnemonic encoding credentials; copy-to-clipboard and checkbox gate before Continue
- Flutter restore screen — enter passphrase to recover credentials on a new device

**Admin panel (Next.js)**

- `admin/` — Next.js 14 App Router admin panel at `/admin`
- Keycloak OIDC login (NextAuth v4, `hhh-admin` confidential client); middleware blocks non-admin/researcher users with `/access-denied` redirect
- Sidebar layout with Questionnaires and Settings pages
- `admin` service added to `docker-compose.yml` as `h3-admin` on port 3001

**Knowledge base**

- `GET|POST /api/v1/kb` — list and upload documents to the knowledge base (proxied to API-service); restricted to admin/researcher roles
- `POST /api/v1/kb/reindex` — trigger KB reindex
- `DELETE /api/v1/kb/:filename` — remove a KB document

**Security improvements**

- JWT audience (`KEYCLOAK_JWT_AUDIENCE`) and issuer (`KEYCLOAK_JWT_ISSUER`) validation added to `app/middleware/auth.js`
- IDOR fix on `GET /api/v1/recommend/:userId` — participants can now only access their own recommendations
- `internalRouter.js` routes now protected by `INTERNAL_API_SECRET` secret header check
- Rate limiter moved to run after authentication middleware (per-user limiting now works correctly)
- JWKS cache refresh: `app/middleware/auth.js` re-fetches keys on 401 JWK-not-found to handle key rotation
- Consistent error response shape `{ error: '...' }` across all v1 routes
- Consistent `console.error('[route] Error:', err)` logging in all catch blocks

**Tests**

- Backend: 247 passing tests (up from 186 in v1.0.0)
- Flutter: `flutter analyze` zero issues; `flutter test` passes (23 pre-existing `MaterialApp` widget-test failures from missing l10n delegates fixed progressively)

**Documentation**

- `docs/api/openapi.yaml` — 14 new paths documented (onboard, habits, questionnaires, questionnaire-responses, recommendations, users, KB)
- `docs/api/hhh-postman-collection.json` — 7 new request folders for all new endpoints
- `docs/data-model.md` — Neo4j schema for new `Habit`/`Context`/`BCIOConcept` labels; 6 new MongoDB collections documented
- `README.md` — backend npm scripts table and 18-variable env var reference added
- `docs/guides/admin-guide.md` and `admin-guide-de.md` — Section 9: Language Settings for Participants

### Changed

- Flutter `donate_screen.dart` — replaced hard-coded production API URL with `AppConfig.apiBaseUrl`
- Flutter `main.dart` — GoRouter auth guard added; unauthenticated users redirected from protected routes to `/onboarding/welcome`
- Flutter `goal_input_screen.dart` — replaced legacy `Navigator.push()` with `context.push()` (GoRouter)
- Flutter `pubspec.yaml` — pinned `flutter_appauth: 8.0.3` and `flutter_secure_storage: 9.2.4` to exact versions
- `.env.example` — updated with all env vars used across services, each with a one-line description

### Fixed

- Silent `catch (_) {}` blocks across `donate_screen.dart` and `locale_provider.dart` replaced with `debugPrint` error logging
- Null-safety: defensive `(json['field'] ?? '').toString()` in `Survey.fromJson`, `Recommendation.fromJson`, `RagCitation.fromJson`
- `surveyController.js` error shape standardised from `{ status: 'error', message }` to `{ error: 'Server error' }` consistent with all other v1 routes

## [1.0.0] - 2026-03-16

### Added

**Phase 0 – Branch consolidation**

- Merged all infrastructure branches (`feature/traeffic`, `feature/h3-proxy`, `feature/server`, `docker-env`, `max-base-path`, `max-deployment-optionen`) into a unified `rapid_dev` base
- Merged all feature branches (`feature/neo4j`, `feature/backup`, `feature/colorLaMarcel`, `contact-reward-language`, `feature/adminpanel`, `ralph/flutter-mobile-app`, `feature/hjt-diplomarbeit-habit-recommendation-system`, `feature/hjt-context-classifier`) into a single history

**Phase 1 – Keycloak identity provider**

- Self-hosted Keycloak 24 service in Docker Compose (dev and prod)
- `keycloak/hhh-realm.json` — reproducible realm definition with public PKCE client (`hhh-flutter`), confidential service-account client (`hhh-backend`), and roles `participant`, `admin`, `researcher`
- `app/middleware/auth.js` — JWKS-cached JWT verification middleware; attaches decoded token to `req.user`
- `app/middleware/requireRole.js` — role-gate middleware; returns 403 when required role is absent

**Phase 2 – Versioned API and recommender proxy**

- All routes namespaced under `/api/v1/` with auth and role guards applied uniformly
- `GET /api/v1/health` — unauthenticated health endpoint; parallel downstream checks (Neo4j, MongoDB, Fuseki, Keycloak, recommender) with 1 500 ms timeout and 503 on critical failure
- Python recommender service (`API-service/`) added to Docker Compose; proxied via Node.js routes `GET /api/v1/recommend/:userId`, `GET /api/v1/recommend/:userId/history`, `POST /api/v1/recommend/classify`

**Phase 3 – Ontology and Neo4j integrity**

- Fixed G3/G4 group indistinguishability: `hhh:Group3` ("Full+Free-text") and `hhh:Group4` ("Minimal+Free-text") given distinct URIs and labels in `fuseki/init/Ontology.ttl`
- Migration script `scripts/migrate-group-labels.cypher` for existing Neo4j data
- BCIO human-behavior ontology (119 classes from BCT Taxonomy v1) merged inline into `fuseki/init/Ontology.ttl`; uncertain HHH↔BCIO mappings annotated `rdfs:comment "TODO: domain-review"`
- APOC uniqueness constraints and automated ontology test suite (`scripts/test-ontology.sh`)

**Phase 4 – Flutter mobile/web application**

- Flutter 3.22 app (`mobile/`) targeting Android, iOS, and Chrome
- Keycloak PKCE login screen with QR-code token-card fallback
- Profile screen (POST `/api/v1/profile`)
- Habit donation screen with Neo4j graph explorer and annotation flow
- Recommendation screen with rationale, citation, accept/dismiss actions and local history cache

**Phase 5 – Study admin panel**

- Full-featured admin panel (Flutter + Node.js admin routes)
- Participant CRUD, group assignment (G1–G4), token-card PDF download
- Survey builder: create, publish, archive, assign to groups; response export (CSV)
- Participant progress dashboard: session log, recommendations log, habit donations count
- Device session revocation via Keycloak admin API
- Admin settings: configurable token-card format (QR size, include study-ID flag)

**Phase 6 – Test suite**

- 186 unit and integration tests (`app/tests/`)
- Flutter widget and golden tests (`mobile/test/`, 42 tests)
- End-to-end smoke tests (`scripts/e2e-smoke.sh`)
- Ontology validation tests (`scripts/test-ontology.sh`)
- Coverage reporting via `c8` (`npm run test:coverage`)

**Phase 7 – Deployment scripts**

- `scripts/deploy-backend.sh` — pull, `npm ci`, restart Node.js container, health-poll
- `scripts/deploy-flutter-web.sh` — `flutter build web`, copy to `app/public/flutter/`, restart
- `scripts/deploy-keycloak.sh` — rolling restart with realm re-import guard
- `scripts/deploy-recommender.sh` — rebuild Python image, rolling update
- `scripts/deploy-full.sh` — orchestrates all four scripts with health checks between steps; `--dry-run` mode; version-bump guard (this file)

**Phase 8 – Security, backup, and hardening**

- `backup-service/` extended: MongoDB (`mongodump`), Fuseki (tar), Neo4j (`neo4j-admin dump`), Keycloak realm export via admin API; cron daemon (02:00 UTC daily); 30-day retention; structured log
- `scripts/restore.sh` — interactive restore with confirmation prompt; restores all three databases and Keycloak realm
- `app/middleware/rateLimiter.js` — 100 req / 15 min per user; 429 JSON response
- `app/middleware/inputSanitizer.js` — recursive HTML-tag stripping for POST/PUT/PATCH bodies
- MongoDB `$jsonSchema` validators for key collections (`scripts/add-mongo-validators.js`)
- Soft-delete pattern enforced across all DELETE routes (`deletedAt` timestamp)

**Phase 9 – End-user documentation**

- `docs/guides/participant-guide.md` + PDF — 7-section guide (access, login, profile, habit donation, graph annotation, recommendations, update profile); Android/iOS/Chrome screenshot tables; German translation `participant-guide-de.md` + PDF
- `docs/guides/admin-guide.md` + PDF — 8-section guide (login, create participant, group assignment, survey config, habit monitoring, progress tracking, session revocation, settings); German translation `admin-guide-de.md` + PDF

**Phase 10 – Technical documentation**

- `docs/architecture.md` — system overview Mermaid diagram; per-service reference table; sequence diagrams for PKCE login, habit donation, recommendation request; ontology section with Cypher and SPARQL examples
- `docs/data-model.md` — Neo4j node/relationship reference with 10 annotated Cypher queries; Fuseki/SPARQL namespace table with 10 annotated queries; MongoDB collection schemas; G1–G4 encoding reference; anonymisation model

**Phase 11 – API reference and developer experience**

- `docs/api/openapi.yaml` — OpenAPI 3.1 spec (28 paths) generated from JSDoc annotations; Swagger UI at `GET /api/v1/docs`
- `docs/api/hhh-postman-collection.json` — Postman v2.1 collection with 28 requests, `{{baseUrl}}` / `{{token}}` variables
- `docs/runbook.md` — 11-section operations runbook (first-time setup, per-service updates, full-stack deploy, rollback, backup verification, restore, secret rotation, adding admin users, health checking, troubleshooting)
- `docs/guides/developer-onboarding.md` — zero-to-working-dev-environment guide (required tools, clone/branch, `stack.env` template, `docker-compose up`, Flutter in Chrome/Android, running all tests, common pitfalls, 8-point verify checklist)

### Changed

- Retired all EJS/HTML view templates from `app/views/`; all routes now return JSON (Flutter is the sole frontend)
- All controllers migrated from `res.render()` to `res.json()`
- Backup service retention extended from 14 days to 30 days

### Fixed

- G3/G4 ontology indistinguishability: groups 3 and 4 previously shared indistinct URIs, making study-group queries ambiguous; each group now has a unique URI and label in `Ontology.ttl`

[unreleased]: https://github.com/your-org/health-habit-hub/compare/v1.1.0...HEAD
[1.1.0]: https://github.com/your-org/health-habit-hub/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/your-org/health-habit-hub/releases/tag/v1.0.0
