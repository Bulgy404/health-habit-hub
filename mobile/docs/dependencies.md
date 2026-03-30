# Flutter Mobile Dependencies

Reference document for all direct Flutter dependencies in `mobile/pubspec.yaml`.
Each entry lists the current version constraint, purpose, specific APIs used in this codebase, and next-major-version breaking changes to watch.

---

## Table of Dependencies

| Package | Version Constraint | Purpose |
|---|---|---|
| [flutter_appauth](#flutter_appauth) | `^12.0.0` | OAuth 2.0 / OIDC PKCE authentication via Keycloak |
| [flutter_secure_storage](#flutter_secure_storage) | `^10.0.0` | Encrypted persistent key-value storage for tokens and preferences |
| [dio](#dio) | `^5.4.1` | HTTP client with interceptor support for all API calls |
| [flutter_riverpod](#flutter_riverpod) | `^3.3.1` | Reactive state management and dependency injection |
| [go_router](#go_router) | `^17.1.0` | Declarative URL-based routing with redirect guards |
| [fl_chart](#fl_chart) | `^1.2.0` | Interactive line and bar charts for the stats screen |
| [webview_flutter](#webview_flutter) | `^4.10.0` | Embedded web content for donation and profile screens |
| [web_socket_channel](#web_socket_channel) | `^3.0.0` | WebSocket client for real-time recommendation streaming |
| [url_launcher](#url_launcher) | `^6.3.0` | Open external URLs from admin habit/participant screens |
| [share_plus](#share_plus) | `^12.0.1` | Native share sheet for participant detail screen |
| [google_fonts](#google_fonts) | `^8.0.2` | Figtree font applied to the app's Material text theme |
| [firebase_core](#firebase_core) | `^4.6.0` | Firebase SDK initialisation required by firebase_messaging |
| [firebase_messaging](#firebase_messaging) | `^16.1.3` | FCM push notification token registration and message handling |
| [flutter_local_notifications](#flutter_local_notifications) | `^21.0.0` | Display local notifications for foreground FCM messages |
| [intl](#intl) | `^0.20.2` | Internationalisation and localisation formatting |

---

## flutter_appauth

**Version:** `^12.0.0`
**Purpose:** Implements the OAuth 2.0 PKCE authorisation code flow against the Keycloak identity provider.

**APIs used in this codebase:**

| Class / Symbol | Usage |
|---|---|
| `FlutterAppAuth` | Instantiated once in `AuthService` |
| `AuthorizationTokenRequest` | Builds the PKCE token request (clientId, redirectUrl, scopes, discovery URL) |
| `_appAuth.authorizeAndExchangeCode()` | Triggers the in-app browser login and exchanges the auth code for tokens |
| `TokenResponse` | Return type containing `accessToken`, `refreshToken`, `accessTokenExpirationDateTime` |

**Files:** `lib/services/auth_service.dart`

**Breaking changes to watch:**
- v12 renamed several constructor parameters; consult the changelog when bumping to v13+.
- `authorizeAndExchangeCode` may be split or renamed in future majors; check the migration guide before upgrading.

---

## flutter_secure_storage

**Version:** `^10.0.0`
**Purpose:** Encrypted key-value storage backed by Keychain (iOS) and EncryptedSharedPreferences (Android) for tokens, theme mode, locale, and onboarding state.

**APIs used in this codebase:**

| Symbol | Usage |
|---|---|
| `FlutterSecureStorage()` | Constructed as a `const` singleton in service/provider files |
| `.read(key: String)` | Async read of stored string values (tokens, preferences, onboarding flags) |
| `.write(key: String, value: String)` | Async write of string values |
| `.delete(key: String)` | Async deletion of a stored key |

**Files:** `lib/services/auth_service.dart`, `lib/providers/theme_provider.dart`, `lib/providers/locale_provider.dart`, `lib/screens/onboarding/restore_screen.dart`, `lib/screens/onboarding/welcome_screen.dart`, `lib/screens/onboarding/study_code_screen.dart`, `lib/screens/onboarding/passphrase_screen.dart`

**Breaking changes to watch:**
- v10 changed the Android encryption scheme; upgrading from v9 requires a migration step for existing data.
- Future major versions may change the Android backing store again; always test upgrade paths on device before releasing.

---

## dio

**Version:** `^5.4.1`
**Purpose:** HTTP client used for all REST API communication. Configured centrally in `dio_provider.dart` with an `AuthInterceptor` that injects Bearer tokens and handles 401 refresh.

**APIs used in this codebase:**

| Symbol | Usage |
|---|---|
| `Dio()` | Instantiated with `BaseOptions` in `dio_provider.dart` |
| `.interceptors.add()` | Adds `AuthInterceptor` for token injection and refresh |
| `Interceptor` | Base class for `AuthInterceptor` in `lib/core/auth_interceptor.dart` |
| `RequestInterceptorHandler` | Typed handler passed to `onRequest`; call `.next()` to proceed or `.reject()` to abort |
| `RequestOptions` | Request configuration object mutated inside the interceptor |
| `Options(contentType:, validateStatus:, headers:)` | Per-request overrides passed to `.get()` / `.post()` / `.put()` |
| `Response<T>` | Return type; `.data` and `.statusCode` accessed throughout services |
| `.get<T>()`, `.post<T>()`, `.put<T>()` | HTTP verb methods used across all service files |
| `DioException` | Thrown on network/HTTP errors; caught in service catch blocks |

**Files:** `lib/core/dio_provider.dart`, `lib/core/auth_interceptor.dart`, and all service files.

**Breaking changes to watch:**
- Dio v6 is in development; `DioError` was already renamed to `DioException` in v5 — any pre-v5 code must be updated.
- `RequestInterceptorHandler` API is stable but double-check on major bump.

---

## flutter_riverpod

**Version:** `^3.3.1`
**Purpose:** Compile-safe reactive state management and dependency injection throughout the app. All providers, services, and screen state use Riverpod.

**APIs used in this codebase:**

| Symbol | Usage |
|---|---|
| `ProviderScope` | Root widget wrapping `MaterialApp` in `main.dart` |
| `Provider<T>()` | Synchronous read-only providers (e.g. `dioProvider`, `routerProvider`) |
| `FutureProvider<T>()` | Async providers that return futures (e.g. `isLoggedInProvider`) |
| `NotifierProvider<N, T>()` | Stateful providers backed by a `Notifier` subclass |
| `Notifier<T>` | Base class for stateful provider logic; exposes `state` and `build()` |
| `ChangeNotifier` | Used by `AuthNotifier` as `refreshListenable` for GoRouter |
| `ConsumerWidget` | Stateless widget with `WidgetRef ref` parameter |
| `ConsumerStatefulWidget` / `ConsumerState<T>` | Stateful widget with Riverpod access |
| `ref.watch()` | Subscribes to provider and rebuilds on change |
| `ref.read()` | One-shot read without subscription |
| `ref.onDispose()` | Registers a cleanup callback on provider disposal |
| `Provider.family<T, U>()` | Parameterised providers |

**Files:** `lib/main.dart`, `lib/core/dio_provider.dart`, `lib/providers/auth_provider.dart`, `lib/providers/theme_provider.dart`, `lib/providers/locale_provider.dart`, and all screen/feature files.

**Breaking changes to watch:**
- Riverpod 3.x introduced code-generation (`@riverpod` annotation); this codebase uses the manual API — do not mix styles when adding providers.
- `StateNotifier` / `StateNotifierProvider` (Riverpod 1/2 API) are removed in v3; do not reintroduce them.

---

## go_router

**Version:** `^17.1.0`
**Purpose:** Declarative URL-based routing with redirect guards for authentication and onboarding flows.

**APIs used in this codebase:**

| Symbol | Usage |
|---|---|
| `GoRouter` | Top-level router configured in `routerProvider` |
| `GoRoute()` | Leaf route definitions with `path`, `builder`, and optional `redirect` |
| `StatefulShellRoute.indexedStack()` | Shell route for the bottom-navigation tab structure |
| `StatefulShellBranch()` | Individual tab branches inside the shell |
| `ShellRoute()` | Admin shell wrapping admin screens |
| `router.redirect` | Global redirect guard checking auth and onboarding state |
| `refreshListenable` | Wired to `AuthNotifier` (`ChangeNotifier`) so auth changes trigger re-evaluation |
| `context.go()` | Replaces the entire navigation stack |
| `context.push()` | Pushes a route onto the stack |
| `context.pop()` | Pops the current route |
| `state.matchedLocation` | Current matched path string inside redirect guards |
| `state.pathParameters` | Typed path segment parameters |
| `state.extra` | Arbitrary object passed as extra route data |

**Files:** `lib/main.dart`, `lib/providers/auth_provider.dart`, and all screen files that call `context.go()` / `context.push()`.

**Breaking changes to watch:**
- GoRouter 14+ changed `GoRoute.redirect` signature; 17.x is stable but check migration notes for v18+.
- `ShellRoute` vs `StatefulShellRoute` semantics differ; do not swap them without understanding branch state retention.
- Returning `null` from a redirect means "stay on current route" — never return the current path string to avoid infinite redirect loops.

---

## fl_chart

**Version:** `^1.2.0`
**Purpose:** Renders interactive line charts and bar charts on the stats screen.

**APIs used in this codebase:**

| Symbol | Usage |
|---|---|
| `LineChart()` | Line chart widget |
| `LineChartData()` | Full chart configuration |
| `LineChartBarData()` | Data and style for a single line series |
| `FlSpot(x, y)` | Individual data point |
| `FlDotData()` | Dot visibility and style per point |
| `BarAreaData()` | Filled area beneath the line |
| `LineTouchData()` / `LineTouchTooltipData()` / `LineTooltipItem()` | Touch tooltip configuration |
| `BarChart()` | Bar chart widget |
| `BarChartData()` | Bar chart configuration |
| `BarChartGroupData()` / `BarChartRodData()` | Bar group and individual bar data |
| `BarTouchData()` / `BarTouchTooltipData()` / `BarTooltipItem()` | Bar touch tooltip |
| `FlTitlesData()` / `AxisTitles()` / `SideTitles()` | Axis label configuration |
| `FlGridData()` | Grid line visibility and style |
| `FlBorderData()` | Chart border configuration |

**Files:** `lib/screens/stats_screen.dart`

**Breaking changes to watch:**
- fl_chart has frequent breaking API renames between minor versions; always read the full changelog before upgrading.
- v1.x renamed several `show*` boolean fields; verify field names compile after any bump.

---

## webview_flutter

**Version:** `^4.10.0`
**Purpose:** Embeds web content for the donation form and the profile web view.

**APIs used in this codebase:**

| Symbol | Usage |
|---|---|
| `WebViewController` | Programmatic controller for the WebView |
| `.setJavaScriptMode(JavaScriptMode.unrestricted)` | Enables full JavaScript execution |
| `.addJavaScriptChannel()` | Registers a named channel so the page can post messages to Dart |
| `.setNavigationDelegate(NavigationDelegate(...))` | Handles page load events and intercepts navigation |
| `.loadRequest(Uri)` | Loads a URL |
| `.runJavaScript(String)` | Executes arbitrary JS in the page context |
| `WebViewWidget(controller: ...)` | Renders the WebView in the widget tree |
| `JavaScriptChannelParams` | Configuration object for `.addJavaScriptChannel()` |
| `.onMessageReceived` | Callback invoked when the page posts to the JS channel |

**Files:** `lib/screens/donate_screen.dart`, `lib/screens/profile_screen.dart`

**Breaking changes to watch:**
- v4 rewrote the API around `WebViewController` (vs the old `WebView` widget); do not mix v3 `WebView` widget patterns with v4.
- `JavaScriptMode` enum replaces the boolean `javascriptEnabled` flag from v3.

---

## web_socket_channel

**Version:** `^3.0.0`
**Purpose:** WebSocket client for the real-time habit recommendation streaming service.

**APIs used in this codebase:**

| Symbol | Usage |
|---|---|
| `WebSocketChannel.connect(Uri)` | Opens a WebSocket connection |
| `.ready` | `Future` that completes once the handshake is done |
| `.stream` | `Stream` of incoming text/binary messages |
| `.sink.add(String)` | Sends a message to the server |
| `.sink.close()` | Closes the connection |
| `StreamController<T>.broadcast()` | Internal broadcast controller that re-emits decoded messages |

**Files:** `lib/services/recommendation_ws_service.dart`

**Breaking changes to watch:**
- v3 dropped `IOWebSocketChannel.connect` in favour of the cross-platform `WebSocketChannel.connect`; do not reintroduce the `io` constructor.

---

## url_launcher

**Version:** `^6.3.0`
**Purpose:** Launches external URLs (e.g. habit source links, export CSV downloads) from admin screens using the device's default browser or handler.

**APIs used in this codebase:**

| Symbol | Usage |
|---|---|
| `canLaunchUrl(Uri)` | Checks whether the URI can be handled before attempting launch |
| `launchUrl(Uri, mode: LaunchMode.externalApplication)` | Opens the URI in an external browser/app |

**Files:** `lib/screens/admin/admin_habits_screen.dart`, `lib/screens/admin/admin_participants_screen.dart`

**Breaking changes to watch:**
- v6 replaced `launch(String)` with `launchUrl(Uri)`; any pre-v6 call sites must be migrated before upgrading.

---

## share_plus

**Version:** `^12.0.1`
**Purpose:** Opens the native share sheet to share participant passphrase / study code text from the participant detail screen.

**APIs used in this codebase:**

| Symbol | Usage |
|---|---|
| `SharePlus.instance` | Singleton access point |
| `.share(ShareParams(...))` | Triggers the native share sheet |
| `ShareParams(text: String, subject: String)` | Payload configuration |

**Files:** `lib/screens/admin/admin_participant_detail_screen.dart`

**Breaking changes to watch:**
- share_plus v9+ moved from the static `Share.share(String)` API to `SharePlus.instance.share(ShareParams(...))`; do not reintroduce the legacy static API.

---

## google_fonts

**Version:** `^8.0.2`
**Purpose:** Provides the Figtree typeface applied globally to the app's Material `TextTheme`.

**APIs used in this codebase:**

| Symbol | Usage |
|---|---|
| `GoogleFonts.figtreeTextTheme(base)` | Returns a `TextTheme` with all styles set to Figtree; applied in `ThemeData` |
| `GoogleFonts.figtree(...)` | Returns an individual `TextStyle` for one-off overrides |

**Files:** `lib/main.dart`

**Breaking changes to watch:**
- Font names are stable but the package may add/remove fonts between majors; verify `figtree` is still present after a major bump.
- Network font loading is the default; bundle fonts offline if the app must work without internet on first launch.

---

## firebase_core

**Version:** `^4.6.0`
**Purpose:** Initialises the Firebase SDK; required before `firebase_messaging` can be used.

**APIs used in this codebase:**

| Symbol | Usage |
|---|---|
| `Firebase.initializeApp(options: DefaultFirebaseOptions.currentPlatform)` | Called in `main()` before `runApp()` |
| `DefaultFirebaseOptions.currentPlatform` | Auto-generated per-platform config from `lib/firebase_options.dart` |

**Files:** `lib/main.dart`, `lib/firebase_options.dart`

**Breaking changes to watch:**
- Firebase BoM upgrades require updating `firebase_core`, `firebase_messaging` (and any other Firebase packages) together — they must match the same BoM version.
- `firebase_options.dart` is regenerated by `flutterfire configure`; regenerate it whenever Firebase project settings change.

---

## firebase_messaging

**Version:** `^16.1.3`
**Purpose:** Registers the device for FCM push notifications, retrieves the device token sent to the backend, and handles incoming messages in foreground and background.

**APIs used in this codebase:**

| Symbol | Usage |
|---|---|
| `FirebaseMessaging.instance` | Singleton access |
| `.requestPermission()` | Prompts iOS permission dialog; no-op on Android < 13 |
| `.getToken()` | Returns the FCM registration token (sent to backend) |
| `.onTokenRefresh` | Stream of token refresh events; re-registers with backend |
| `FirebaseMessaging.onMessage` | Stream of `RemoteMessage` received while app is in foreground |
| `FirebaseMessaging.onBackgroundMessage(handler)` | Top-level function registered for background/terminated state |
| `RemoteMessage` | Incoming message object |
| `.notification` | `RemoteNotification` with `title` and `body` |
| `.data` | `Map<String, String>` of custom data payload |

**Files:** `lib/services/push_notification_service.dart`

**Breaking changes to watch:**
- Background message handler must be a top-level Dart function (not a class method or closure) — this is a platform constraint, not a version concern.
- Firebase BoM version must match `firebase_core`; upgrade both together.

---

## flutter_local_notifications

**Version:** `^21.0.0`
**Purpose:** Displays local notifications for FCM messages received while the app is in the foreground (since FCM does not auto-display foreground messages on all platforms).

**APIs used in this codebase:**

| Symbol | Usage |
|---|---|
| `FlutterLocalNotificationsPlugin` | Main plugin instance; constructed once in `PushNotificationService` |
| `.initialize(InitializationSettings)` | Initialises the plugin with Android and iOS settings |
| `.show(id, title, body, NotificationDetails)` | Displays a notification immediately |
| `InitializationSettings` | Wrapper for `AndroidInitializationSettings` and `DarwinInitializationSettings` |
| `AndroidInitializationSettings(icon)` | Android-specific init; icon is the drawable resource name |
| `DarwinInitializationSettings()` | iOS/macOS-specific init |
| `AndroidNotificationChannel` | Defines the Android notification channel |
| `.resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>()` | Gets the Android implementation to call `.createNotificationChannel()` |
| `NotificationDetails` | Wrapper for `AndroidNotificationDetails` and `DarwinNotificationDetails` |
| `AndroidNotificationDetails(channelId, channelName, importance: Importance.high, priority: Priority.high)` | Android notification appearance |
| `DarwinNotificationDetails()` | iOS notification appearance |

**Files:** `lib/services/push_notification_service.dart`

**Breaking changes to watch:**
- v21 may have changed the Android channel creation API; always test on Android 8+ (Oreo) where channels are mandatory.
- Notification icon must be a white-on-transparent PNG in `android/app/src/main/res/drawable/`; mismatches cause silent failures on Android.

---

## intl

**Version:** `^0.20.2`
**Purpose:** Internationalisation and localisation support — provides `DateFormat`, `NumberFormat`, and the `Intl` class used by Flutter's `AppLocalizations` codegen.

**APIs used in this codebase:**
Used indirectly via `flutter_localizations` and the `generate: true` flag in `pubspec.yaml`. The generated `AppLocalizations` class (from `.arb` files in `lib/l10n/`) depends on `intl` at runtime.

**Files:** Implicitly referenced by all screens that call `AppLocalizations.of(context)`.

**Breaking changes to watch:**
- `intl` version must stay in sync with the version pinned by `flutter_localizations`; let Flutter's tooling manage this constraint rather than pinning manually.
- `^0.20.x` → `^0.21.x` has breaking `DateFormat` changes in some locales; regenerate `.arb` files and test date formatting after bumping.
