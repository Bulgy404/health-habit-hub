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
9. [Donation Flow (WebView)](#9-donation-flow-webview)
10. [Testing](#10-testing)

---

## 1. Overview

The HHH Flutter app targets **Android**, **iOS**, and **Web**. It is written in Dart 3 / Flutter 3.22+. State management uses **Riverpod**, navigation uses **GoRouter**, and network calls use **Dio**.

```
Keycloak (OIDC)
     │  PKCE auth code flow
     ▼
Flutter App ──────► Node.js Backend API (Express)
     │                       │
     │  WebView (SurveyJS)   ├── Neo4j (habits graph)
     │                       ├── MongoDB (survey responses)
     │                       └── Fuseki (SPARQL / ontology)
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
│   │   └── recommendation/          # Goal input, loading, results screens
│   ├── l10n/                        # Localisation (ARB files + generated code)
│   │   ├── app_en.arb               # English strings (source of truth)
│   │   ├── app_de.arb               # German strings
│   │   ├── app_localizations.dart   # Generated — do NOT edit manually
│   │   ├── app_localizations_en.dart
│   │   └── app_localizations_de.dart
│   ├── models/                      # Plain Dart data classes (JSON serialisation)
│   ├── providers/                   # Riverpod providers (auth, locale, theme)
│   ├── screens/                     # Top-level screens registered in GoRouter
│   │   ├── admin/                   # Admin panel screens (role-guarded)
│   │   └── onboarding/              # Welcome, passphrase, restore screens
│   ├── services/                    # Network service classes (Dio-based)
│   ├── utils/
│   │   └── bip39_wordlist.dart      # BIP-39 word list (used by passphrase_screen)
│   └── widgets/
│       └── offline_banner.dart      # Shared OfflineBanner widget (used by DonateScreen, ProfileScreen)
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

| Path | Screen | Notes |
|------|--------|-------|
| `/login` | `LoginScreen` | Keycloak login entry point |
| `/onboarding/welcome` | `WelcomeScreen` | First-run onboarding |
| `/onboarding/passphrase` | `PassphraseScreen` | BIP-39 backup passphrase |
| `/onboarding/restore` | `RestoreScreen` | Restore account from passphrase |
| `/donate` | `DonateScreen` | WebView survey (habit donation) |
| `/explore` | `ExploreScreen` | Browse donated habits |
| `/recommend` | `GoalInputScreen` | Enter a health goal |
| `/recommend/loading` | `LoadingScreen` | Waits for recommendation result |
| `/profile` | `ProfileScreen` | User profile + questionnaire links |
| `/settings` | `UserSettingsScreen` | Language selector |
| `/questionnaire/:slug` | `QuestionnaireScreen` | Generic questionnaire by slug |
| `/questionnaire/:slug/confirmation` | `QuestionnaireConfirmationScreen` | Post-submit confirmation |
| `/admin/*` | `AdminShellScreen` + sub-routes | Admin panel (role-guarded) |

### Auth guard

The GoRouter `redirect` callback runs before every navigation:

1. If the user is **not logged in** and the target route is protected (`/donate`, `/explore`, `/recommend`, `/profile`, `/settings`, `/questionnaire`, `/admin`), redirect to `/onboarding/welcome`.
2. If the user **is logged in** and navigates to `/login` or `/onboarding/*`, redirect to `/donate` (the main screen).
3. If the user **lacks the `admin` role** and navigates to `/admin/*`, redirect to `/donate`.

The auth check runs on `isLoggedInProvider` (a `FutureProvider<bool>` that calls `AuthService.isLoggedIn()`).

---

## 4. State Management

The app uses **Riverpod** (`flutter_riverpod`). All providers are declared at module level (not inside widgets) for testability.

### Provider types in use

| Riverpod type | Used for |
|---------------|---------|
| `Provider` | Singleton services (e.g. `surveyServiceProvider`) |
| `FutureProvider` | One-shot async reads (e.g. `isLoggedInProvider`) |
| `FutureProvider.family` | Parameterised async reads (e.g. `questionnaireProvider(slug)`) |
| `NotifierProvider` | Mutable local state (e.g. `localeProvider`, `themeModeProvider`) |
| `NotifierProvider.family` | Per-slug questionnaire answer state |

### Key providers

| Provider | File | Description |
|----------|------|-------------|
| `authServiceProvider` | `providers/auth_provider.dart` | Exposes `AuthService` singleton |
| `isLoggedInProvider` | `providers/auth_provider.dart` | `FutureProvider<bool>` — used by router |
| `localeProvider` | `providers/locale_provider.dart` | Current app locale; persists via PUT /users/me |
| `themeModeProvider` | `providers/theme_provider.dart` | Light/dark theme toggle |
| `surveyServiceProvider` | `services/survey_service.dart` | Survey fetch + submit |
| `questionnaireFormProvider(slug)` | `features/questionnaire/questionnaire_provider.dart` | Per-slug form state (current page, answers) |

### Locale provider

`localeProvider` is a `NotifierProvider<LocaleNotifier, Locale>`. Calling `ref.read(localeProvider.notifier).setLocale(Locale('de'))`:

1. Updates the in-memory `Locale` (triggers app rebuild via `Consumer`).
2. Calls `PUT /api/v1/users/me` with `{"preferredLanguage": "de"}` to persist the preference to the backend.
3. Returns `true` on success, `false` on network failure (the UI shows a snackbar accordingly).

---

## 5. Localisation Pipeline

The app is localised into **English** (default) and **German** using Flutter's built-in `flutter_localizations` + code generation.

### Configuration

`mobile/l10n.yaml`:

```yaml
arb-dir: lib/l10n
template-arb-file: app_en.arb
output-localization-file: app_localizations.dart
output-dir: lib/l10n
```

### Workflow

1. **Add or edit a string** — edit `lib/l10n/app_en.arb` (English, the template) and `lib/l10n/app_de.arb` (German).

   ```json
   // app_en.arb
   {
     "settingsSaved": "Settings saved",
     "@settingsSaved": { "description": "Snackbar shown after settings are saved" }
   }
   ```

2. **Regenerate** — from inside `mobile/`:

   ```bash
   flutter gen-l10n
   ```

   This writes `lib/l10n/app_localizations.dart`, `app_localizations_en.dart`, and `app_localizations_de.dart`. **Never edit these generated files manually.**

3. **Use in code** — import `app_localizations.dart` and call:

   ```dart
   final l10n = AppLocalizations.of(context)!;
   Text(l10n.settingsSaved)
   ```

### Important rules

- **Always run `flutter gen-l10n` before `flutter analyze` or `flutter test`** when ARB files have changed. Skipping this step causes `undefined method` errors.
- The English ARB file is the source of truth. Every key in `app_de.arb` must also exist in `app_en.arb`.
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

All backend URLs are injected at **compile time** via `--dart-define` flags (not at runtime). They are read in `mobile/lib/config/app_config.dart`:

```dart
abstract final class AppConfig {
  static const apiBaseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'http://localhost:3000/api/v1',
  );
  static const keycloakUrl = String.fromEnvironment(
    'KEYCLOAK_URL',
    defaultValue: 'http://localhost:8080',
  );
  static const wsBaseUrl = String.fromEnvironment(
    'WS_BASE_URL',
    defaultValue: 'ws://localhost:3000/ws',
  );
}
```

| `--dart-define` key | Default | Description |
|---------------------|---------|-------------|
| `API_BASE_URL` | `http://localhost:3000/api/v1` | REST API base URL |
| `KEYCLOAK_URL` | `http://localhost:8080` | Keycloak base URL (no realm path) |
| `WS_BASE_URL` | `ws://localhost:3000/ws` | WebSocket base URL for recommendations |

**Do not use hardcoded URLs in service files.** Always reference `AppConfig` constants.

---

## 8. Services Layer

Service classes in `mobile/lib/services/` are thin wrappers around **Dio** HTTP calls. Each service is exposed as a Riverpod `Provider` so it can be overridden in tests.

| Service | Provider | Responsibility |
|---------|----------|---------------|
| `AuthService` | `authServiceProvider` | Keycloak PKCE login/logout/token refresh |
| `HabitService` | `habitServiceProvider` | `GET /habits` — browse donated habits |
| `SurveyService` | `surveyServiceProvider` | Fetch survey definition; submit responses |
| `AdminService` | `adminServiceProvider` | Admin CRUD for participants, habits, surveys |
| `RecommendationService` | `recommendationServiceProvider` | REST-based recommendation fetch |
| `RecommendationWsService` | `recommendationWsServiceProvider` | WebSocket-based real-time recommendation stream |

### Error handling

All service methods catch network and server errors and re-throw them as typed `AppException` subclasses (defined in `mobile/lib/core/exceptions.dart`):

- `NetworkException` — no connectivity / timeout
- `UnauthorisedException` — 401 response
- `ServerException` — 5xx response
- `ValidationException` — 4xx response with a validation payload

Screens and providers catch `AppException` to show user-facing error messages.

---

## 9. Donation Flow (WebView)

The habit-donation survey is a server-rendered **SurveyJS** form loaded inside a Flutter `WebView` (package `webview_flutter`). This design means survey content can be updated without rebuilding the Flutter app.

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
         └─► SurveyService.submitResponse(surveyId, answers)
                  └─► POST /api/v1/surveys/:id/responses   (Bearer token)
                           │
                           ▼
                        context.go('/explore')
```

### Security

The JS bridge validates that `msg.message` is valid JSON and that the top-level value is a `Map<String, dynamic>` before processing. Malformed or unexpected payloads are silently discarded.

The `lang` query parameter on the render URL comes from `localeProvider` (the user's chosen language), ensuring the survey is always shown in the user's preferred language.

---

## 10. Testing

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
