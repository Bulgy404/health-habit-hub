# Flutter App — Clean Code Review

**Scope:** All files under `mobile/lib/`
**Total files reviewed:** 56 Dart files
**Critical:** 3 | **Major:** 11 | **Minor:** 14

---

## What Follows Clean Code Well

1. **Excellent Router Architecture** (`main.dart` lines 41–241) — Well-structured GoRouter with clear redirect guards, role-based admin access control, and clean nested route definitions.
2. **Good Provider Usage** — Proper Riverpod adoption: family providers for parameterised state, good service/provider separation.
3. **Clean Model Structure** — Models are simple data classes with clear `fromJson` factories, immutable where appropriate, good use of nullability.
4. **Exception Hierarchy** (`lib/core/exceptions.dart`) — Well-defined `AppException` sealed class with specific subtypes for different failure modes.
5. **WebSocket Fallback Pattern** (`recommendation_ws_service.dart`) — Intelligent polling fallback, connection-status tracking, deduplication logic.
6. **Proper Resource Cleanup** — `AnimationController`, `Timer`, and `StreamSubscription` all disposed correctly in `dispose()` methods.
7. **Good Widget Composition** — Screens decompose into small sub-widgets; bottom sheets and dialogs are factored out where done.

---

## Critical Findings

### C-1 · Hardcoded Production API URL in ProfileScreen
- **File:** `lib/screens/profile_screen.dart:28`
- **Violation:** Configuration Management
- **Description:** `static const _baseUrl = 'https://api.hhh.tu-dresden.de/api/v1';` is hardcoded instead of using `AppConfig.apiBaseUrl`. Any test or staging deploy hits production data silently.
- **Suggested Fix:** Replace with `AppConfig.apiBaseUrl` (already imported via other service files in the same directory).

### C-2 · God Widget — AdminParticipantsScreen
- **File:** `lib/screens/admin/admin_participants_screen.dart:18–661`
- **Violation:** Single Responsibility Principle / God Widget
- **Description:** 661-line `ConsumerStatefulWidget` manages participant listing, search, pagination, group assignment, participant creation dialog, deletion confirmation, DataTable rendering, and 8+ mutable state variables simultaneously.
- **Suggested Fix:**
  - Extract pagination into a `PaginationNotifier` Riverpod notifier.
  - Extract filtering/search into a `ParticipantFilterNotifier`.
  - Move dialog UI into separate `_CreateParticipantDialog` and `_DeleteConfirmDialog` widget classes.

### C-3 · God Widget — AdminHabitsScreen
- **File:** `lib/screens/admin/admin_habits_screen.dart:25–500`
- **Violation:** Single Responsibility Principle / God Widget
- **Description:** Single `ConsumerStatefulWidget` handles live data fetching with auto-refresh timer, 6 filter-state variables, CSV export, date-range picker, and filter UI rendering.
- **Suggested Fix:**
  - Extract filter state into `AdminHabitsFilterNotifier`.
  - Create `HabitsFeedManager` service for auto-refresh.
  - Move date formatting into a utility function or extension.

---

## Major Findings

### M-1 · Long Method — ProfileScreen._init()
- **File:** `lib/screens/profile_screen.dart:62–103` (42 lines)
- **Violation:** Long Method
- **Description:** `_init()` fetches profile, manages state, initialises survey, and handles errors all in one function.
- **Suggested Fix:** Extract `_checkSurveyCompletion()` and `_initSurveyController()` as separate private methods.

### M-2 · Long Method — DonateScreen._initSurvey()
- **File:** `lib/screens/donate_screen.dart:41–92` (52 lines)
- **Violation:** Long Method
- **Description:** Combines service instantiation, token fetching, WebView controller setup, JS channel configuration, and navigation URI building.
- **Suggested Fix:** Split into `_buildWebController()`, `_getAuthHeaders()`, `_buildSurveyUri()`.

### M-3 · Deep Nesting — QuestionnaireFormWidget.build()
- **File:** `lib/features/questionnaire/questionnaire_form_widget.dart:46–87`
- **Violation:** Deep Nesting (4+ levels)
- **Description:** `Column → Expanded → SingleChildScrollView → _buildQuestion → switch` reaches 5 levels, making the structure hard to follow.
- **Suggested Fix:** Extract question rendering into a dedicated `_QuestionnaireContent` widget.

### M-4 · Deep Nesting — ExploreScreen._showNodeDetail()
- **File:** `lib/screens/explore_screen.dart:78–227` (118 lines in one method)
- **Violation:** Deep Nesting (5+ levels)
- **Description:** Bottom sheet builder contains deeply nested `Column`/`Row` widgets with multiple conditional branches, all in a single 118-line method.
- **Suggested Fix:** Extract into a dedicated `_HabitNodeDetailSheet` widget class.

### M-5 · Long Method — AdminSurveyEditorScreen._save()
- **File:** `lib/screens/admin/admin_surveys_screen.dart:453–484`
- **Violation:** Long Method / Mixed Concerns
- **Description:** JSON validation, two sequential API calls, state updates, and SnackBar messages all in one function.
- **Suggested Fix:** Extract `_validateJson()` helper; move API orchestration into a service method.

### M-6 · DRY Violation — _OfflineBanner duplicated
- **Files:**
  - `lib/screens/donate_screen.dart:166–216`
  - `lib/screens/profile_screen.dart:411–461`
- **Violation:** Code Duplication
- **Description:** Identical or near-identical `_OfflineBanner` private widget appears in two separate screen files.
- **Suggested Fix:** Move to `lib/widgets/offline_banner.dart` as a shared, reusable widget.

### M-7 · DRY Violation — _authHeaders() repeated in 6 services
- **Files:** `lib/services/habit_service.dart:21–25`, `survey_service.dart:23–27`, `recommendation_service.dart:21–25`, `admin_service.dart:22–27`, `questionnaire_service.dart:19–23`, `auth_service.dart`
- **Violation:** Code Duplication
- **Description:** The pattern `Future<Map<String,String>> _authHeaders()` with identical token-fetching logic is copy-pasted across all service files.
- **Suggested Fix:** Create a `AuthHeaders` utility class or mixin:
  ```dart
  mixin AuthHeadersMixin {
    Future<Map<String, String>> buildAuthHeaders(AuthService auth) async {
      final token = await auth.getAccessToken();
      if (token == null) return {};
      return {'Authorization': 'Bearer $token'};
    }
  }
  ```

### M-8 · God Service — AdminService
- **File:** `lib/services/admin_service.dart:14–256`
- **Violation:** Single Responsibility Principle
- **Description:** 16 public methods across 6 distinct domains: participants, sessions, surveys, habit feed, settings, and export.
- **Suggested Fix:** Split into `AdminParticipantService`, `AdminSessionService`, `AdminSurveyService`, `AdminHabitFeedService`, `AdminSettingsService`.

### M-9 · Silent error catches — missing logging
- **Files:**
  - `lib/screens/explore_screen.dart:109` — `catch (_) {}`
  - `lib/screens/recommend_screen.dart:157, 165` — `catch (_) {}`
  - `lib/screens/admin/admin_habits_screen.dart:116` — `catch (_) {}`
- **Violation:** Poor Error Handling
- **Description:** `catch (_)` blocks discard exceptions silently, creating a debugging blackout in production.
- **Suggested Fix:**
  ```dart
  catch (e, st) {
    debugPrint('ERROR in ...: $e\n$st');
  }
  ```

### M-10 · Inconsistent hardcoded strings not in ARB
- **Files:**
  - `lib/screens/stats_screen.dart:95` — `'Habits by Category'`
  - `lib/screens/stats_screen.dart:105` — `'Annotations per Day (last 30 days)'`
  - `lib/screens/donate_screen.dart:53` — `'e.g. I want to sleep better…'`
  - `lib/screens/admin/admin_surveys_screen.dart:282` — `'…'`
- **Violation:** Localization / Hardcoding
- **Description:** Scattered user-visible strings are hardcoded instead of going through `AppLocalizations`.
- **Suggested Fix:** Add the strings to `app_en.arb` / `app_de.arb` and regenerate via `flutter gen-l10n`.

### M-11 · Inconsistent Null Safety — DateTime fallback to DateTime(0)
- **File:** `lib/models/admin_habit_donation.dart:18–20`
- **Violation:** Code Quality / Null Safety
- **Description:** `DateTime.tryParse(...) ?? DateTime(0)` uses epoch as a sentinel value instead of propagating `null`, hiding parse failures.
- **Suggested Fix:** Change `donatedAt` to `DateTime?` and propagate `null` explicitly.

---

## Minor Findings

### N-1 · Magic Numbers — HabitGraphWidget physics constants undocumented
- **File:** `lib/widgets/habit_graph_widget.dart:90–95`
- **Violation:** Magic Numbers
- **Description:** `_kRep = 4000.0`, `_kSpring = 0.04`, `_kDamp = 0.88` etc. have no documentation explaining their role in the simulation.
- **Suggested Fix:** Add `///` doc comments above each constant explaining what the value controls.

### N-2 · Potentially unused import in profile_screen.dart
- **File:** `lib/screens/profile_screen.dart:1`
- **Violation:** Dead Code
- **Description:** `dart:convert` is imported; confirm all usages are necessary after refactoring.
- **Suggested Fix:** Run `flutter analyze` and remove any flagged unused imports.

### N-3 · Complex boolean state flags in ProfileScreen
- **File:** `lib/screens/profile_screen.dart:26–48`
- **Violation:** State Complexity
- **Description:** 7 separate boolean/nullable state fields track screen state; combinatorial state transitions are hard to reason about.
- **Suggested Fix:** Replace with a sealed `ProfileState` class or enum covering `loading`, `offline`, `ready`, `editing`, `submitting`.

### N-4 · Potential memory leak — timer recreation in AdminHabitsScreen
- **File:** `lib/screens/admin/admin_habits_screen.dart:76–84`
- **Violation:** Resource Management
- **Description:** `_startTimer()` cancels the old timer and creates a new one; if an exception occurs between cancel and create, the previous periodic timer could linger.
- **Suggested Fix:** Assign new timer before cancelling old one, or use a single managed `StreamController`.

### N-5 · Inconsistent error UI across screens
- **Files:** Multiple screens
- **Violation:** UI Consistency
- **Description:** Error states render differently: some use red icons, some centred text, some include retry buttons, some do not.
- **Suggested Fix:** Create a shared `ErrorStateView` widget with optional `onRetry` callback.

### N-6 · Services create their own Dio instances — no shared configuration
- **Files:** All service files
- **Violation:** Configuration Management / Testability
- **Description:** Each service calls `Dio()` with default config. Timeout, interceptors, and base options are not shared.
- **Suggested Fix:** Create a `dioProvider` Riverpod provider that all services receive, enabling consistent config and simpler mocking in tests.

### N-7 · Inconsistent naming — `_isoDate()` vs `_dateRangeLabel()`
- **Files:** Multiple admin screens
- **Violation:** Naming Consistency
- **Description:** Some private helpers follow verb-noun (`_buildFilterBar`) while others follow `_nounForm` conventions.
- **Suggested Fix:** Standardise on verb-noun for method names throughout.

### N-8 · Undocumented magic number — WebSocket auth timeout
- **File:** `lib/services/recommendation_ws_service.dart:22–28`
- **Violation:** Magic Number / Documentation
- **Description:** Class docs mention "server expects JWT within 5 s" but the 5-second deadline has no matching constant in code.
- **Suggested Fix:** Add `static const _authTimeoutSeconds = 5;` and reference it in the relevant timeout call.

### N-9–N-14 · (Remaining minor) Miscellaneous
- `admin_participants_screen.dart:255–259` — DataTable row index used without bounds guard in `onSelectChanged`.
- `recommend_screen.dart:157,165` — Empty catch `{}` (no-op, see M-9 for logging fix, these additionally have no fallback UI).
- Mixed ARB key usage in admin screens — some use `AppLocalizations`, others use hardcoded English.
- `AdminSurveyEditorScreen` JSON editor allows invalid JSON to be submitted until `_save()` is triggered; consider inline validation on text change.
- `HabitGraphWidget` has no unit tests; physics simulation is untestable without integration harness.
- `AdminService` injected into `admin_participants_screen` as a single object; splitting per M-8 also improves test isolation.

---

## Prioritised Fix Order

| Priority | Finding | Risk | Impact |
|----------|---------|------|--------|
| 1 | C-1 — Hardcoded URL in ProfileScreen | Low | High — prevents staging/dev testing |
| 2 | M-6 — Deduplicate `_OfflineBanner` | Low | Medium — prevents future drift |
| 3 | M-7 — Deduplicate `_authHeaders()` | Low | High — 6-file DRY violation |
| 4 | M-9 — Log silent catches | Low | High — production debuggability |
| 5 | C-2 — Decompose AdminParticipantsScreen | Medium | High — SRP, testability |
| 6 | C-3 — Decompose AdminHabitsScreen | Medium | High — SRP, testability |
| 7 | M-8 — Split AdminService | Medium | High — cohesion |
| 8 | M-10 — ARB strings | Low | Medium — i18n completeness |
| 9 | M-11 — DateTime? null propagation | Low | Low-Medium — data correctness |
| 10 | N-3 — ProfileScreen state machine | Medium | Medium — readability |
