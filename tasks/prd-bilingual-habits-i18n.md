# PRD: Bilingual Habit Storage & German/English App Localisation

## Introduction

Two tightly related features: (1) ensure every donated habit is stored in its
original language **and** in English, with translation that preserves the
donor's personal tone; (2) give the Flutter app full German/English localisation
that users can switch in their profile settings, persisted on the backend.

The translation infrastructure (LibreTranslate via the `h3-translate` Docker
container) already exists.  The gaps are tone preservation, the reverse
direction (English → German), language-aware API responses, and the Flutter i18n
layer that does not yet exist.

An audit of the full stack is appended as additional user stories (US-125 –
US-130).

---

## Goals

- Every habit in Neo4j has both an `original` value and an English translation,
  with the English version sounding natural and preserving the donor's phrasing
  style.
- Every habit also has a German translation, so German-speaking users see habits
  in their own language.
- The Flutter app exposes a language toggle (German / English) in user settings,
  persisted to the backend user profile.
- All Flutter UI strings are internationalised; no hardcoded English remains.
- The donation survey and the habit explore feed both respond to the user's
  saved language preference.

---

## User Stories

### US-114: Backend — tone-preserving English translation of non-English habits

**Description:** As a researcher, I want English translations of habits to read
naturally and preserve the donor's personal tone, not just be a literal
machine-translation output.

**Acceptance Criteria:**
- [ ] After LibreTranslate produces an English draft, a second step runs an LLM
  prompt (reuse existing LLM service if present, otherwise call the configured
  model) to refine tone while keeping meaning identical.
- [ ] The refined translation is stored as `hhh:translationEN` on the habit node
  (separate from the raw machine-translation field `hhh:value` of the
  translation Donation).
- [ ] If the LLM step fails or times out, the raw LibreTranslate output is used
  as fallback and a warning is logged.
- [ ] Unit test: mock LLM + LibreTranslate, assert `translationEN` is set and
  differs from a known bad literal translation.
- [ ] Typecheck/lint passes.

---

### US-115: Backend — German translation for English-donated habits

**Description:** As a German-speaking user, I want to see habits donated in
English displayed in German, so I can read the full catalogue in my language.

**Acceptance Criteria:**
- [ ] `insertDonateData` detects when `data.language` starts with `'en'` and
  calls `donation.translate('de', config)` to produce a German version.
- [ ] The German translation (tone-refined per US-114 approach) is stored as
  `hhh:translationDE` on the habit node.
- [ ] Existing non-English habits already translated to English: a one-time
  migration script (`scripts/backfill-de-translations.js`) reads all habits
  without `hhh:translationDE` and back-fills the field.
- [ ] Integration test: donate an English habit and assert both `hhh:value`
  (original EN) and `hhh:translationDE` exist in Neo4j.
- [ ] Typecheck/lint passes.

---

### US-116: Backend — habits API returns original + translations

**Description:** As a Flutter developer, I want the GET habits endpoint to
include both the original text and available translations so the app can display
the correct language without a second request.

**Acceptance Criteria:**
- [ ] `GET /api/v1/habits` response includes `original`, `translationEN`, and
  `translationDE` fields per habit (null if not available).
- [ ] An optional query parameter `?lang=en|de` filters which `displayText`
  field is pre-selected in the response (convenience alias for the client).
- [ ] Existing integration tests updated; new test covers `?lang=de` response.
- [ ] Typecheck/lint passes.

---

### US-117: Flutter — i18n scaffold (flutter_localizations + ARB files)

**Description:** As a developer, I need the Flutter project wired for
localisation so that all UI strings can be translated without touching widget
code.

**Acceptance Criteria:**
- [ ] `pubspec.yaml` adds `flutter_localizations` and `intl` dependencies.
- [ ] `l10n.yaml` created at `mobile/l10n.yaml` with `arb-dir: lib/l10n`,
  `template-arb-file: app_en.arb`, `output-localization-file: app_localizations.dart`.
- [ ] `mobile/lib/l10n/app_en.arb` and `mobile/lib/l10n/app_de.arb` created
  (initially with one placeholder key each to confirm the pipeline works).
- [ ] `MaterialApp` in `main.dart` sets `localizationsDelegates` and
  `supportedLocales` (`en`, `de`).
- [ ] `flutter gen-l10n` runs without errors.
- [ ] Typecheck/lint passes.

---

### US-118: Flutter — extract all hardcoded English UI strings

**Description:** As a developer, I want every user-visible string in the Flutter
app referenced via `AppLocalizations.of(context)` so that swapping language
requires only an ARB file change.

**Acceptance Criteria:**
- [ ] All hardcoded strings in the following files replaced with localisation
  keys:
  - `donate_screen.dart`
  - `explore_screen.dart`
  - `admin/admin_settings_screen.dart`
  - `profile_screen.dart` (any hardcoded labels)
  - Any shared widgets with user-visible text.
- [ ] `app_en.arb` contains every key with its English value.
- [ ] No `Text('...')` literal with a user-visible string remains in any of the
  above files.
- [ ] `flutter gen-l10n` and `flutter analyze` pass with no warnings.
- [ ] Verify in browser using dev-browser skill.

---

### US-119: Flutter — German translations (de.arb)

**Description:** As a German-speaking user, I want the app UI to appear fully in
German when the language is set to German.

**Acceptance Criteria:**
- [ ] `app_de.arb` provides a German value for every key present in `app_en.arb`.
- [ ] No key is missing (running `flutter gen-l10n` produces no warnings about
  missing translations).
- [ ] Spot-check: "Donate a Habit" → "Gewohnheit spenden", "Settings" →
  "Einstellungen", "Explore Habits" → "Gewohnheiten entdecken".
- [ ] Verify in browser using dev-browser skill (switch locale to `de` in
  device settings and confirm German strings appear).

---

### US-120: Backend — user `preferredLanguage` field + API endpoint

**Description:** As a Flutter app, I need to persist the user's chosen language
on the backend so the preference is consistent across devices.

**Acceptance Criteria:**
- [ ] User profile schema (MongoDB or Neo4j, wherever user preferences are
  stored) gains an optional `preferredLanguage` field accepting `'en'` or
  `'de'` (default `'en'`).
- [ ] `GET /api/v1/users/me` response includes `preferredLanguage`.
- [ ] `PUT /api/v1/users/me` accepts `{ preferredLanguage: 'en'|'de' }` and
  updates the field; returns 400 for unsupported values.
- [ ] Integration test covers GET and PUT.
- [ ] Typecheck/lint passes.

---

### US-121: Flutter — user settings screen with language toggle

**Description:** As a user, I want a settings screen where I can switch the app
language between German and English.

**Acceptance Criteria:**
- [ ] A "Settings" screen accessible from the main navigation contains a
  "Language" row with a dropdown/toggle showing "English" / "Deutsch".
- [ ] Selecting a language calls `PUT /api/v1/users/me` with the new
  `preferredLanguage`.
- [ ] A success snackbar confirms the change; a failure snackbar shows on API
  error.
- [ ] The screen is also accessible/linked from the user profile area.
- [ ] Typecheck/lint passes.
- [ ] Verify in browser using dev-browser skill.

---

### US-122: Flutter — apply language preference on startup

**Description:** As a user, I want my saved language preference applied
immediately when I open the app, without manually re-selecting it each session.

**Acceptance Criteria:**
- [ ] On startup, after auth, the app fetches `GET /api/v1/users/me` and reads
  `preferredLanguage`.
- [ ] The Flutter `locale` is set to the returned value before the main scaffold
  renders (no flash of the wrong language).
- [ ] If the API call fails, the app defaults to `'en'`.
- [ ] Language changes made in settings (US-121) take effect immediately without
  requiring a restart.
- [ ] Typecheck/lint passes.
- [ ] Verify in browser using dev-browser skill.

---

### US-123: Flutter — explore screen displays habits in user's language

**Description:** As a German-speaking user, I want habits in the explore feed to
appear in German so I can read and annotate them naturally.

**Acceptance Criteria:**
- [ ] `ExploreScreen` passes the current locale as `?lang=en|de` to
  `GET /api/v1/habits`.
- [ ] Habits are displayed using the `displayText` field returned by the API
  (which reflects the requested language).
- [ ] If a habit has no translation in the requested language, the original text
  is shown with a small "(original)" or language-flag indicator.
- [ ] Typecheck/lint passes.
- [ ] Verify in browser using dev-browser skill.

---

### US-124: Flutter — donation survey renders in user's language

**Description:** As a user, I want the habit donation survey to appear in my
chosen language so I can donate habits without switching mental context.

**Acceptance Criteria:**
- [ ] `DonateScreen` passes the current locale as a query parameter (e.g.
  `?lang=de`) when fetching `GET /api/v1/surveys/{id}/render`.
- [ ] The backend survey render endpoint reads the `lang` parameter and returns
  the survey JSON with labels in the requested language.
- [ ] Switching language in settings and reopening the donate screen loads the
  survey in the new language.
- [ ] Typecheck/lint passes.
- [ ] Verify in browser using dev-browser skill.

---

## Audit — Problems Found (US-125 – US-130)

The following issues were identified during a full-stack review and are each
tracked as independent user stories to fix.

---

### US-125: CI — fix Neo4j health-check in `backend-integration` job

**Description:** As a CI maintainer, I need the backend-integration job's Neo4j
service container to use a reliable health-check so integration tests don't run
against an unready database.

**Problem:** The `backend-integration` job still uses
`--health-cmd "cypher-shell -u neo4j -p password 'RETURN 1'"` inside the
`neo4j:5-community` container.  `cypher-shell` is not guaranteed on PATH in all
Neo4j 5 community images.  The same root cause was fixed for `ontology-test`
(switched to HTTP `wget`), but `backend-integration` was not updated.

**Acceptance Criteria:**
- [ ] `backend-integration` Neo4j service `--health-cmd` changed to
  `wget -q -O /dev/null http://localhost:7474 || exit 1`.
- [ ] CI passes for a push to a branch that exercises the integration job.
- [ ] No other jobs in `ci.yml` still use `cypher-shell` as a health-check.

---

### US-126: Backend — remove unused `deeplx` npm dependency

**Description:** As a developer, I want the dependency list to only contain
packages that are actually used so that `npm audit` results are accurate and
install times stay short.

**Problem:** `package.json` lists `"deeplx": "^0.1.2"` but no file in `app/`
imports it; the actual translation is done via LibreTranslate HTTP calls in
`Neo4jDatabase.js`.

**Acceptance Criteria:**
- [ ] `deeplx` removed from `app/package.json` and `app/package-lock.json`
  regenerated.
- [ ] `npm ci` and all existing tests pass.
- [ ] `grep -r 'deeplx' app/` returns no results.

---

### US-127: Backend — English habits never get a German translation stored

**Description:** As a German-speaking user, I want to see habits originally
donated in English in German, but the backend currently skips translation
entirely for English-origin habits.

**Problem:** `insertDonateData` only calls `donation.translate()` when
`mustTranslate = !language.startsWith('en')`, so English habits are inserted
with no German translation node and `hhh:translationDE` is never set.  This
blocks US-123 from working for the majority of habits (which are English).

**Acceptance Criteria:**
- [ ] Covered and resolved by US-115 (tracked separately to make the audit
  finding explicit).
- [ ] This story is closed when US-115 acceptance criteria are fully met.

---

### US-128: Backend — habits explore API has no language parameter

**Description:** As a developer, I need the habits API to accept a `?lang=`
parameter so the Flutter explore screen can request habits in the user's
language.

**Problem:** The current `GET /api/v1/habits` endpoint returns habit nodes
without any language selection logic; there is no `lang` query parameter and no
`displayText` field in the response.  This blocks US-123.

**Acceptance Criteria:**
- [ ] Covered and resolved by US-116 (tracked separately to make the audit
  finding explicit).
- [ ] This story is closed when US-116 acceptance criteria are fully met.

---

### US-129: Flutter — DonateScreen sends no language to survey render endpoint

**Description:** As a developer, I need the donation survey to be fetched with
the user's language so the form renders in the correct language.

**Problem:** `donate_screen.dart` calls
`surveyService.fetchSurvey('habit-donation')` with no locale argument.  The
backend `GET /api/v1/surveys/{id}/render` ignores language, defaulting to
whatever the backend's `messages_en.json` provides.  German users see an English
form.

**Acceptance Criteria:**
- [ ] Covered and resolved by US-124 (tracked separately to make the audit
  finding explicit).
- [ ] This story is closed when US-124 acceptance criteria are fully met.

---

### US-130: Flutter — admin settings screen strings not covered by i18n effort

**Description:** As an admin, I want the admin settings screen to respect the
app language so the UI is consistent regardless of which language is active.

**Problem:** `admin_settings_screen.dart` contains hardcoded English strings
("Settings", "Token Card Format", "QR only", "Print only", "Both", etc.) that
are not in the scope of the general string extraction in US-118 because they are
admin-only screens.  After US-118, user-facing screens will be localised but the
admin panel will remain English-only.

**Acceptance Criteria:**
- [ ] All user-visible strings in `admin_settings_screen.dart` (and any other
  file under `lib/screens/admin/`) added to `app_en.arb` and `app_de.arb`.
- [ ] Replaced with `AppLocalizations.of(context)` calls.
- [ ] `flutter gen-l10n` and `flutter analyze` pass.
- [ ] Verify in browser using dev-browser skill.

---

## Functional Requirements

- FR-1: Every habit node in Neo4j must have `hhh:translationEN` and
  `hhh:translationDE` populated after donation (or backfill).
- FR-2: English translations must pass through an LLM tone-refinement step;
  raw LibreTranslate output is not acceptable as the final stored value.
- FR-3: `GET /api/v1/habits?lang=en|de` returns `displayText` in the requested
  language.
- FR-4: User profile stores `preferredLanguage`; `GET /api/v1/users/me` and
  `PUT /api/v1/users/me` expose it.
- FR-5: Flutter app supports `Locale('en')` and `Locale('de')` via
  `flutter_localizations`; no hardcoded user-visible strings remain.
- FR-6: Language preference is loaded from the backend at startup and applied
  before first render.
- FR-7: Donation survey is fetched with a `lang` parameter matching the user's
  active locale.
- FR-8: All CI service health-checks use the HTTP API, not `cypher-shell`.

---

## Non-Goals

- Japanese localisation (already supported on backend but not in scope for
  Flutter i18n in this iteration).
- Real-time language switching mid-survey (switching language while the donation
  form is open is not supported; the new language takes effect on next open).
- Manual translation review workflow (all translations are automated).
- Localisation of habit category names or BCIO ontology labels.

---

## Technical Considerations

- Translation service: LibreTranslate 1.5 (`h3-translate` container), already
  loads `de`, `en`, `ja`.  No infrastructure changes needed.
- LLM tone refinement: reuse the existing LLM service/route already present in
  the backend (US-091–US-100 area); call it as a post-processing step with a
  prompt such as *"Rewrite the following English translation to sound natural and
  preserve the original author's personal tone: …"*.
- Flutter l10n codegen: `flutter gen-l10n` must be added to the CI
  `flutter-analyze` and `flutter-test` jobs so generated files are always
  up-to-date.
- The `lang` query parameter on the habits endpoint must be validated
  server-side (whitelist `en`, `de`; default `en`).

---

## Success Metrics

- 100 % of habits in Neo4j have both `hhh:translationEN` and `hhh:translationDE`
  populated after migration script runs.
- Zero hardcoded user-visible English strings remain in Flutter after US-118 +
  US-130.
- CI green on `ralph/hhh-platform-unified` after all stories in this PRD land.
- A German-locale user can complete the full flow (open app → donate habit →
  explore habits) entirely in German.

---

## Open Questions

- Which LLM endpoint/model should be used for tone refinement? (Reuse whatever
  was set up for US-091–US-100, or configure separately via env var?)
- Should the backfill migration script (US-115) run automatically on container
  start, or be triggered manually by an admin?
- Is `rapid_dev` still an active branch that CI should protect, or can it be
  removed from the PR trigger list?
