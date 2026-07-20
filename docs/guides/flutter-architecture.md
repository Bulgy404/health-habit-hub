# Flutter App Architecture

This document describes the architecture of the Health Habit Hub Flutter mobile application, located in `mobile/`.

---

## Table of Contents

1. [Overview](#1-overview)
2. [Folder Structure](#2-folder-structure)
3. [Routing](#3-routing)
4. [State Management](#4-state-management)
5. [Localisation Pipeline](#5-localisation-pipeline)
6. [Auth Token Management](#6-auth-token-management)
7. [Configuration and Environment Variables](#7-configuration-and-environment-variables)
8. [Services Layer](#8-services-layer)
9. [My Habits Feature](#9-my-habits-feature)
10. [Donation Flow (WebView)](#10-donation-flow-webview)
11. [Testing](#11-testing)

---

## 1. Overview

The HHH Flutter app targets **Android**, **iOS**, and **Web**. It is written in Dart 3 / Flutter 3.22+. State management uses **Riverpod**, navigation uses **GoRouter**, and network calls use **Dio**.

```
Keycloak (OIDC)
     │  PKCE auth code flow
     ▼
Flutter App ──────► Node.js Backend API (Express)
     │                       │
     │  WebView (SurveyJS)   ├── Neo4j (habits graph + BCIO ontology)
     │                       └── MongoDB (survey responses)
     └──────────────────────► Recommender (FastAPI / Python)
```

---

## 2. Folder Structure

```
mobile/
├── lib/
│   ├── main.dart                    # App entry point; GoRouter + ProviderScope
│   ├── config/
│   │   └── app_config.dart          # Compile-time env vars (--dart-define)
│   ├── core/
│   │   ├── exceptions.dart          # Sealed AppException hierarchy
│   │   ├── auth_interceptor.dart    # Dio interceptor: auto-attaches Bearer token
│   │   └── dio_provider.dart        # Riverpod Provider<Dio> with auth interceptor wired in
│   ├── features/                    # Self-contained feature modules
│   │   ├── questionnaire/           # Questionnaire form + state + service
│   │   ├── recommendation/          # Goal input, loading, results screens
│   │   └── my_habits/               # Habit tracking: intentions, SRHI check-ins, heatmap (DFG study + public)
│   ├── l10n/                        # Localisation (ARB files + generated code)
│   │   ├── app_en.arb               # English strings (source of truth)
│   │   ├── app_de.arb               # German strings
│   │   ├── app_fr.arb               # French strings
│   │   ├── app_ja.arb               # Japanese strings
│   │   ├── app_nl.arb               # Dutch strings
│   │   ├── app_localizations.dart   # Generated — do NOT edit manually
│   │   ├── app_localizations_en.dart
│   │   ├── app_localizations_de.dart
│   │   ├── app_localizations_fr.dart
│   │   ├── app_localizations_ja.dart
│   │   └── app_localizations_nl.dart
│   ├── models/                      # Plain Dart data classes (JSON serialisation)
│   ├── providers/                   # Riverpod providers (auth, locale, theme)
│   ├── screens/                     # Top-level screens registered in GoRouter
│   │   ├── admin/                   # Admin panel screens (role-guarded)
│   │   └── onboarding/              # Welcome, passphrase, restore screens
│   ├── services/                    # Network service classes (Dio-based)
│   ├── utils/
│   │   └── bip39_wordlist.dart      # BIP-39 word list (used by passphrase_screen)
│   └── widgets/
│       ├── offline_banner.dart      # Shared OfflineBanner widget (used by DonateScreen, ProfileScreen)
│       ├── day_strip_widget.dart    # DayStripWidget — 7-day enacted row with DayCell
│       ├── habit_heatmap_widget.dart # HabitHeatmapWidget — GitHub-style calendar grid with HeatmapCell
│       └── srhi_sparkline_widget.dart # SrhiSparklineWidget — fl_chart mini LineChart for SRHI trajectory
├── test/
│   ├── widget/                      # Widget tests
│   └── unit/                        # Unit tests
├── integration_test/                # Flutter integration tests
├── assets/
│   └── icon/app_icon.png            # Source icon (1024×1024)
├── l10n.yaml                        # flutter gen-l10n configuration
└── pubspec.yaml
```

### Feature module convention

Code for a self-contained feature lives under `features/<feature>/`. Each feature module contains:

- `*_screen.dart` — UI screens
- `*_provider.dart` — Riverpod providers/notifiers for local feature state
- `*_service.dart` — network calls specific to this feature
- `*_models.dart` — data classes used only within the feature

Shared models, services, and providers that are used across multiple features live in the top-level `models/`, `services/`, and `providers/` directories respectively.

---

## 3. Routing

Navigation uses **GoRouter** configured in `main.dart` via a `RouterNotifier`/`ref.watch` pattern so the router automatically rebuilds when auth state changes.

### Route map

| Path                                    | Screen                            | Notes                                                                                                                                                                                                                                                                               |
| --------------------------------------- | --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/login`                                | `LoginScreen`                     | Keycloak login entry point                                                                                                                                                                                                                                                          |
| `/onboarding/welcome`                   | `WelcomeScreen`                   | First-run onboarding                                                                                                                                                                                                                                                                |
| `/onboarding/passphrase`                | `PassphraseScreen`                | BIP-39 backup passphrase                                                                                                                                                                                                                                                            |
| `/onboarding/restore`                   | `RestoreScreen`                   | Restore account from passphrase                                                                                                                                                                                                                                                     |
| `/share`                                | `ShareHabitScreen`                | Tab root: landing hero + why-share card ("Read more" → `/about-project`) when idle, native habit-share form (posts to `/api/v1/habits/share`) once started. Shared-today state shows a prominent "Share another habit" CTA rather than blocking further sharing                     |
| `/donate`                               | —                                 | Redirects to `/share` (legacy alias)                                                                                                                                                                                                                                                |
| `/about-project`                        | `ProjectInfoScreen`               | "About HabConnect" info page: how shared habits are used, what cues are, the recommender pipeline (with a small step-diagram), adaptive reminders, SRHI — links out to the project's GitHub repo                                                                                    |
| `/explore`                              | `ExploreScreen`                   | Browse donated habits                                                                                                                                                                                                                                                               |
| `/recommend`                            | `GoalInputScreen`                 | Enter a health goal                                                                                                                                                                                                                                                                 |
| `/recommend/loading`                    | `LoadingScreen`                   | Waits for recommendation result                                                                                                                                                                                                                                                     |
| `/settings`                             | `UserSettingsScreen`              | Language selector                                                                                                                                                                                                                                                                   |
| `/settings/profile`                     | `ProfileScreen`                   | Profile fields, health questionnaires links, and the **Study membership** section (current study/group, "Join a different study" code dialog, "Leave study" — both round-trip through `/onboarding/switch-study` / `/onboarding/leave-study` without touching already-donated data) |
| `/questionnaire/:slug`                  | `QuestionnaireScreen`             | Generic questionnaire by slug                                                                                                                                                                                                                                                       |
| `/questionnaire/:slug/confirmation`     | `QuestionnaireConfirmationScreen` | Post-submit confirmation                                                                                                                                                                                                                                                            |
| `/admin/*`                              | `AdminShellScreen` + sub-routes   | Admin panel (role-guarded)                                                                                                                                                                                                                                                          |
| `/habits`                               | `MyHabitsScreen`                  | Tab root: GitHub-style `ContributionGraphWidget` (aggregate across all habits, shown even with none) + SRHI prompt card + habit card list                                                                                                                                           |
| `/habits/new/behavior`                  | `NewHabitScreen1Behavior`         | Pick behavior from `habitConfig.behaviorOptions`                                                                                                                                                                                                                                    |
| `/habits/new/cue`                       | `NewHabitScreen2Cue`              | Select pre-rated or free-text cue                                                                                                                                                                                                                                                   |
| `/habits/new/confirm`                   | `NewHabitScreen3Confirm`          | Confirm if-then statement, pick duration, submit                                                                                                                                                                                                                                    |
| `/habits/:intentionId`                  | `HabitDetailScreen`               | Per-habit `ContributionGraphWidget` activity log + SRHI score/next-due-date card with a dismissible "What's SRHI?" explanation + SRHI trajectory sparkline + abandon action                                                                                                         |
| `/habits/:intentionId/srhi/:weekNumber` | `SrhiFormScreen`                  | 12-item 1–7 slider SRHI check-in form                                                                                                                                                                                                                                               |

### Auth guard

The GoRouter `redirect` callback runs before every navigation:

1. If the user is **not logged in** and the target route is protected (`/share`, `/donate`, `/explore`, `/recommend`, `/settings`, `/questionnaire`), redirect to `/onboarding/welcome`.
2. If the user **is logged in** and navigates to `/onboarding/welcome`, redirect to `/share` (the main screen).
3. If the participant's study disables the recommender, navigating to `/recommend` redirects to `/habits` (defence-in-depth — the tab is also hidden in `ShellScreen`).

The auth check runs on `isLoggedInProvider` (a `FutureProvider<bool>` that calls `AuthService.isLoggedIn()`).

---

## 4. State Management

The app uses **Riverpod** (`flutter_riverpod`). All providers are declared at module level (not inside widgets) for testability.

### Provider types in use

| Riverpod type             | Used for                                                         |
| ------------------------- | ---------------------------------------------------------------- |
| `Provider`                | Singleton services (e.g. `surveyServiceProvider`)                |
| `FutureProvider`          | One-shot async reads (e.g. `isLoggedInProvider`)                 |
| `FutureProvider.family`   | Parameterised async reads (e.g. `questionnaireProvider(slug)`)   |
| `NotifierProvider`        | Mutable local state (e.g. `localeProvider`, `themeModeProvider`) |
| `NotifierProvider.family` | Per-slug questionnaire answer state                              |

### Key providers

| Provider                          | File                                                 | Description                                                                                                                                                                                                                                                                                                                                              |
| --------------------------------- | ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `authServiceProvider`             | `providers/auth_provider.dart`                       | Exposes `AuthService` singleton                                                                                                                                                                                                                                                                                                                          |
| `isLoggedInProvider`              | `providers/auth_provider.dart`                       | `FutureProvider<bool>` — used by router                                                                                                                                                                                                                                                                                                                  |
| `localeProvider`                  | `providers/locale_provider.dart`                     | Current app locale; persists via PUT /users/me                                                                                                                                                                                                                                                                                                           |
| `themeModeProvider`               | `providers/theme_provider.dart`                      | Light/dark theme toggle                                                                                                                                                                                                                                                                                                                                  |
| `surveyServiceProvider`           | `services/survey_service.dart`                       | Survey fetch + submit                                                                                                                                                                                                                                                                                                                                    |
| `questionnaireFormProvider(slug)` | `features/questionnaire/questionnaire_provider.dart` | Per-slug form state (current page, answers)                                                                                                                                                                                                                                                                                                              |
| `habitConfigProvider`             | `features/my_habits/my_habits_provider.dart`         | `FutureProvider<HabitConfig>` — assigned cues, SRHI items, behavior options, maxHabits                                                                                                                                                                                                                                                                   |
| `intentionsProvider`              | `features/my_habits/my_habits_provider.dart`         | `FutureProvider<List<Intention>>` — user's active intentions                                                                                                                                                                                                                                                                                             |
| `dueSrhiProvider`                 | `features/my_habits/my_habits_provider.dart`         | `FutureProvider<List<SrhiWindow>>` — pending SRHI check-in windows                                                                                                                                                                                                                                                                                       |
| `intentionLogsProvider(id)`       | `features/my_habits/my_habits_provider.dart`         | `FutureProvider.family` — daily logs for a given intention                                                                                                                                                                                                                                                                                               |
| `srhiTrajectoryProvider(id)`      | `features/my_habits/my_habits_provider.dart`         | `FutureProvider.family` — SRHI score history for a given intention (each point now also carries `scheduledFor`, used to compute the next-due date shown on the habit detail screen)                                                                                                                                                                      |
| `allHabitsActivityProvider`       | `features/my_habits/my_habits_provider.dart`         | `FutureProvider<Map<DateTime, int>>` — enactment counts across every active intention, feeding the aggregate `ContributionGraphWidget` on `/habits`                                                                                                                                                                                                      |
| `dueQuestionnaireProvider`        | `screens/shell_screen.dart`                          | `Provider<Future<String? > Function()>` — fetches the slug of a currently-due questionnaire (or `null`) for the post-startup in-app reminder snackbar; a plain function-returning provider (not `FutureProvider`) so `ShellScreen` can call it on demand from `initState` and so tests can override it with a stub instead of making a real network call |

### Locale provider

`localeProvider` is a `NotifierProvider<LocaleNotifier, Locale>`. Calling `ref.read(localeProvider.notifier).setLocale(Locale('de'))`:

1. Updates the in-memory `Locale` (triggers app rebuild via `Consumer`).
2. Calls `PUT /api/v1/users/me` with `{"preferredLanguage": "de"}` to persist the preference to the backend.
3. Returns `true` on success, `false` on network failure (the UI shows a snackbar accordingly).

---

## 5. Localisation Pipeline

The app is localised into **English** (default), **German**, **French**, **Japanese**, and **Dutch** using Flutter's built-in `flutter_localizations` + code generation.

### Configuration

`mobile/l10n.yaml`:

```yaml
arb-dir: lib/l10n
template-arb-file: app_en.arb
output-localization-file: app_localizations.dart
output-dir: lib/l10n
```

### Workflow

1. **Add or edit a string** — edit `lib/l10n/app_en.arb` (English, the template) and the same key in each of `app_de.arb`, `app_fr.arb`, `app_ja.arb`, `app_nl.arb`.

   ```json
   // app_en.arb
   {
     "settingsSaved": "Settings saved",
     "@settingsSaved": {
       "description": "Snackbar shown after settings are saved"
     }
   }
   ```

2. **Regenerate** — from inside `mobile/`:

   ```bash
   flutter gen-l10n
   ```

   This writes `lib/l10n/app_localizations.dart` and one `app_localizations_<locale>.dart` per ARB file (en, de, fr, ja, nl). **Never edit these generated files manually.**

3. **Use in code** — import `app_localizations.dart` and call:

   ```dart
   final l10n = AppLocalizations.of(context)!;
   Text(l10n.settingsSaved)
   ```

### Important rules

- **Always run `flutter gen-l10n` before `flutter analyze` or `flutter test`** when ARB files have changed. Skipping this step causes `undefined method` errors.
- The English ARB file is the source of truth. Every key in `app_de.arb`, `app_fr.arb`, `app_ja.arb`, and `app_nl.arb` must also exist in `app_en.arb`.
- The `@<key>` metadata entries in ARB files (description, placeholders) are for the generator and do not appear in generated code.

---

## 6. Auth Token Management

Authentication uses **Keycloak** with the **PKCE Authorization Code Flow** (suitable for public clients without a client secret).

### Library

`flutter_appauth` wraps the platform's native AppAuth SDK. Configuration is in `AuthService` (`mobile/lib/services/auth_service.dart`):

```dart
final _appAuth = FlutterAppAuth();
final _authorizationEndpoint = '${AppConfig.keycloakUrl}/realms/hhh/protocol/openid-connect/auth';
final _tokenEndpoint = '${AppConfig.keycloakUrl}/realms/hhh/protocol/openid-connect/token';
```

### Login flow

1. `AuthService.login()` calls `appAuth.authorizeAndExchangeCode(...)` which opens the Keycloak login page in a system browser tab.
2. Keycloak redirects back to the app via the custom URI scheme `hhh://callback`.
3. `flutter_appauth` exchanges the code for tokens automatically.
4. Access token, refresh token, and expiry are stored in `flutter_secure_storage`.

### Token refresh

`AuthService.getAccessToken()`:

- Checks if the stored access token is still valid (with a 60-second buffer).
- If expired, calls `appAuth.token(...)` with the refresh token to silently obtain a new access token.
- Returns the valid access token string; throws `UnauthorisedException` if refresh fails.

### Attaching tokens to requests

Token attachment is handled centrally by `mobile/lib/core/auth_interceptor.dart` — a Dio `Interceptor` that calls `authService.getAccessToken()` and sets `Authorization: Bearer <token>` on every outgoing request before it is sent. The interceptor is registered on the shared `Dio` instance created in `mobile/lib/core/dio_provider.dart`:

```dart
// dio_provider.dart
final dioProvider = Provider<Dio>((ref) {
  final dio = Dio();
  dio.interceptors.add(AuthInterceptor(ref.read(authServiceProvider)));
  return dio;
});
```

All service classes receive the `Dio` instance from `dioProvider` via Riverpod. The previous per-service `_authHeaders()` helper pattern has been removed — do not re-introduce it in new services.

### Logout

`AuthService.logout()` clears all tokens from `flutter_secure_storage` and calls the Keycloak end-session endpoint to invalidate the server-side session.

---

## 7. Configuration and Environment Variables

All backend URLs are baked in at **compile time** (`String.fromEnvironment` is a const — there is no runtime config file on device). They are read in `mobile/lib/config/app_config.dart`, and the defaults are **mode-dependent**:

```dart
abstract final class AppConfig {
  static const apiBaseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: kReleaseMode ? _prodApiBaseUrl : _localhostApiBaseUrl,
  );
  // …same pattern for keycloakUrl and wsBaseUrl
}
```

| `--dart-define` key | Debug default (`flutter run`)  | Release default (`build ipa` / Xcode archive) |
| ------------------- | ------------------------------ | --------------------------------------------- |
| `API_BASE_URL`      | `http://localhost:3000/api/v1` | `https://habit.wiwi.tu-dresden.de/api/v1`     |
| `KEYCLOAK_URL`      | `http://localhost:8080`        | `https://habit.wiwi.tu-dresden.de/auth`       |
| `WS_BASE_URL`       | `ws://localhost:3000/ws`       | `wss://habit.wiwi.tu-dresden.de/ws`           |

**Why mode-dependent:** an Xcode archive (*Product → Archive*) cannot pass Flutter `--dart-define` flags. When release defaulted to localhost, such a build shipped pointing at localhost and rendered a **blank white screen** on device. Defaulting release to production makes `flutter build ipa` and Xcode archives correct with no flags; `flutter run` still uses localhost for local development.

Passing `--dart-define` (or `--dart-define-from-file=dart_defines_prod.json`) still works and overrides either default — use it for a staging server. If a *release* build is explicitly pointed at localhost, `AppConfig.productionConfigError()` returns a message and `main()` renders it on screen instead of starting the app (see `_ConfigErrorApp` in `main.dart`) — never a silent white screen.

**Do not use hardcoded URLs in service files.** Always reference `AppConfig` constants.

---

## 8. Services Layer

Service classes in `mobile/lib/services/` are thin wrappers around **Dio** HTTP calls. Each service is exposed as a Riverpod `Provider` so it can be overridden in tests.

| Service                   | Provider                          | Responsibility                                                    |
| ------------------------- | --------------------------------- | ----------------------------------------------------------------- |
| `AuthService`             | `authServiceProvider`             | Keycloak PKCE login/logout/token refresh                          |
| `HabitService`            | `habitServiceProvider`            | `GET /habits` — browse donated habits                             |
| `SurveyService`           | `surveyServiceProvider`           | Fetch survey definition; submit responses                         |
| `AdminService`            | `adminServiceProvider`            | Admin CRUD for participants, habits, surveys                      |
| `RecommendationService`   | `recommendationServiceProvider`   | REST-based recommendation fetch                                   |
| `RecommendationWsService` | `recommendationWsServiceProvider` | WebSocket-based real-time recommendation stream                   |
| `MyHabitsService`         | `myHabitsServiceProvider`         | Habit config, intentions CRUD, daily logs, SRHI submit/trajectory |

### Error handling

All service methods catch network and server errors and re-throw them as typed `AppException` subclasses (defined in `mobile/lib/core/exceptions.dart`):

- `NetworkException` — no connectivity / timeout
- `UnauthorisedException` — 401 response
- `ServerException` — 5xx response
- `ValidationException` — 4xx response with a validation payload

Screens and providers catch `AppException` to show user-facing error messages.

---

## 9. My Habits Feature

### Purpose

The My Habits feature supports two user populations:

- **DFG study participants** — after redeeming a study code during onboarding they are routed directly to `/habits/new/behavior` to create their first intention. Their habit config (including pre-rated `assignedCues` and SRHI items) is set by the study coordinator.
- **Public users** — may also create habits; they skip the study-code step and arrive at `/habits/new/behavior` from the Habits tab. They self-select cues via free-text inputs.

### Provider strategy

All reads use `FutureProvider` (or `FutureProvider.family` for parameterised fetches). There is no mutable `Notifier` for server-side state; after a mutation (create intention, submit log, submit SRHI) the service call is awaited and then the relevant provider is refreshed with `ref.invalidate()`, which triggers a fresh fetch.

### New habit creation flow (3 screens)

```
NewHabitScreen1Behavior   pick a behavior from habitConfig.behaviorOptions
        │
        ▼
NewHabitScreen2Cue        select a pre-rated cue (assignedCues) or enter free-text
        │
        ▼
NewHabitScreen3Confirm    review the if-then statement, pick duration, POST /habits/intentions
        │
        └─► /habits  (invalidates intentionsProvider)
```

The "New Habit" button on `MyHabitsScreen` is hidden when `intentions.length >= habitConfig.maxHabits`.

### SRHI check-in flow

`MyHabitsScreen` shows a prompt card when `dueSrhiProvider` returns one or more pending windows. Tapping the card navigates to `/habits/:intentionId/srhi/:weekNumber`. `SrhiFormScreen` renders all 12 SRHI items as 1–7 sliders; the submit button is gated until every slider has been moved. On submit it calls `POST /api/v1/srhi/:id/week/:n` and then invalidates `dueSrhiProvider` and `srhiTrajectoryProvider(id)`.

On `HabitDetailScreen`, the "Habit strength" section shows the latest submitted SRHI score (or "Not yet available"), the next scheduled check-in date (or "Due now" / "None scheduled") computed from `srhiTrajectoryProvider`'s not-yet-submitted points, and a short "What's SRHI?" explanation card the user can dismiss (per-screen-visit local state, not persisted) — above the existing SRHI trajectory sparkline.

### Activity visualization (`ContributionGraphWidget`)

`widgets/contribution_graph_widget.dart` is a GitHub-style calendar heatmap (weeks as columns, month/weekday labels, colour intensity by count) used in two places:

- **`/habits` (aggregate)** — `allHabitsActivityProvider` sums enactment counts across every active intention per day; shown as a standing fixture at the top of the page even when the participant has no habits yet (renders as an all-empty grid rather than being hidden).
- **`/habits/:intentionId` (per-habit)** — the "Activity log" section, scoped to that one intention's own logs (0/1 intensity, since a single habit is either logged or not on a given day).

Colours derive from `Theme.of(context).colorScheme` (empty cells: `surfaceContainerHighest`; filled cells: a green scale), so the graph reads correctly in both light and dark mode rather than assuming a light background.

**Backend contract note:** `GET /habits/intentions/:id/logs` returns each log's `intentionId` alongside `date`/`enacted`/`loggedAt` — this was previously omitted, which made the Flutter model's non-nullable `intentionId` field always fail to parse, silently breaking _every_ consumer of daily logs (the day-strip on `MyHabitsScreen`, the heatmap, and this widget). The Flutter model now also falls back to an empty string instead of throwing if a future regression reintroduces the gap.

### API endpoints

| Endpoint                                     | Direction | Purpose                                                                                                                                                          |
| -------------------------------------------- | --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/v1/me/habit-config`                | read      | Load `HabitConfig` (cues, items, options, maxHabits)                                                                                                             |
| `GET /api/v1/habits/intentions`              | read      | List user intentions                                                                                                                                             |
| `POST /api/v1/habits/intentions`             | write     | Create new intention                                                                                                                                             |
| `PATCH /api/v1/habits/intentions/:id/status` | write     | Abandon / pause intention                                                                                                                                        |
| `GET /api/v1/habits/intentions/:id/logs`     | read      | Daily log history (each entry includes `intentionId`)                                                                                                            |
| `POST /api/v1/habits/intentions/:id/logs`    | write     | Record daily enactment                                                                                                                                           |
| `GET /api/v1/srhi/due`                       | read      | Pending SRHI windows                                                                                                                                             |
| `POST /api/v1/srhi/:id/week/:n`              | write     | Submit SRHI check-in                                                                                                                                             |
| `GET /api/v1/srhi/:id/trajectory`            | read      | SRHI score history (each point includes `scheduledFor`, used for the next-due-date display)                                                                      |
| `GET /api/v1/onboarding/enrollment`          | read      | Current study/group — powers the Study membership section on `/settings/profile`                                                                                 |
| `POST /api/v1/onboarding/switch-study`       | write     | Move to a different study via code — see `docs/architecture.md`'s _Study Enrollment, Switching & Leaving_                                                        |
| `POST /api/v1/onboarding/leave-study`        | write     | Move back to the default study                                                                                                                                   |
| `GET /api/v1/questionnaires/due`             | read      | Also drives the post-startup in-app reminder snackbar (`dueQuestionnaireProvider`, `ShellScreen`) in addition to the existing local push-notification scheduling |

---

## 10. Donation Flow (WebView)

The habit-donation survey is a server-rendered **SurveyJS** form loaded inside a Flutter `WebView` (package `webview_flutter`). This design means survey content can be updated without rebuilding the Flutter app.

Survey targeting is handled in the backend via an explicit `targetMode`:

- `all_participants`
- `unassigned_only`
- `group_assigned`

`habit-donation` is always treated as `all_participants`, while the mobile app can still resolve surveys by stable type aliases such as `profile` and `habit-donation`.

### Step-by-step

```
DonateScreen.initState()
  └─► SurveyService.fetchSurvey('habit-donation')   ← GET /api/v1/surveys/habit-donation
         │
         ▼
      WebViewController loads:
        GET /api/v1/surveys/:id/render?lang=<en|de>  ← server-rendered SurveyJS HTML
         │
         │  participant completes form
         ▼
      window.SurveyComplete.postMessage(json)         ← JS-to-Flutter bridge
         │
         ├─► JSON validated (jsonDecode + type guard)
         │
         └─► SurveyService.submitResult(surveyId, answers)
                  └─► POST /api/v1/surveys/:id/results   (Bearer token)
                           │
                           ▼
                        context.go('/explore')
```

### Security

The JS bridge validates that `msg.message` is valid JSON and that the top-level value is a `Map<String, dynamic>` before processing. Malformed or unexpected payloads are silently discarded.

The `lang` query parameter on the render URL comes from `localeProvider` (the user's chosen language), ensuring the survey is always shown in the user's preferred language.

---

## 11. Testing

### Widget and unit tests

```bash
cd mobile
flutter gen-l10n          # must run before tests if ARB files changed
flutter test              # runs all tests in test/
flutter test test/widget/ # widget tests only
flutter test test/unit/   # unit tests only
```

Widget tests that render localised text must include `AppLocalizations.delegate` in the test `MaterialApp`:

```dart
MaterialApp(
  localizationsDelegates: AppLocalizations.localizationsDelegates,
  supportedLocales: AppLocalizations.supportedLocales,
  home: MyWidget(),
)
```

### Static analysis

```bash
cd mobile
flutter analyze
```

All analysis issues must be resolved before committing. The project uses `flutter_lints ^6.0.0`.

### Integration tests

```bash
cd mobile
flutter test integration_test/
```

Integration tests require a running backend (or a properly mocked server) and a connected device or emulator.
