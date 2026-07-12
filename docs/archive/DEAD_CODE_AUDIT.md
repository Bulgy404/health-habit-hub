> **Archived 2026-07-12.** Headline findings here are resolved (dead admin
> screens, dead test file, unused dependencies all removed — see git
> history). Remaining minor items and any new dead code are tracked in
> [`BUG_AUDIT.md`](../../BUG_AUDIT.md) instead. Kept here for historical
> context only.

# Dead Code & Improvement Audit

_Written 2026-07-10. Scope: `admin/`, `app/`, `mobile/`, `API-service/`, `backup-service/`, `knowledge-mcp/`, `scripts/`. Method: ESLint/`tsc`/`dart analyze`/`pyflakes` where available, plus manual import-graph analysis (grep every file's basename against every other file's import statements) and git-history checks for anything ambiguous. Every finding below was individually verified — grepped for actual usage, not just flagged by a heuristic and left there._

## Headline findings

### 1. The mobile app still ships ~4,760 lines of a dead in-app admin panel

`mobile/lib/screens/admin/` (8 files) plus `mobile/lib/screens/login_screen.dart` (the OAuth login screen that launched it) are **completely unreachable**: not registered in `lib/router/app_router.dart`, not referenced from any other file. `shell_screen_test.dart` even has a test literally named `'never shows an Admin tab (admin moved to web portal)'` — this is confirmation, not a guess: the in-app admin experience was superseded by the Next.js `admin/` web portal (the one this session spent 16 tickets improving), and the old screens were abandoned in place instead of deleted.

```
lib/screens/login_screen.dart               111 lines  — 0 references anywhere
lib/screens/admin/admin_shell_screen.dart      —        — 0 references anywhere
lib/screens/admin/admin_participants_screen.dart
lib/screens/admin/admin_participant_detail_screen.dart
lib/screens/admin/admin_devices_screen.dart
lib/screens/admin/admin_habits_screen.dart
lib/screens/admin/admin_comments_screen.dart
lib/screens/admin/admin_questionnaires_screen.dart
lib/screens/admin/admin_settings_screen.dart
lib/screens/admin/admin_surveys_screen.dart
                                           4,761 lines total, confirmed unreachable
```

**Action:** delete the whole `lib/screens/admin/` directory and `login_screen.dart`. This also frees up two now-fully-unused `pubspec.yaml` dependencies (see below).

### 2. A working "show intro once" feature exists but nothing calls it

`mobile/lib/features/my_habits/habit_onboarding_prefs.dart` defines `HabitOnboardingPrefs` — a small, well-documented, fully-implemented class (`hasSeenIntro()` / `markIntroSeen()`, backed by `SharedPreferences`) whose entire purpose, per its own doc comment, is to show the habit-creation educational explainer card **once per device, ever**.

Nothing calls it. The actual explainer card (`OnboardingExplainerCard` in `habit_onboarding_widgets.dart`, wired up in `new_habit_screen_1_behavior.dart:68`) is dismissed with plain `setState(() => _introDismissed = true)` — in-memory only. **Every time a user leaves and re-enters the habit-creation flow, the "what's a habit?" / "what's a cue?" educational cards show again**, even though the code to prevent that already exists and is sitting three files away.

This isn't cosmetic dead code — it's a small real UX regression from a feature that was apparently built but never wired to its intended call site.

**Action:** either wire `HabitOnboardingPrefs.hasSeenIntro()`/`markIntroSeen()` into `new_habit_screen_1_behavior.dart` (and `new_habit_screen_2_cue.dart`, which also renders the card) — a ~15-minute fix — or delete the class if per-session dismissal was an intentional later product decision. I can't tell which from the code alone.

### 3. Two more genuinely orphaned mobile files (smaller, no product implication)

- `lib/widgets/recommendation_card.dart` (public `RecommendationCard` class) — never instantiated. `features/recommendation/results_screen.dart` built its own private `_RecommendationCard` instead of using it.
- `lib/widgets/habit_heatmap_widget.dart` — never referenced; superseded by `contribution_graph_widget.dart`, which is the one actually used on the habits screen.
- `lib/services/recommendation_ws_service.dart` — never referenced. The backend does expose a matching WebSocket endpoint (`createRecommendationWsServer` in `app/app.js`), so this looks like a client integration that was built and then not wired up (or wired up and later reverted) rather than a naming coincidence — worth a quick check with whoever owns the recommendation feature before deleting, in case the WS integration is still wanted.

**Action:** delete `recommendation_card.dart` and `habit_heatmap_widget.dart` outright (clearly superseded). Confirm intent on `recommendation_ws_service.dart` before deleting — if the backend WS endpoint is meant to be used, this is a missing integration, not dead code.

---

## Per-service findings

### `admin/` (Next.js/TypeScript) — clean

Already worked on extensively this session (T1–T16). Re-verified fresh: `eslint` 1 pre-existing warning (unrelated `react-hooks/exhaustive-deps` in `studies/page.tsx:371`, not new), zero orphaned files, zero unused production dependencies.

- **Minor:** `src/lib/locale.ts` exports `isLocale` and `defaultLocale`, but both are only ever used inside `locale.ts` itself (by `resolveLocale`) — never imported elsewhere. Not wrong, just exported further than needed; could drop the `export` keyword on both, or leave as-is (harmless).

### `app/` (Node.js/Express backend) — small, real cleanup opportunities

`eslint .` — 0 problems. Import-graph check across `routes/`, `services/`, `controllers/`, `models/`, `middleware/` (108 files) — 0 orphaned files once dynamic `await import(...)` lazy-loads are accounted for (several model files are loaded that way for their `ensureIndexes()` startup hook; grepping only static `import ... from` initially produced false positives here, corrected by checking dynamic imports too).

1. **`test-libretranslate.js`** (repo root of `app/`) is a dead, broken debug script: it imports `node-fetch`, which isn't even in `package.json` anymore. Running it today throws `Cannot find module 'node-fetch'`. Not referenced by any npm script, test, or doc. **Delete it.**
2. **`ejs` is an unused dependency.** Zero `.ejs` files anywhere in the repo, zero `ejs.render`/`view engine` setup calls. (`@angelventura/eslint-plugin-ejs`, a *devDependency*, is unrelated — it's an ESLint plugin, not the templating engine, and is also arguably unused since there's nothing for it to lint, but lower priority.) **Remove `ejs` from `package.json` dependencies.**
3. **Duplicated collection-name string literals instead of the shared constant**, in 4 models: `habitComment.js`, `adminAuditLog.js`, `backupAuditLog.js`, `restoreConfirmationToken.js` all export a `COLLECTION` constant that's used internally for `ensureIndexes()` but never imported by the routers/services that actually read/write that collection — they hardcode `'habit_comments'`, `'admin_audit_log'`, `'backup_audit_log'` as string literals instead (confirmed in `routes/usersRouter.js`, `routes/adminRouter.js`, `middleware/auditAdminActions.js`, `routes/admin/backupsRouter.js`, plus several test files). Contrast with `study.js`'s `COLLECTION`, which *is* properly imported in 6 other files. If the collection name ever changes, someone has to remember every hardcoded copy. **Low urgency, but a real maintainability gap** — worth a follow-up pass importing the constant instead of the literal.
4. **Commented-out debug code**: `utils/localization.js` has 4 dead `//console.log(...)` lines (lines 27, 52, 57, 84). Delete them.
5. **Inconsistent logging**: the app uses a structured `pino` logger (`utils/logger.js`) almost everywhere, but `controllers/surveyController.js:47` and `app.js:31` use raw `console.log` instead. `surveyController.js`'s case is the more notable one — it logs a participant's `surveyId`/`userId` outside the app's structured logging pipeline (and whatever redaction/formatting that pipeline does). Minor, but worth aligning for consistency and to keep survey submissions inside the same log-review tooling as everything else.
6. **`public/js/nav.js`** ships two `console.log` debug statements to the browser (`'Changing Language to:'`, `'new URL:'`). Harmless but unpolished for a participant-facing surface — remove before it's noticed in a support ticket.

### `mobile/` (Flutter/Dart) — see headline findings above, plus:

- `dart analyze lib/ test/` — 0 issues.
- Two now-removable `pubspec.yaml` dependencies once the dead files above are deleted:
  - `web_socket_channel` — used *exclusively* by `recommendation_ws_service.dart`.
  - `cupertino_icons` — the default Flutter-template dependency; zero `CupertinoIcons.*` usage anywhere in `lib/`.
- No TODO/FIXME/`@deprecated` markers anywhere in `lib/`.

### `API-service/` (Python/FastAPI) — very clean, 3 small findings

`pyflakes` across all 42 project `.py` files (excluding `.venv`) — only 2 findings, both real:

1. `routers/extract_habits.py:9` — `Optional` imported from `typing`, never used.
2. `deps.py:23` — `global _mongo` declared in `lifespan()` but `_mongo` is never actually assigned in that function (it's set via a separate `_build_mongo_client()` call) — the `global` declaration is vestigial and slightly misleading about what the function does.
3. `requirements.txt` lists **`pypdf`** and **`python-dotenv`** — neither is imported anywhere in the source (`python-dotenv`'s `load_dotenv()` is never called). Both look safe to drop, but double-check nothing loads `.env` implicitly via a process manager before removing `python-dotenv`.

All 11 routers are registered in `main.py`; all 5 private `_helper.py` modules are imported by the routers that need them. No orphaned modules.

### `backup-service/`, `knowledge-mcp/` — clean

Both tiny (10 and 2 files respectively). No orphaned files, no unused dependencies, no TODOs, `pyflakes` clean on `knowledge-mcp/server.py`.

### `scripts/` — clean (false leads investigated and ruled out)

Four files initially looked unreferenced (`add-mongo-validators.js`, `migrate-questionnaire-locales.js`, `scripts/lib/questionnaireLocaleMigration.js`, `test-recommender.py`) because they're not wired into `Makefile`/CI/`package.json` — but all four are legitimate, documented, manually-invoked one-off/migration/smoke-test tools (referenced in `CHANGELOG.md` and their own docstrings), and `questionnaireLocaleMigration.js` has a real unit test (`app/tests/unit/questionnaireLocaleMigration.test.js`) covering it. Not dead code.

---

## Priority order

| # | Finding | Effort | Risk | Value |
|---|---|---|---|---|
| 1 | Delete `mobile/lib/screens/admin/*` + `login_screen.dart` | 10 min | none (confirmed unreachable) | removes 4,761 dead lines |
| 2 | Wire up (or remove) `HabitOnboardingPrefs` | 15 min | low | fixes a real repeat-shown-every-time UX bug |
| 3 | Delete `app/test-libretranslate.js` | 2 min | none (already broken) | removes a stale, non-functional script |
| 4 | Remove unused deps: `ejs` (app), `pypdf`+`python-dotenv` (API-service), `cupertino_icons`+`web_socket_channel` (mobile, after #1) | 15 min | none | smaller install footprint, less confusion for the next person reading `package.json`/`pubspec.yaml` |
| 5 | Delete `recommendation_card.dart`, `habit_heatmap_widget.dart`; confirm intent on `recommendation_ws_service.dart` | 10 min | low | ~300 more dead lines removed |
| 6 | Clean up `utils/localization.js` commented-out logs, `deps.py`'s vestigial `global _mongo`, unused `Optional` import | 10 min | none | polish |
| 7 | Align `surveyController.js`/`public/js/nav.js`/`app.js` logging with the rest of the app's `pino`-based logging | 20 min | low | consistency, not urgent |
| 8 | Import `COLLECTION` constants instead of re-hardcoding collection-name strings (4 models) | 20 min | low | maintainability, not urgent |

Items 1–5 total under an hour of work and remove roughly 5,000 lines of dead/broken code plus 4 unused dependencies, with zero functional risk since everything was individually confirmed unreachable or already broken. Items 6–8 are polish, worth doing but not urgent.
