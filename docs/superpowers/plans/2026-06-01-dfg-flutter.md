# DFG Flutter — My Habits Module Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the "My Habits" Flutter feature for the DFG study — implementation intention creation, daily behavior logging, SRHI weekly check-in, and visualization widgets — wired into the existing app shell.

**Architecture:** Single feature module at `mobile/lib/features/my_habits/` following the established `*_models / *_service / *_provider / *_screen` pattern. Three shared visualization widgets live in `mobile/lib/widgets/`. The feature is connected via a new "Habits" tab in `ShellScreen` and four sub-routes in `main.dart`. All API calls go through the existing `dioProvider` (Dio + `AuthInterceptor`). State is read-only `FutureProvider`s; mutations call the service directly and `ref.invalidate()` the relevant provider.

**Tech Stack:** Flutter 3.22 / Dart 3, Riverpod 3, GoRouter 17, Dio 5, fl_chart 1 (sparkline + trajectory), `flutter_localizations` (EN + DE), `flutter_test` / `flutter_lints`.

**Spec reference:** `docs/superpowers/specs/2026-06-01-dfg-study-integration-design.md` §5

---

## File Map

**Create:**
- `mobile/lib/features/my_habits/my_habits_models.dart` — `HabitConfig`, `SrhiItem`, `Intention`, `IntentionCue`, `DailyLog`, `SrhiWindow`, `SrhiTrajectoryPoint`
- `mobile/lib/features/my_habits/my_habits_service.dart` — `MyHabitsService` + `myHabitsServiceProvider`
- `mobile/lib/features/my_habits/my_habits_provider.dart` — `habitConfigProvider`, `intentionsProvider`, `dueSrhiProvider`, `intentionLogsProvider`, `srhiTrajectoryProvider`
- `mobile/lib/features/my_habits/my_habits_screen.dart` — tab root: SRHI prompt card + habit list
- `mobile/lib/features/my_habits/new_habit_screen_1_behavior.dart` — Step 1: pick behavior
- `mobile/lib/features/my_habits/new_habit_screen_2_cue.dart` — Step 2: set cue (condition-gated)
- `mobile/lib/features/my_habits/new_habit_screen_3_confirm.dart` — Step 3: confirm plan + submit
- `mobile/lib/features/my_habits/habit_detail_screen.dart` — full heatmap + SRHI trajectory + actions
- `mobile/lib/features/my_habits/srhi_form_screen.dart` — 12-item 1–7 slider form
- `mobile/lib/widgets/day_strip_widget.dart` — 7-day enacted strip
- `mobile/lib/widgets/habit_heatmap_widget.dart` — GitHub-style calendar grid
- `mobile/lib/widgets/srhi_sparkline_widget.dart` — mini fl_chart LineChart
- `mobile/test/widget/day_strip_test.dart`
- `mobile/test/widget/habit_heatmap_test.dart`
- `mobile/test/widget/srhi_form_test.dart`
- `mobile/test/widget/my_habits_screen_test.dart`

**Modify:**
- `mobile/lib/l10n/app_en.arb` — add all new strings
- `mobile/lib/l10n/app_de.arb` — add German translations
- `mobile/lib/screens/shell_screen.dart` — add "Habits" tab at index 2
- `mobile/lib/main.dart` — add `/habits` branch + sub-routes
- `mobile/lib/screens/onboarding/study_code_screen.dart` — redirect to `/habits/new/behavior` after successful code redemption

---

## Task 1: Localisation Strings

**Files:**
- Modify: `mobile/lib/l10n/app_en.arb`
- Modify: `mobile/lib/l10n/app_de.arb`

- [ ] **Step 1: Add English strings to `app_en.arb`**

Open `mobile/lib/l10n/app_en.arb` and append before the final `}`:

```json
  "myHabitsTab": "My Habits",
  "@myHabitsTab": { "description": "Bottom nav tab label for My Habits" },
  "newHabit": "New Habit",
  "@newHabit": { "description": "Button to start new habit flow" },
  "noHabitsYet": "No habits yet.\nTap \"New Habit\" to start forming one.",
  "@noHabitsYet": { "description": "Empty state for My Habits tab" },
  "logToday": "Log today",
  "@logToday": { "description": "Button on habit card to log today's enactment" },
  "loggedToday": "Logged ✓",
  "@loggedToday": { "description": "Shown on habit card when today is already logged" },
  "pickBehaviorTitle": "What habit do you want to form?",
  "@pickBehaviorTitle": { "description": "Screen 1 of new habit flow" },
  "setCueTitle": "Set your cue",
  "@setCueTitle": { "description": "Screen 2 of new habit flow" },
  "setCuePreRatedInstruction": "Your study condition assigns the following cue(s). Read them carefully — this is when you will act.",
  "@setCuePreRatedInstruction": { "description": "Instruction shown for pre-rated cues" },
  "setCueSelfSelectedInstruction": "Describe a specific moment that happens regularly in your life.",
  "@setCueSelfSelectedInstruction": { "description": "Instruction shown for self-selected cues" },
  "setCuePlaceholder": "e.g. After dinner each evening",
  "@setCuePlaceholder": { "description": "Hint text for self-selected cue input" },
  "setCueTooShort": "Please describe your cue in at least 10 characters.",
  "@setCueTooShort": { "description": "Validation error for too-short cue text" },
  "confirmPlanTitle": "Your plan",
  "@confirmPlanTitle": { "description": "Screen 3 of new habit flow" },
  "confirmPlanSubtitle": "Read your implementation intention and confirm.",
  "@confirmPlanSubtitle": { "description": "Subtitle on confirm plan screen" },
  "durationLabel": "Duration (minutes)",
  "@durationLabel": { "description": "Label for duration input in new habit flow" },
  "createHabit": "Create habit",
  "@createHabit": { "description": "Submit button on confirm plan screen" },
  "habitLimitReached": "You have reached the habit limit for your study condition.",
  "@habitLimitReached": { "description": "Error when maxHabits is exceeded" },
  "srhiCheckInTitle": "Weekly habit check-in",
  "@srhiCheckInTitle": { "description": "Title on SRHI prompt card" },
  "srhiCheckInSubtitle": "Takes about 2 minutes.",
  "@srhiCheckInSubtitle": { "description": "Subtitle on SRHI prompt card" },
  "srhiStartButton": "Start check-in",
  "@srhiStartButton": { "description": "Button on SRHI prompt card" },
  "srhiFormTitle": "Habit check-in",
  "@srhiFormTitle": { "description": "AppBar title on SRHI form screen" },
  "srhiStem": "My {behavior} is something…",
  "@srhiStem": {
    "description": "Stem sentence for SRHI items",
    "placeholders": { "behavior": { "type": "String" } }
  },
  "srhiSubmit": "Submit",
  "@srhiSubmit": { "description": "Submit button on SRHI form screen" },
  "srhiSubmitIncomplete": "Please rate all 12 items before submitting.",
  "@srhiSubmitIncomplete": { "description": "Error shown when SRHI form is incomplete" },
  "weekLabel": "Week {n}",
  "@weekLabel": {
    "description": "Week label in SRHI trajectory",
    "placeholders": { "n": { "type": "int" } }
  },
  "habitDetailTitle": "Habit detail",
  "@habitDetailTitle": { "description": "AppBar title on habit detail screen" },
  "abandonHabit": "Abandon habit",
  "@abandonHabit": { "description": "Menu action to abandon a habit" },
  "abandonConfirm": "Are you sure you want to abandon this habit? This cannot be undone.",
  "@abandonConfirm": { "description": "Confirmation dialog body for abandon" },
  "cancel": "Cancel",
  "@cancel": { "description": "Cancel button in dialogs" },
  "confirm": "Confirm",
  "@confirm": { "description": "Confirm button in dialogs" },
  "heatmapTitle": "Activity log",
  "@heatmapTitle": { "description": "Section title above the heatmap" },
  "trajectoryTitle": "Habit strength",
  "@trajectoryTitle": { "description": "Section title above SRHI trajectory chart" },
  "enactedLabel": "Enacted",
  "@enactedLabel": { "description": "Legend label for heatmap enacted cells" },
  "missedLabel": "Missed",
  "@missedLabel": { "description": "Legend label for heatmap missed cells" },
  "noLogsYet": "No activity logged yet.",
  "@noLogsYet": { "description": "Empty state for heatmap" },
  "noTrajectoryYet": "SRHI data will appear after your first weekly check-in.",
  "@noTrajectoryYet": { "description": "Empty state for trajectory chart" }
```

- [ ] **Step 2: Add German strings to `app_de.arb`**

Open `mobile/lib/l10n/app_de.arb` and append before the final `}`:

```json
  "myHabitsTab": "Meine Gewohnheiten",
  "newHabit": "Neue Gewohnheit",
  "noHabitsYet": "Noch keine Gewohnheiten.\nTippe auf „Neue Gewohnheit", um eine zu beginnen.",
  "logToday": "Heute eintragen",
  "loggedToday": "Eingetragen ✓",
  "pickBehaviorTitle": "Welche Gewohnheit möchtest du aufbauen?",
  "setCueTitle": "Stichworteingabe",
  "setCuePreRatedInstruction": "Deine Studienbedingung gibt dir folgende(n) Hinweisreiz(e) vor. Lies sie sorgfältig – das ist der Moment, in dem du handeln wirst.",
  "setCueSelfSelectedInstruction": "Beschreibe einen konkreten Moment, der regelmäßig in deinem Alltag vorkommt.",
  "setCuePlaceholder": "z.B. Nach dem Abendessen",
  "setCueTooShort": "Bitte beschreibe deinen Hinweisreiz mit mindestens 10 Zeichen.",
  "confirmPlanTitle": "Dein Plan",
  "confirmPlanSubtitle": "Lies deine Implementierungsintention und bestätige sie.",
  "durationLabel": "Dauer (Minuten)",
  "createHabit": "Gewohnheit erstellen",
  "habitLimitReached": "Du hast die Gewohnheitsgrenze für deine Studienbedingung erreicht.",
  "srhiCheckInTitle": "Wöchentliches Gewohnheits-Check-in",
  "srhiCheckInSubtitle": "Dauert ca. 2 Minuten.",
  "srhiStartButton": "Check-in starten",
  "srhiFormTitle": "Gewohnheits-Check-in",
  "srhiStem": "Mein {behavior} ist etwas,",
  "srhiSubmit": "Absenden",
  "srhiSubmitIncomplete": "Bitte bewerte alle 12 Aussagen, bevor du absendest.",
  "weekLabel": "Woche {n}",
  "habitDetailTitle": "Gewohnheitsdetails",
  "abandonHabit": "Gewohnheit aufgeben",
  "abandonConfirm": "Bist du sicher, dass du diese Gewohnheit aufgeben möchtest? Dies kann nicht rückgängig gemacht werden.",
  "cancel": "Abbrechen",
  "confirm": "Bestätigen",
  "heatmapTitle": "Aktivitätsprotokoll",
  "trajectoryTitle": "Gewohnheitsstärke",
  "enactedLabel": "Umgesetzt",
  "missedLabel": "Verpasst",
  "noLogsYet": "Noch keine Aktivität eingetragen.",
  "noTrajectoryYet": "SRHI-Daten erscheinen nach deinem ersten wöchentlichen Check-in."
```

- [ ] **Step 3: Regenerate l10n**

```bash
cd /Users/felixreinsch/Github/health-habit-hub-1/mobile && flutter gen-l10n
```
Expected: no errors; `lib/l10n/app_localizations_en.dart` and `app_localizations_de.dart` updated.

- [ ] **Step 4: Verify it compiles**

```bash
cd /Users/felixreinsch/Github/health-habit-hub-1/mobile && flutter analyze 2>&1 | grep -E "error|warning" | head -10
```
Expected: no new errors.

- [ ] **Step 5: Commit**

```bash
git add mobile/lib/l10n/app_en.arb mobile/lib/l10n/app_de.arb mobile/lib/l10n/app_localizations_en.dart mobile/lib/l10n/app_localizations_de.dart mobile/lib/l10n/app_localizations.dart
git commit -m "feat(flutter): add l10n strings for My Habits module"
```

---

## Task 2: Data Models

**Files:**
- Create: `mobile/lib/features/my_habits/my_habits_models.dart`

- [ ] **Step 1: Create the models file**

```dart
// mobile/lib/features/my_habits/my_habits_models.dart

/// A single SRHI item (id, English text, German text).
class SrhiItem {
  const SrhiItem({
    required this.id,
    required this.en,
    required this.de,
  });

  final String id;
  final String en;
  final String de;

  factory SrhiItem.fromJson(Map<String, dynamic> json) => SrhiItem(
        id: json['id'] as String,
        en: json['en'] as String,
        de: json['de'] as String,
      );
}

/// Resolved cue configuration returned by GET /api/v1/me/habit-config.
class HabitConfig {
  const HabitConfig({
    required this.cueCount,
    required this.cueSource,
    this.cuePoolId,
    required this.behaviorOptions,
    this.maxHabits,
    required this.srhiItems,
  });

  /// 'single' or 'multi'
  final String cueCount;

  /// 'low_quality', 'high_quality', or 'self_selected'
  final String cueSource;

  final String? cuePoolId;
  final List<String> behaviorOptions;

  /// null = unlimited (public user). 1 = study participant.
  final int? maxHabits;

  final List<SrhiItem> srhiItems;

  factory HabitConfig.fromJson(Map<String, dynamic> json) => HabitConfig(
        cueCount: json['cueCount'] as String? ?? 'multi',
        cueSource: json['cueSource'] as String? ?? 'high_quality',
        cuePoolId: json['cuePoolId'] as String?,
        behaviorOptions: (json['behaviorOptions'] as List<dynamic>?)
                ?.cast<String>() ??
            const [],
        maxHabits: json['maxHabits'] as int?,
        srhiItems: (json['srhiItems'] as List<dynamic>?)
                ?.cast<Map<String, dynamic>>()
                .map(SrhiItem.fromJson)
                .toList() ??
            const [],
      );
}

/// A single cue attached to an implementation intention.
class IntentionCue {
  const IntentionCue({
    required this.text,
    required this.source,
    this.cueId,
  });

  final String text;

  /// 'pre_rated' or 'self_selected'
  final String source;

  final String? cueId;

  factory IntentionCue.fromJson(Map<String, dynamic> json) => IntentionCue(
        text: json['text'] as String,
        source: json['source'] as String,
        cueId: json['cueId'] as String?,
      );

  Map<String, dynamic> toJson() => {
        'text': text,
        'source': source,
        if (cueId != null) 'cueId': cueId,
      };
}

/// An implementation intention created by the user.
class Intention {
  const Intention({
    required this.id,
    required this.behaviorKey,
    required this.behaviorLabel,
    required this.durationMinutes,
    required this.cues,
    required this.intentionStatement,
    required this.status,
    required this.createdAt,
  });

  final String id;
  final String behaviorKey;
  final String behaviorLabel;
  final int durationMinutes;
  final List<IntentionCue> cues;
  final String intentionStatement;

  /// 'active', 'paused', 'completed', or 'abandoned'
  final String status;

  final DateTime createdAt;

  factory Intention.fromJson(Map<String, dynamic> json) => Intention(
        id: (json['_id'] ?? json['id']) as String,
        behaviorKey: json['behaviorKey'] as String,
        behaviorLabel: json['behaviorLabel'] as String,
        durationMinutes: (json['durationMinutes'] as num).toInt(),
        cues: (json['cues'] as List<dynamic>)
            .cast<Map<String, dynamic>>()
            .map(IntentionCue.fromJson)
            .toList(),
        intentionStatement: json['intentionStatement'] as String,
        status: json['status'] as String,
        createdAt: DateTime.parse(json['createdAt'] as String),
      );
}

/// A single daily behavior log entry.
class DailyLog {
  const DailyLog({
    required this.intentionId,
    required this.date,
    required this.enacted,
    required this.loggedAt,
  });

  final String intentionId;

  /// 'YYYY-MM-DD'
  final String date;
  final bool enacted;
  final DateTime loggedAt;

  factory DailyLog.fromJson(Map<String, dynamic> json) => DailyLog(
        intentionId: json['intentionId'] as String,
        date: json['date'] as String,
        enacted: json['enacted'] as bool,
        loggedAt: DateTime.parse(json['loggedAt'] as String),
      );
}

/// An open SRHI measurement window (due for submission).
class SrhiWindow {
  const SrhiWindow({
    required this.id,
    required this.intentionId,
    required this.weekNumber,
    required this.scheduledFor,
    this.submittedAt,
    this.score,
  });

  final String id;
  final String intentionId;
  final int weekNumber;
  final DateTime scheduledFor;
  final DateTime? submittedAt;
  final double? score;

  factory SrhiWindow.fromJson(Map<String, dynamic> json) => SrhiWindow(
        id: json['id'] as String,
        intentionId: json['intentionId'] as String,
        weekNumber: (json['weekNumber'] as num).toInt(),
        scheduledFor: DateTime.parse(json['scheduledFor'] as String),
        submittedAt: json['submittedAt'] != null
            ? DateTime.parse(json['submittedAt'] as String)
            : null,
        score: json['score'] != null ? (json['score'] as num).toDouble() : null,
      );
}

/// One data point in the SRHI trajectory for a habit.
class SrhiTrajectoryPoint {
  const SrhiTrajectoryPoint({
    required this.weekNumber,
    this.score,
    this.submittedAt,
  });

  final int weekNumber;
  final double? score;
  final DateTime? submittedAt;

  factory SrhiTrajectoryPoint.fromJson(Map<String, dynamic> json) =>
      SrhiTrajectoryPoint(
        weekNumber: (json['weekNumber'] as num).toInt(),
        score:
            json['score'] != null ? (json['score'] as num).toDouble() : null,
        submittedAt: json['submittedAt'] != null
            ? DateTime.parse(json['submittedAt'] as String)
            : null,
      );
}
```

- [ ] **Step 2: Verify it analyzes cleanly**

```bash
cd /Users/felixreinsch/Github/health-habit-hub-1/mobile && flutter analyze lib/features/my_habits/my_habits_models.dart 2>&1 | head -10
```
Expected: `No issues found!`

- [ ] **Step 3: Commit**

```bash
git add mobile/lib/features/my_habits/my_habits_models.dart
git commit -m "feat(flutter): add My Habits data models"
```

---

## Task 3: Service

**Files:**
- Create: `mobile/lib/features/my_habits/my_habits_service.dart`

- [ ] **Step 1: Create the service file**

```dart
// mobile/lib/features/my_habits/my_habits_service.dart
import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../config/app_config.dart';
import '../../core/dio_provider.dart';
import '../../core/exceptions.dart';
import 'my_habits_models.dart';

class MyHabitsService {
  MyHabitsService({required Dio dio}) : _dio = dio;

  final Dio _dio;
  static const _base = AppConfig.apiBaseUrl;

  Future<HabitConfig> fetchHabitConfig() async {
    try {
      final res = await _dio.get<Map<String, dynamic>>('$_base/me/habit-config');
      return HabitConfig.fromJson(res.data ?? {});
    } on DioException catch (e) {
      if (e.response?.statusCode == 401) throw const UnauthorisedException();
      throw NetworkException(e.message ?? 'Network error');
    }
  }

  Future<List<Intention>> listIntentions() async {
    try {
      final res = await _dio.get<List<dynamic>>('$_base/habits/intentions');
      return (res.data ?? [])
          .cast<Map<String, dynamic>>()
          .map(Intention.fromJson)
          .toList();
    } on DioException catch (e) {
      if (e.response?.statusCode == 401) throw const UnauthorisedException();
      throw NetworkException(e.message ?? 'Network error');
    }
  }

  Future<Intention> createIntention({
    required String behaviorKey,
    required String behaviorLabel,
    required int durationMinutes,
    required List<IntentionCue> cues,
    required String intentionStatement,
  }) async {
    try {
      final res = await _dio.post<Map<String, dynamic>>(
        '$_base/habits/intentions',
        data: {
          'behaviorKey': behaviorKey,
          'behaviorLabel': behaviorLabel,
          'durationMinutes': durationMinutes,
          'cues': cues.map((c) => c.toJson()).toList(),
          'intentionStatement': intentionStatement,
        },
      );
      if (res.statusCode == 409) {
        throw const ValidationException('Habit limit reached');
      }
      return Intention.fromJson(res.data!);
    } on DioException catch (e) {
      if (e.response?.statusCode == 401) throw const UnauthorisedException();
      if (e.response?.statusCode == 409) {
        throw const ValidationException('Habit limit reached');
      }
      throw NetworkException(e.message ?? 'Network error');
    }
  }

  Future<void> updateStatus(String intentionId, String status) async {
    try {
      await _dio.patch(
        '$_base/habits/intentions/$intentionId/status',
        data: {'status': status},
      );
    } on DioException catch (e) {
      if (e.response?.statusCode == 401) throw const UnauthorisedException();
      throw NetworkException(e.message ?? 'Network error');
    }
  }

  Future<void> logDay({
    required String intentionId,
    required String date,
    required bool enacted,
  }) async {
    try {
      await _dio.post(
        '$_base/habits/intentions/$intentionId/logs',
        data: {'date': date, 'enacted': enacted},
      );
    } on DioException catch (e) {
      if (e.response?.statusCode == 401) throw const UnauthorisedException();
      throw NetworkException(e.message ?? 'Network error');
    }
  }

  Future<List<DailyLog>> fetchLogs(
    String intentionId, {
    String? from,
    String? to,
  }) async {
    try {
      final res = await _dio.get<List<dynamic>>(
        '$_base/habits/intentions/$intentionId/logs',
        queryParameters: {
          if (from != null) 'from': from,
          if (to != null) 'to': to,
        },
      );
      return (res.data ?? [])
          .cast<Map<String, dynamic>>()
          .map(DailyLog.fromJson)
          .toList();
    } on DioException catch (e) {
      if (e.response?.statusCode == 401) throw const UnauthorisedException();
      throw NetworkException(e.message ?? 'Network error');
    }
  }

  Future<List<SrhiWindow>> fetchDueSrhi() async {
    try {
      final res = await _dio.get<List<dynamic>>('$_base/srhi/due');
      return (res.data ?? [])
          .cast<Map<String, dynamic>>()
          .map(SrhiWindow.fromJson)
          .toList();
    } on DioException catch (e) {
      if (e.response?.statusCode == 401) throw const UnauthorisedException();
      throw NetworkException(e.message ?? 'Network error');
    }
  }

  Future<SrhiTrajectoryPoint> submitSrhi({
    required String intentionId,
    required int weekNumber,
    required Map<String, int> items,
  }) async {
    try {
      final res = await _dio.post<Map<String, dynamic>>(
        '$_base/srhi/$intentionId/week/$weekNumber',
        data: {'items': items},
      );
      return SrhiTrajectoryPoint.fromJson(res.data!);
    } on DioException catch (e) {
      if (e.response?.statusCode == 401) throw const UnauthorisedException();
      throw NetworkException(e.message ?? 'Network error');
    }
  }

  Future<List<SrhiTrajectoryPoint>> fetchTrajectory(String intentionId) async {
    try {
      final res = await _dio.get<List<dynamic>>(
        '$_base/srhi/$intentionId/trajectory',
      );
      return (res.data ?? [])
          .cast<Map<String, dynamic>>()
          .map(SrhiTrajectoryPoint.fromJson)
          .toList();
    } on DioException catch (e) {
      if (e.response?.statusCode == 401) throw const UnauthorisedException();
      throw NetworkException(e.message ?? 'Network error');
    }
  }
}

final myHabitsServiceProvider = Provider<MyHabitsService>((ref) {
  return MyHabitsService(dio: ref.watch(dioProvider));
});
```

- [ ] **Step 2: Check `exceptions.dart` has `NetworkException` and `ValidationException`**

```bash
grep -n "NetworkException\|ValidationException" /Users/felixreinsch/Github/health-habit-hub-1/mobile/lib/core/exceptions.dart
```

If they're missing, add them to `exceptions.dart`:

```dart
class NetworkException extends AppException {
  const NetworkException(this.message);
  final String message;
  @override String toString() => 'NetworkException: $message';
}

class ValidationException extends AppException {
  const ValidationException(this.message);
  final String message;
  @override String toString() => 'ValidationException: $message';
}
```

- [ ] **Step 3: Verify analysis**

```bash
cd /Users/felixreinsch/Github/health-habit-hub-1/mobile && flutter analyze lib/features/my_habits/my_habits_service.dart 2>&1 | head -10
```
Expected: `No issues found!`

- [ ] **Step 4: Commit**

```bash
git add mobile/lib/features/my_habits/my_habits_service.dart mobile/lib/core/exceptions.dart
git commit -m "feat(flutter): add MyHabitsService with intention + SRHI + log API calls"
```

---

## Task 4: Riverpod Providers

**Files:**
- Create: `mobile/lib/features/my_habits/my_habits_provider.dart`

- [ ] **Step 1: Create the providers file**

```dart
// mobile/lib/features/my_habits/my_habits_provider.dart
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'my_habits_models.dart';
import 'my_habits_service.dart';

/// Resolved cue configuration for the current user (study or public default).
final habitConfigProvider = FutureProvider<HabitConfig>((ref) {
  return ref.watch(myHabitsServiceProvider).fetchHabitConfig();
});

/// All active implementation intentions for the current user.
final intentionsProvider = FutureProvider<List<Intention>>((ref) {
  return ref.watch(myHabitsServiceProvider).listIntentions();
});

/// SRHI windows that are currently due for submission.
final dueSrhiProvider = FutureProvider<List<SrhiWindow>>((ref) {
  return ref.watch(myHabitsServiceProvider).fetchDueSrhi();
});

/// Daily logs for a specific intention. Keyed by intentionId.
final intentionLogsProvider =
    FutureProvider.family<List<DailyLog>, String>((ref, intentionId) {
  return ref.watch(myHabitsServiceProvider).fetchLogs(intentionId);
});

/// SRHI trajectory (submitted weeks) for a specific intention. Keyed by intentionId.
final srhiTrajectoryProvider =
    FutureProvider.family<List<SrhiTrajectoryPoint>, String>(
        (ref, intentionId) {
  return ref
      .watch(myHabitsServiceProvider)
      .fetchTrajectory(intentionId);
});
```

- [ ] **Step 2: Verify analysis**

```bash
cd /Users/felixreinsch/Github/health-habit-hub-1/mobile && flutter analyze lib/features/my_habits/my_habits_provider.dart 2>&1 | head -10
```
Expected: `No issues found!`

- [ ] **Step 3: Commit**

```bash
git add mobile/lib/features/my_habits/my_habits_provider.dart
git commit -m "feat(flutter): add My Habits Riverpod providers"
```

---

## Task 5: DayStripWidget

**Files:**
- Create: `mobile/lib/widgets/day_strip_widget.dart`
- Create: `mobile/test/widget/day_strip_test.dart`

- [ ] **Step 1: Write the failing test**

```dart
// mobile/test/widget/day_strip_test.dart
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hhh/widgets/day_strip_widget.dart';

Widget _wrap(Widget child) => MaterialApp(home: Scaffold(body: child));

void main() {
  testWidgets('DayStripWidget renders 7 day cells', (tester) async {
    await tester.pumpWidget(_wrap(
      const DayStripWidget(logs: {}, startDate: null),
    ));
    // 7 day cells
    expect(find.byType(DayCell), findsNWidgets(7));
  });

  testWidgets('DayStripWidget handles partial week (< 7 days since creation)',
      (tester) async {
    final today = DateTime.now();
    final threeDaysAgo = today.subtract(const Duration(days: 3));
    await tester.pumpWidget(_wrap(
      DayStripWidget(logs: {}, startDate: threeDaysAgo),
    ));
    // Only 4 cells rendered (day 0 through today = 4 days)
    expect(find.byType(DayCell), findsNWidgets(4));
  });

  testWidgets('DayStripWidget shows enacted cell as green', (tester) async {
    final today = DateTime.now();
    final dateStr =
        '${today.year}-${today.month.toString().padLeft(2, '0')}-${today.day.toString().padLeft(2, '0')}';
    await tester.pumpWidget(_wrap(
      DayStripWidget(logs: {dateStr: true}, startDate: null),
    ));
    final cell = tester.widget<DayCell>(find.byType(DayCell).last);
    expect(cell.enacted, true);
  });
}
```

- [ ] **Step 2: Run test — verify it fails**

```bash
cd /Users/felixreinsch/Github/health-habit-hub-1/mobile && flutter test test/widget/day_strip_test.dart 2>&1 | head -15
```
Expected: FAIL — `DayStripWidget` not found.

- [ ] **Step 3: Implement `DayStripWidget`**

```dart
// mobile/lib/widgets/day_strip_widget.dart
import 'package:flutter/material.dart';

/// A row of up to 7 day circles showing enacted/missed/pending status.
///
/// [logs] maps 'YYYY-MM-DD' → true (enacted) / false (explicit miss).
/// [startDate] clamps the strip to only show days since the habit was created.
/// If null, always shows 7 days ending today.
class DayStripWidget extends StatelessWidget {
  const DayStripWidget({
    required this.logs,
    required this.startDate,
    super.key,
  });

  final Map<String, bool> logs;
  final DateTime? startDate;

  @override
  Widget build(BuildContext context) {
    final today = DateTime.now();
    final todayNorm = DateTime(today.year, today.month, today.day);

    // Determine first day to show (at most 6 days before today).
    final earliest = startDate != null
        ? DateTime(startDate!.year, startDate!.month, startDate!.day)
        : todayNorm.subtract(const Duration(days: 6));
    final firstDay =
        earliest.isAfter(todayNorm.subtract(const Duration(days: 6)))
            ? earliest
            : todayNorm.subtract(const Duration(days: 6));

    final dayCount = todayNorm.difference(firstDay).inDays + 1;

    return Row(
      mainAxisAlignment: MainAxisAlignment.start,
      children: List.generate(dayCount, (i) {
        final day = firstDay.add(Duration(days: i));
        final key =
            '${day.year}-${day.month.toString().padLeft(2, '0')}-${day.day.toString().padLeft(2, '0')}';
        final enacted = logs[key];
        return Padding(
          padding: const EdgeInsets.only(right: 4),
          child: DayCell(enacted: enacted),
        );
      }),
    );
  }
}

/// A single circle cell in the day strip.
class DayCell extends StatelessWidget {
  const DayCell({required this.enacted, super.key});

  /// true = enacted (green), false = missed (red), null = pending (grey).
  final bool? enacted;

  @override
  Widget build(BuildContext context) {
    final Color color;
    final Widget child;
    if (enacted == true) {
      color = const Color(0xFF45B700);
      child = const Icon(Icons.check, size: 12, color: Colors.white);
    } else if (enacted == false) {
      color = const Color(0xFFE53935);
      child = const Icon(Icons.close, size: 12, color: Colors.white);
    } else {
      color = const Color(0xFFE5E7EB);
      child = const SizedBox.shrink();
    }
    return Container(
      width: 28,
      height: 28,
      decoration: BoxDecoration(color: color, shape: BoxShape.circle),
      child: Center(child: child),
    );
  }
}
```

- [ ] **Step 4: Run test — verify it passes**

```bash
cd /Users/felixreinsch/Github/health-habit-hub-1/mobile && flutter test test/widget/day_strip_test.dart 2>&1 | tail -5
```
Expected: all 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add mobile/lib/widgets/day_strip_widget.dart mobile/test/widget/day_strip_test.dart
git commit -m "feat(flutter): add DayStripWidget with tests"
```

---

## Task 6: HabitHeatmapWidget

**Files:**
- Create: `mobile/lib/widgets/habit_heatmap_widget.dart`
- Create: `mobile/test/widget/habit_heatmap_test.dart`

- [ ] **Step 1: Write the failing test**

```dart
// mobile/test/widget/habit_heatmap_test.dart
import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hhh/l10n/app_localizations.dart';
import 'package:hhh/widgets/habit_heatmap_widget.dart';

Widget _wrap(Widget child) => MaterialApp(
      localizationsDelegates: AppLocalizations.localizationsDelegates,
      supportedLocales: AppLocalizations.supportedLocales,
      home: Scaffold(body: SingleChildScrollView(child: child)),
    );

void main() {
  testWidgets('HabitHeatmapWidget renders grey cells for days with no log',
      (tester) async {
    final startDate = DateTime.now().subtract(const Duration(days: 13));
    await tester.pumpWidget(_wrap(
      HabitHeatmapWidget(logs: const {}, startDate: startDate),
    ));
    // All HeatmapCell widgets should have no enacted value
    final cells = tester.widgetList<HeatmapCell>(find.byType(HeatmapCell));
    expect(cells.every((c) => c.enacted == null), isTrue);
  });

  testWidgets('HabitHeatmapWidget colours enacted cells green', (tester) async {
    final today = DateTime.now();
    final dateStr =
        '${today.year}-${today.month.toString().padLeft(2, '0')}-${today.day.toString().padLeft(2, '0')}';
    await tester.pumpWidget(_wrap(
      HabitHeatmapWidget(
        logs: {dateStr: true},
        startDate: today.subtract(const Duration(days: 6)),
      ),
    ));
    final enactedCells =
        tester.widgetList<HeatmapCell>(find.byType(HeatmapCell))
            .where((c) => c.enacted == true);
    expect(enactedCells.length, 1);
  });
}
```

- [ ] **Step 2: Run test — verify it fails**

```bash
cd /Users/felixreinsch/Github/health-habit-hub-1/mobile && flutter test test/widget/habit_heatmap_test.dart 2>&1 | head -15
```
Expected: FAIL — `HabitHeatmapWidget` not found.

- [ ] **Step 3: Implement `HabitHeatmapWidget`**

```dart
// mobile/lib/widgets/habit_heatmap_widget.dart
import 'package:flutter/material.dart';

/// GitHub-style calendar heatmap for daily habit enactment.
///
/// [logs] maps 'YYYY-MM-DD' → true (enacted) / false (explicit miss).
/// Days with no entry are rendered grey (no judgment).
/// [startDate] is the date the intention was created; the grid starts there.
class HabitHeatmapWidget extends StatelessWidget {
  const HabitHeatmapWidget({
    required this.logs,
    required this.startDate,
    super.key,
  });

  final Map<String, bool> logs;
  final DateTime startDate;

  @override
  Widget build(BuildContext context) {
    final today = DateTime.now();
    final todayNorm = DateTime(today.year, today.month, today.day);
    final startNorm =
        DateTime(startDate.year, startDate.month, startDate.day);
    final totalDays = todayNorm.difference(startNorm).inDays + 1;

    // Build list of (dateStr, enacted?) tuples.
    final days = List.generate(totalDays, (i) {
      final d = startNorm.add(Duration(days: i));
      final key =
          '${d.year}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';
      return (key, logs[key]);
    });

    // Group into weeks of 7, left-padding the first week.
    final leadingEmpties = startNorm.weekday % 7; // 0=Sun offset
    final paddedDays = [
      ...List.generate(leadingEmpties, (_) => (null, null)),
      ...days,
    ];

    final weeks = <List<(String?, bool?)>>[];
    for (var i = 0; i < paddedDays.length; i += 7) {
      weeks.add(paddedDays.sublist(
          i, i + 7 > paddedDays.length ? paddedDays.length : i + 7));
    }

    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: weeks.map((week) {
          return Column(
            children: week.map((entry) {
              final (dateStr, enacted) = entry;
              if (dateStr == null) {
                return const SizedBox(width: 14, height: 14);
              }
              return Padding(
                padding: const EdgeInsets.all(1),
                child: HeatmapCell(enacted: enacted),
              );
            }).toList(),
          );
        }).toList(),
      ),
    );
  }
}

/// A single cell in the heatmap grid.
class HeatmapCell extends StatelessWidget {
  const HeatmapCell({required this.enacted, super.key});

  /// true = green (enacted), false = red (missed), null = grey (no log).
  final bool? enacted;

  @override
  Widget build(BuildContext context) {
    final Color color;
    if (enacted == true) {
      color = const Color(0xFF45B700);
    } else if (enacted == false) {
      color = const Color(0xFFE53935);
    } else {
      color = const Color(0xFFE5E7EB);
    }
    return Container(
      width: 12,
      height: 12,
      decoration: BoxDecoration(
        color: color,
        borderRadius: BorderRadius.circular(2),
      ),
    );
  }
}
```

- [ ] **Step 4: Run test — verify it passes**

```bash
cd /Users/felixreinsch/Github/health-habit-hub-1/mobile && flutter test test/widget/habit_heatmap_test.dart 2>&1 | tail -5
```
Expected: 2 tests pass.

- [ ] **Step 5: Commit**

```bash
git add mobile/lib/widgets/habit_heatmap_widget.dart mobile/test/widget/habit_heatmap_test.dart
git commit -m "feat(flutter): add HabitHeatmapWidget with tests"
```

---

## Task 7: SrhiSparklineWidget

**Files:**
- Create: `mobile/lib/widgets/srhi_sparkline_widget.dart`

- [ ] **Step 1: Create the widget**

`fl_chart` is already in `pubspec.yaml`. Import `fl_chart/fl_chart.dart`.

```dart
// mobile/lib/widgets/srhi_sparkline_widget.dart
import 'package:fl_chart/fl_chart.dart';
import 'package:flutter/material.dart';
import '../features/my_habits/my_habits_models.dart';

/// A mini line chart showing the last N SRHI scores (1–7 scale).
/// Shown on the habit card after week 2; full chart on the detail screen.
class SrhiSparklineWidget extends StatelessWidget {
  const SrhiSparklineWidget({
    required this.trajectory,
    this.height = 48,
    super.key,
  });

  final List<SrhiTrajectoryPoint> trajectory;
  final double height;

  @override
  Widget build(BuildContext context) {
    final submitted = trajectory
        .where((p) => p.score != null)
        .toList();

    if (submitted.isEmpty) return const SizedBox.shrink();

    final spots = submitted.asMap().entries.map((e) {
      return FlSpot(e.key.toDouble(), e.value.score!);
    }).toList();

    return SizedBox(
      height: height,
      child: LineChart(
        LineChartData(
          minY: 1,
          maxY: 7,
          gridData: const FlGridData(show: false),
          titlesData: const FlTitlesData(show: false),
          borderData: FlBorderData(show: false),
          lineTouchData: const LineTouchData(enabled: false),
          lineBarsData: [
            LineChartBarData(
              spots: spots,
              isCurved: true,
              color: const Color(0xFF45B700),
              barWidth: 2,
              dotData: FlDotData(
                show: submitted.length <= 8,
                getDotPainter: (spot, percent, bar, index) =>
                    FlDotCirclePainter(
                  radius: 3,
                  color: const Color(0xFF45B700),
                  strokeWidth: 0,
                  strokeColor: Colors.transparent,
                ),
              ),
              belowBarData: BarAreaData(
                show: true,
                color: const Color(0xFF45B700).withAlpha(26),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
```

- [ ] **Step 2: Verify analysis**

```bash
cd /Users/felixreinsch/Github/health-habit-hub-1/mobile && flutter analyze lib/widgets/srhi_sparkline_widget.dart 2>&1 | head -10
```
Expected: `No issues found!`

- [ ] **Step 3: Commit**

```bash
git add mobile/lib/widgets/srhi_sparkline_widget.dart
git commit -m "feat(flutter): add SrhiSparklineWidget (fl_chart mini line chart)"
```

---

## Task 8: My Habits Screen (Tab Root)

**Files:**
- Create: `mobile/lib/features/my_habits/my_habits_screen.dart`
- Create: `mobile/test/widget/my_habits_screen_test.dart`

- [ ] **Step 1: Write the failing test (habit-config gate)**

```dart
// mobile/test/widget/my_habits_screen_test.dart
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hhh/features/my_habits/my_habits_models.dart';
import 'package:hhh/features/my_habits/my_habits_provider.dart';
import 'package:hhh/features/my_habits/my_habits_screen.dart';
import 'package:hhh/features/my_habits/my_habits_service.dart';
import 'package:hhh/l10n/app_localizations.dart';

final _fakeDio = Dio();

class _FakeMyHabitsService extends MyHabitsService {
  _FakeMyHabitsService({
    required this.config,
    required this.intentions,
    this.dueSrhi = const [],
  }) : super(dio: _fakeDio);

  final HabitConfig config;
  final List<Intention> intentions;
  final List<SrhiWindow> dueSrhi;

  @override
  Future<HabitConfig> fetchHabitConfig() async => config;

  @override
  Future<List<Intention>> listIntentions() async => intentions;

  @override
  Future<List<SrhiWindow>> fetchDueSrhi() async => dueSrhi;
}

Widget _buildSubject({
  required HabitConfig config,
  required List<Intention> intentions,
  List<SrhiWindow> dueSrhi = const [],
}) {
  final fakeService = _FakeMyHabitsService(
    config: config,
    intentions: intentions,
    dueSrhi: dueSrhi,
  );
  return ProviderScope(
    overrides: [
      myHabitsServiceProvider.overrideWithValue(fakeService),
    ],
    child: MaterialApp(
      localizationsDelegates: AppLocalizations.localizationsDelegates,
      supportedLocales: AppLocalizations.supportedLocales,
      home: const MyHabitsScreen(),
    ),
  );
}

const _activeIntention = Intention(
  id: 'intent-1',
  behaviorKey: 'walking',
  behaviorLabel: 'Walking',
  durationMinutes: 20,
  cues: [IntentionCue(text: 'After dinner', source: 'pre_rated')],
  intentionStatement: 'After dinner, I will walk for 20 minutes.',
  status: 'active',
  createdAt: DateTime(2026, 1, 1),
);

void main() {
  testWidgets(
      'maxHabits=1 hides New Habit button when one active intention exists',
      (tester) async {
    await tester.pumpWidget(_buildSubject(
      config: const HabitConfig(
        cueCount: 'single',
        cueSource: 'high_quality',
        behaviorOptions: ['walking'],
        maxHabits: 1,
        srhiItems: [],
      ),
      intentions: const [_activeIntention],
    ));
    await tester.pumpAndSettle();

    expect(find.text('New Habit'), findsNothing);
  });

  testWidgets('New Habit button shown when maxHabits is null', (tester) async {
    await tester.pumpWidget(_buildSubject(
      config: const HabitConfig(
        cueCount: 'multi',
        cueSource: 'high_quality',
        behaviorOptions: ['walking'],
        maxHabits: null,
        srhiItems: [],
      ),
      intentions: const [_activeIntention],
    ));
    await tester.pumpAndSettle();

    expect(find.text('New Habit'), findsOneWidget);
  });

  testWidgets('shows empty state when no intentions', (tester) async {
    await tester.pumpWidget(_buildSubject(
      config: const HabitConfig(
        cueCount: 'multi',
        cueSource: 'high_quality',
        behaviorOptions: ['walking'],
        maxHabits: null,
        srhiItems: [],
      ),
      intentions: const [],
    ));
    await tester.pumpAndSettle();

    expect(find.textContaining('No habits yet'), findsOneWidget);
  });

  testWidgets('shows SRHI prompt card when windows are due', (tester) async {
    await tester.pumpWidget(_buildSubject(
      config: const HabitConfig(
        cueCount: 'multi',
        cueSource: 'high_quality',
        behaviorOptions: ['walking'],
        maxHabits: null,
        srhiItems: [],
      ),
      intentions: const [_activeIntention],
      dueSrhi: [
        SrhiWindow(
          id: 'w1',
          intentionId: 'intent-1',
          weekNumber: 1,
          scheduledFor: DateTime(2026, 1, 7),
        ),
      ],
    ));
    await tester.pumpAndSettle();

    expect(find.textContaining('Weekly habit check-in'), findsOneWidget);
  });
}
```

- [ ] **Step 2: Run test — verify it fails**

```bash
cd /Users/felixreinsch/Github/health-habit-hub-1/mobile && flutter test test/widget/my_habits_screen_test.dart 2>&1 | head -15
```
Expected: FAIL — `MyHabitsScreen` not found.

- [ ] **Step 3: Implement `MyHabitsScreen`**

```dart
// mobile/lib/features/my_habits/my_habits_screen.dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../l10n/app_localizations.dart';
import '../../widgets/day_strip_widget.dart';
import '../../widgets/srhi_sparkline_widget.dart';
import 'my_habits_models.dart';
import 'my_habits_provider.dart';
import 'my_habits_service.dart';

class MyHabitsScreen extends ConsumerWidget {
  const MyHabitsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context)!;
    final configAsync = ref.watch(habitConfigProvider);
    final intentionsAsync = ref.watch(intentionsProvider);
    final dueSrhiAsync = ref.watch(dueSrhiProvider);

    return Scaffold(
      appBar: AppBar(
        title: Text(l10n.myHabitsTab),
        actions: [
          // New Habit button — hidden when maxHabits limit is reached.
          configAsync.when(
            data: (config) {
              final activeCount = intentionsAsync.value
                      ?.where((i) => i.status == 'active')
                      .length ??
                  0;
              final limitReached =
                  config.maxHabits != null && activeCount >= config.maxHabits!;
              if (limitReached) return const SizedBox.shrink();
              return TextButton(
                onPressed: () => context.push('/habits/new/behavior'),
                child: Text(l10n.newHabit),
              );
            },
            loading: () => const SizedBox.shrink(),
            error: (_, __) => const SizedBox.shrink(),
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () async {
          ref.invalidate(habitConfigProvider);
          ref.invalidate(intentionsProvider);
          ref.invalidate(dueSrhiProvider);
        },
        child: CustomScrollView(
          slivers: [
            // SRHI prompt card (shown when windows are due)
            dueSrhiAsync.when(
              data: (windows) {
                if (windows.isEmpty) return const SliverToBoxAdapter(child: SizedBox.shrink());
                return SliverToBoxAdapter(
                  child: _SrhiPromptCard(windows: windows),
                );
              },
              loading: () => const SliverToBoxAdapter(child: SizedBox.shrink()),
              error: (_, __) => const SliverToBoxAdapter(child: SizedBox.shrink()),
            ),

            // Habit list
            intentionsAsync.when(
              data: (intentions) {
                final active = intentions.where((i) => i.status == 'active').toList();
                if (active.isEmpty) {
                  return SliverFillRemaining(
                    child: Center(
                      child: Padding(
                        padding: const EdgeInsets.all(32),
                        child: Text(
                          l10n.noHabitsYet,
                          textAlign: TextAlign.center,
                          style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                                color: Theme.of(context).colorScheme.onSurface.withAlpha(128),
                              ),
                        ),
                      ),
                    ),
                  );
                }
                return SliverList.builder(
                  itemCount: active.length,
                  itemBuilder: (context, i) => _HabitCard(intention: active[i]),
                );
              },
              loading: () => const SliverFillRemaining(
                child: Center(child: CircularProgressIndicator()),
              ),
              error: (e, _) => SliverFillRemaining(
                child: Center(child: Text(e.toString())),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _SrhiPromptCard extends StatelessWidget {
  const _SrhiPromptCard({required this.windows});
  final List<SrhiWindow> windows;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    final first = windows.first;
    return Card(
      margin: const EdgeInsets.all(16),
      color: const Color(0xFFEDF7E5),
      child: ListTile(
        leading: const Icon(Icons.psychology, color: Color(0xFF45B700)),
        title: Text(l10n.srhiCheckInTitle,
            style: const TextStyle(fontWeight: FontWeight.w700)),
        subtitle: Text(l10n.srhiCheckInSubtitle),
        trailing: FilledButton(
          style: FilledButton.styleFrom(minimumSize: Size.zero),
          onPressed: () => context.push(
            '/habits/${first.intentionId}/srhi/${first.weekNumber}',
          ),
          child: Text(l10n.srhiStartButton),
        ),
      ),
    );
  }
}

class _HabitCard extends ConsumerWidget {
  const _HabitCard({required this.intention});
  final Intention intention;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context)!;
    final logsAsync = ref.watch(intentionLogsProvider(intention.id));
    final trajectoryAsync = ref.watch(srhiTrajectoryProvider(intention.id));

    // Build logs map for DayStrip.
    final logsMap = logsAsync.when(
      data: (logs) =>
          {for (final l in logs) l.date: l.enacted},
      loading: () => <String, bool>{},
      error: (_, __) => <String, bool>{},
    );

    // Today's date string.
    final today = DateTime.now();
    final todayStr =
        '${today.year}-${today.month.toString().padLeft(2, '0')}-${today.day.toString().padLeft(2, '0')}';
    final todayLogged = logsMap.containsKey(todayStr);

    return Card(
      margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
      child: InkWell(
        borderRadius: BorderRadius.circular(20),
        onTap: () => context.push('/habits/${intention.id}'),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(intention.behaviorLabel,
                  style: Theme.of(context).textTheme.titleMedium?.copyWith(
                        fontWeight: FontWeight.w700,
                      )),
              const SizedBox(height: 4),
              Text(
                intention.intentionStatement,
                style: Theme.of(context).textTheme.bodySmall?.copyWith(
                      color: Theme.of(context).colorScheme.onSurface.withAlpha(153),
                    ),
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
              ),
              const SizedBox(height: 12),
              DayStripWidget(
                logs: logsMap,
                startDate: intention.createdAt,
              ),
              // Sparkline after ≥2 submitted SRHI weeks.
              trajectoryAsync.when(
                data: (trajectory) {
                  final submitted = trajectory.where((p) => p.score != null).length;
                  if (submitted < 2) return const SizedBox.shrink();
                  return Padding(
                    padding: const EdgeInsets.only(top: 8),
                    child: SrhiSparklineWidget(trajectory: trajectory),
                  );
                },
                loading: () => const SizedBox.shrink(),
                error: (_, __) => const SizedBox.shrink(),
              ),
              const SizedBox(height: 12),
              Align(
                alignment: Alignment.centerRight,
                child: FilledButton(
                  style: FilledButton.styleFrom(
                    minimumSize: Size.zero,
                    padding: const EdgeInsets.symmetric(
                        horizontal: 16, vertical: 8),
                  ),
                  onPressed: todayLogged
                      ? null
                      : () async {
                          await ref
                              .read(myHabitsServiceProvider)
                              .logDay(
                                intentionId: intention.id,
                                date: todayStr,
                                enacted: true,
                              );
                          ref.invalidate(intentionLogsProvider(intention.id));
                        },
                  child: Text(
                      todayLogged ? l10n.loggedToday : l10n.logToday),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
```

- [ ] **Step 4: Run test — verify it passes**

```bash
cd /Users/felixreinsch/Github/health-habit-hub-1/mobile && flutter test test/widget/my_habits_screen_test.dart 2>&1 | tail -8
```
Expected: 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add mobile/lib/features/my_habits/my_habits_screen.dart mobile/test/widget/my_habits_screen_test.dart
git commit -m "feat(flutter): add MyHabitsScreen with habit cards and SRHI prompt"
```

---

## Task 9: New Habit Flow — Screen 1 (Pick Behavior)

**Files:**
- Create: `mobile/lib/features/my_habits/new_habit_screen_1_behavior.dart`

- [ ] **Step 1: Create the screen**

```dart
// mobile/lib/features/my_habits/new_habit_screen_1_behavior.dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../l10n/app_localizations.dart';
import 'my_habits_provider.dart';

/// Labels for the behavior keys returned by the backend.
const _behaviorLabels = {
  'walking': 'Walking',
  'light_jogging': 'Light jogging',
  'cycling': 'Cycling',
  'structured_calisthenics': 'Structured calisthenics',
  'yoga': 'Yoga',
};

class PickBehaviorScreen extends ConsumerWidget {
  const PickBehaviorScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context)!;
    final configAsync = ref.watch(habitConfigProvider);

    return Scaffold(
      appBar: AppBar(title: Text(l10n.newHabit)),
      body: configAsync.when(
        loading: () =>
            const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text(e.toString())),
        data: (config) {
          return Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Padding(
                padding:
                    const EdgeInsets.fromLTRB(20, 20, 20, 8),
                child: Text(
                  l10n.pickBehaviorTitle,
                  style: Theme.of(context)
                      .textTheme
                      .titleLarge
                      ?.copyWith(fontWeight: FontWeight.w700),
                ),
              ),
              Expanded(
                child: ListView.separated(
                  padding: const EdgeInsets.symmetric(
                      horizontal: 16, vertical: 8),
                  itemCount: config.behaviorOptions.length,
                  separatorBuilder: (_, __) =>
                      const SizedBox(height: 8),
                  itemBuilder: (context, i) {
                    final key = config.behaviorOptions[i];
                    final label =
                        _behaviorLabels[key] ?? key;
                    return Card(
                      child: ListTile(
                        title: Text(label),
                        trailing: const Icon(
                            Icons.arrow_forward_ios, size: 16),
                        onTap: () => context.push(
                          '/habits/new/cue',
                          extra: {
                            'behaviorKey': key,
                            'behaviorLabel': label,
                            'config': config,
                          },
                        ),
                      ),
                    );
                  },
                ),
              ),
            ],
          );
        },
      ),
    );
  }
}
```

- [ ] **Step 2: Verify analysis**

```bash
cd /Users/felixreinsch/Github/health-habit-hub-1/mobile && flutter analyze lib/features/my_habits/new_habit_screen_1_behavior.dart 2>&1 | head -10
```
Expected: `No issues found!`

- [ ] **Step 3: Commit**

```bash
git add mobile/lib/features/my_habits/new_habit_screen_1_behavior.dart
git commit -m "feat(flutter): add PickBehaviorScreen (new habit step 1)"
```

---

## Task 10: New Habit Flow — Screen 2 (Set Cue)

**Files:**
- Create: `mobile/lib/features/my_habits/new_habit_screen_2_cue.dart`

- [ ] **Step 1: Create the screen**

```dart
// mobile/lib/features/my_habits/new_habit_screen_2_cue.dart
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../../l10n/app_localizations.dart';
import 'my_habits_models.dart';

class SetCueScreen extends StatefulWidget {
  const SetCueScreen({
    required this.behaviorKey,
    required this.behaviorLabel,
    required this.config,
    super.key,
  });

  final String behaviorKey;
  final String behaviorLabel;
  final HabitConfig config;

  @override
  State<SetCueScreen> createState() => _SetCueScreenState();
}

class _SetCueScreenState extends State<SetCueScreen> {
  final _cue1Controller = TextEditingController();
  final _cue2Controller = TextEditingController();
  String? _error;

  @override
  void dispose() {
    _cue1Controller.dispose();
    _cue2Controller.dispose();
    super.dispose();
  }

  void _onNext() {
    final l10n = AppLocalizations.of(context)!;
    final isPreRated = widget.config.cueSource != 'self_selected';

    if (!isPreRated) {
      if (_cue1Controller.text.trim().length < 10) {
        setState(() => _error = l10n.setCueTooShort);
        return;
      }
      if (widget.config.cueCount == 'multi' &&
          _cue2Controller.text.trim().length < 10) {
        setState(() => _error = l10n.setCueTooShort);
        return;
      }
    }

    setState(() => _error = null);

    final List<IntentionCue> cues;
    if (isPreRated) {
      // Pre-rated: cue text is the full behaviour label as placeholder
      // (in a real deployment the cue comes from the cue pool; here we use
      // the config metadata as a placeholder until cue-pool lookup is added).
      cues = [
        IntentionCue(
          text: 'Your assigned cue for ${widget.behaviorLabel}',
          source: 'pre_rated',
        ),
        if (widget.config.cueCount == 'multi')
          const IntentionCue(
            text: 'at your usual location',
            source: 'pre_rated',
          ),
      ];
    } else {
      cues = [
        IntentionCue(
          text: _cue1Controller.text.trim(),
          source: 'self_selected',
        ),
        if (widget.config.cueCount == 'multi' &&
            _cue2Controller.text.trim().isNotEmpty)
          IntentionCue(
            text: _cue2Controller.text.trim(),
            source: 'self_selected',
          ),
      ];
    }

    context.push(
      '/habits/new/confirm',
      extra: {
        'behaviorKey': widget.behaviorKey,
        'behaviorLabel': widget.behaviorLabel,
        'config': widget.config,
        'cues': cues,
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    final isPreRated = widget.config.cueSource != 'self_selected';
    final isMulti = widget.config.cueCount == 'multi';

    return Scaffold(
      appBar: AppBar(title: Text(l10n.setCueTitle)),
      body: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              isPreRated
                  ? l10n.setCuePreRatedInstruction
                  : l10n.setCueSelfSelectedInstruction,
              style: Theme.of(context).textTheme.bodyLarge,
            ),
            const SizedBox(height: 20),

            if (isPreRated) ...[
              // Show assigned cue(s) as read-only cards.
              Card(
                child: ListTile(
                  leading: const Icon(Icons.location_on),
                  title: Text('Your assigned cue for ${widget.behaviorLabel}'),
                  subtitle: Text(
                    widget.config.cueCount == 'multi'
                        ? 'Cue 1 of 2 (assigned by study)'
                        : 'Assigned by study',
                  ),
                ),
              ),
              if (isMulti)
                const Card(
                  child: ListTile(
                    leading: Icon(Icons.add_location),
                    title: Text('at your usual location'),
                    subtitle: Text('Cue 2 of 2 (assigned by study)'),
                  ),
                ),
            ] else ...[
              // Self-selected free-text input.
              TextField(
                controller: _cue1Controller,
                decoration: InputDecoration(
                  labelText: isMulti ? 'Cue 1' : 'Your cue',
                  hintText: l10n.setCuePlaceholder,
                  border: const OutlineInputBorder(),
                ),
                maxLength: 200,
                onChanged: (_) => setState(() => _error = null),
              ),
              if (isMulti) ...[
                const SizedBox(height: 12),
                TextField(
                  controller: _cue2Controller,
                  decoration: const InputDecoration(
                    labelText: 'Cue 2 (optional context)',
                    hintText: 'e.g. at home on weekdays',
                    border: OutlineInputBorder(),
                  ),
                  maxLength: 200,
                  onChanged: (_) => setState(() => _error = null),
                ),
              ],
            ],

            if (_error != null) ...[
              const SizedBox(height: 8),
              Text(_error!,
                  style: TextStyle(
                      color: Theme.of(context).colorScheme.error)),
            ],

            const Spacer(),
            FilledButton(
              onPressed: _onNext,
              child: const Text('Next'),
            ),
          ],
        ),
      ),
    );
  }
}
```

- [ ] **Step 2: Verify analysis**

```bash
cd /Users/felixreinsch/Github/health-habit-hub-1/mobile && flutter analyze lib/features/my_habits/new_habit_screen_2_cue.dart 2>&1 | head -10
```
Expected: `No issues found!`

- [ ] **Step 3: Commit**

```bash
git add mobile/lib/features/my_habits/new_habit_screen_2_cue.dart
git commit -m "feat(flutter): add SetCueScreen (new habit step 2)"
```

---

## Task 11: New Habit Flow — Screen 3 (Confirm Plan)

**Files:**
- Create: `mobile/lib/features/my_habits/new_habit_screen_3_confirm.dart`

- [ ] **Step 1: Create the screen**

```dart
// mobile/lib/features/my_habits/new_habit_screen_3_confirm.dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../l10n/app_localizations.dart';
import 'my_habits_models.dart';
import 'my_habits_provider.dart';
import 'my_habits_service.dart';

class ConfirmPlanScreen extends ConsumerStatefulWidget {
  const ConfirmPlanScreen({
    required this.behaviorKey,
    required this.behaviorLabel,
    required this.config,
    required this.cues,
    super.key,
  });

  final String behaviorKey;
  final String behaviorLabel;
  final HabitConfig config;
  final List<IntentionCue> cues;

  @override
  ConsumerState<ConfirmPlanScreen> createState() =>
      _ConfirmPlanScreenState();
}

class _ConfirmPlanScreenState extends ConsumerState<ConfirmPlanScreen> {
  int _durationMinutes = 20;
  bool _submitting = false;
  String? _error;

  String get _intentionStatement {
    final cueText = widget.cues.map((c) => c.text).join(', ');
    return '$cueText, I will ${widget.behaviorLabel.toLowerCase()} for $_durationMinutes minutes.';
  }

  Future<void> _submit() async {
    final l10n = AppLocalizations.of(context)!;
    setState(() {
      _submitting = true;
      _error = null;
    });
    try {
      await ref.read(myHabitsServiceProvider).createIntention(
            behaviorKey: widget.behaviorKey,
            behaviorLabel: widget.behaviorLabel,
            durationMinutes: _durationMinutes,
            cues: widget.cues,
            intentionStatement: _intentionStatement,
          );
      ref.invalidate(intentionsProvider);
      if (mounted) context.go('/habits');
    } on ValidationException {
      setState(() => _error = l10n.habitLimitReached);
    } catch (e) {
      setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;

    return Scaffold(
      appBar: AppBar(title: Text(l10n.confirmPlanTitle)),
      body: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(l10n.confirmPlanSubtitle,
                style: Theme.of(context).textTheme.bodyLarge),
            const SizedBox(height: 24),

            // Intention statement preview card.
            Card(
              color: const Color(0xFFEDF7E5),
              child: Padding(
                padding: const EdgeInsets.all(20),
                child: Text(
                  _intentionStatement,
                  style: Theme.of(context).textTheme.titleMedium?.copyWith(
                        fontWeight: FontWeight.w600,
                        height: 1.5,
                      ),
                ),
              ),
            ),
            const SizedBox(height: 24),

            // Duration selector.
            Text(l10n.durationLabel,
                style: Theme.of(context).textTheme.labelLarge),
            const SizedBox(height: 8),
            Row(
              children: [15, 20, 30, 45, 60].map((mins) {
                final selected = _durationMinutes == mins;
                return Padding(
                  padding: const EdgeInsets.only(right: 8),
                  child: ChoiceChip(
                    label: Text('$mins min'),
                    selected: selected,
                    onSelected: (_) =>
                        setState(() => _durationMinutes = mins),
                  ),
                );
              }).toList(),
            ),

            if (_error != null) ...[
              const SizedBox(height: 16),
              Text(_error!,
                  style: TextStyle(
                      color: Theme.of(context).colorScheme.error)),
            ],

            const Spacer(),
            FilledButton(
              onPressed: _submitting ? null : _submit,
              child: _submitting
                  ? const SizedBox(
                      width: 20,
                      height: 20,
                      child: CircularProgressIndicator(
                          strokeWidth: 2, color: Colors.white),
                    )
                  : Text(l10n.createHabit),
            ),
          ],
        ),
      ),
    );
  }
}
```

- [ ] **Step 2: Verify analysis**

```bash
cd /Users/felixreinsch/Github/health-habit-hub-1/mobile && flutter analyze lib/features/my_habits/new_habit_screen_3_confirm.dart 2>&1 | head -10
```
Expected: `No issues found!`

- [ ] **Step 3: Commit**

```bash
git add mobile/lib/features/my_habits/new_habit_screen_3_confirm.dart
git commit -m "feat(flutter): add ConfirmPlanScreen (new habit step 3)"
```

---

## Task 12: Habit Detail Screen

**Files:**
- Create: `mobile/lib/features/my_habits/habit_detail_screen.dart`

- [ ] **Step 1: Create the screen**

```dart
// mobile/lib/features/my_habits/habit_detail_screen.dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../l10n/app_localizations.dart';
import '../../widgets/habit_heatmap_widget.dart';
import '../../widgets/srhi_sparkline_widget.dart';
import 'my_habits_models.dart';
import 'my_habits_provider.dart';
import 'my_habits_service.dart';

class HabitDetailScreen extends ConsumerWidget {
  const HabitDetailScreen({required this.intentionId, super.key});

  final String intentionId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context)!;
    final intentionsAsync = ref.watch(intentionsProvider);
    final logsAsync = ref.watch(intentionLogsProvider(intentionId));
    final trajectoryAsync = ref.watch(srhiTrajectoryProvider(intentionId));

    final intention = intentionsAsync.value?.firstWhere(
      (i) => i.id == intentionId,
      orElse: () => throw StateError('not found'),
    );

    return Scaffold(
      appBar: AppBar(
        title: Text(l10n.habitDetailTitle),
        actions: [
          if (intention != null && intention.status == 'active')
            PopupMenuButton<String>(
              onSelected: (value) async {
                if (value == 'abandon') {
                  final confirmed = await showDialog<bool>(
                    context: context,
                    builder: (_) => AlertDialog(
                      title: Text(l10n.abandonHabit),
                      content: Text(l10n.abandonConfirm),
                      actions: [
                        TextButton(
                          onPressed: () => Navigator.pop(context, false),
                          child: Text(l10n.cancel),
                        ),
                        FilledButton(
                          onPressed: () => Navigator.pop(context, true),
                          child: Text(l10n.confirm),
                        ),
                      ],
                    ),
                  );
                  if (confirmed == true) {
                    await ref
                        .read(myHabitsServiceProvider)
                        .updateStatus(intentionId, 'abandoned');
                    ref.invalidate(intentionsProvider);
                    if (context.mounted) context.pop();
                  }
                }
              },
              itemBuilder: (_) => [
                PopupMenuItem(
                  value: 'abandon',
                  child: Text(l10n.abandonHabit),
                ),
              ],
            ),
        ],
      ),
      body: intentionsAsync.when(
        loading: () =>
            const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text(e.toString())),
        data: (_) {
          if (intention == null) {
            return Center(child: Text(l10n.habitDetailTitle));
          }
          return RefreshIndicator(
            onRefresh: () async {
              ref.invalidate(intentionLogsProvider(intentionId));
              ref.invalidate(srhiTrajectoryProvider(intentionId));
            },
            child: ListView(
              padding: const EdgeInsets.all(16),
              children: [
                // Header card
                Card(
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(intention.behaviorLabel,
                            style: Theme.of(context)
                                .textTheme
                                .titleLarge
                                ?.copyWith(
                                    fontWeight: FontWeight.w700)),
                        const SizedBox(height: 8),
                        Text(intention.intentionStatement,
                            style: Theme.of(context)
                                .textTheme
                                .bodyMedium),
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: 16),

                // Heatmap
                Text(l10n.heatmapTitle,
                    style: Theme.of(context)
                        .textTheme
                        .titleMedium
                        ?.copyWith(fontWeight: FontWeight.w700)),
                const SizedBox(height: 8),
                logsAsync.when(
                  data: (logs) {
                    if (logs.isEmpty) {
                      return Text(l10n.noLogsYet,
                          style: Theme.of(context)
                              .textTheme
                              .bodySmall
                              ?.copyWith(color: Colors.grey));
                    }
                    final logsMap = {
                      for (final l in logs) l.date: l.enacted
                    };
                    return HabitHeatmapWidget(
                      logs: logsMap,
                      startDate: intention.createdAt,
                    );
                  },
                  loading: () =>
                      const LinearProgressIndicator(),
                  error: (e, _) => Text(e.toString()),
                ),
                const SizedBox(height: 24),

                // SRHI trajectory
                Text(l10n.trajectoryTitle,
                    style: Theme.of(context)
                        .textTheme
                        .titleMedium
                        ?.copyWith(fontWeight: FontWeight.w700)),
                const SizedBox(height: 8),
                trajectoryAsync.when(
                  data: (trajectory) {
                    final submitted = trajectory
                        .where((p) => p.score != null)
                        .toList();
                    if (submitted.isEmpty) {
                      return Text(l10n.noTrajectoryYet,
                          style: Theme.of(context)
                              .textTheme
                              .bodySmall
                              ?.copyWith(color: Colors.grey));
                    }
                    return SrhiSparklineWidget(
                      trajectory: trajectory,
                      height: 120,
                    );
                  },
                  loading: () =>
                      const LinearProgressIndicator(),
                  error: (e, _) => Text(e.toString()),
                ),
              ],
            ),
          );
        },
      ),
    );
  }
}
```

- [ ] **Step 2: Verify analysis**

```bash
cd /Users/felixreinsch/Github/health-habit-hub-1/mobile && flutter analyze lib/features/my_habits/habit_detail_screen.dart 2>&1 | head -10
```
Expected: `No issues found!`

- [ ] **Step 3: Commit**

```bash
git add mobile/lib/features/my_habits/habit_detail_screen.dart
git commit -m "feat(flutter): add HabitDetailScreen with heatmap and trajectory"
```

---

## Task 13: SRHI Form Screen

**Files:**
- Create: `mobile/lib/features/my_habits/srhi_form_screen.dart`
- Create: `mobile/test/widget/srhi_form_test.dart`

- [ ] **Step 1: Write the failing test**

```dart
// mobile/test/widget/srhi_form_test.dart
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hhh/features/my_habits/my_habits_models.dart';
import 'package:hhh/features/my_habits/my_habits_service.dart';
import 'package:hhh/features/my_habits/srhi_form_screen.dart';
import 'package:hhh/l10n/app_localizations.dart';

final _fakeDio = Dio();

class _FakeMyHabitsService extends MyHabitsService {
  _FakeMyHabitsService() : super(dio: _fakeDio);

  @override
  Future<SrhiTrajectoryPoint> submitSrhi({
    required String intentionId,
    required int weekNumber,
    required Map<String, int> items,
  }) async => SrhiTrajectoryPoint(weekNumber: weekNumber, score: 5.0);
}

Widget _buildSubject(List<SrhiItem> items) {
  return ProviderScope(
    overrides: [
      myHabitsServiceProvider
          .overrideWithValue(_FakeMyHabitsService()),
    ],
    child: MaterialApp(
      localizationsDelegates: AppLocalizations.localizationsDelegates,
      supportedLocales: AppLocalizations.supportedLocales,
      home: SrhiFormScreen(
        intentionId: 'intent-1',
        weekNumber: 1,
        behaviorLabel: 'Walking',
        srhiItems: items,
      ),
    ),
  );
}

final _twelveItems = List.generate(
  12,
  (i) => SrhiItem(
    id: 'srhi_${i + 1}',
    en: 'I do item ${i + 1}',
    de: 'Artikel ${i + 1}',
  ),
);

void main() {
  testWidgets('Submit button is disabled until all 12 items answered',
      (tester) async {
    await tester.pumpWidget(_buildSubject(_twelveItems));
    await tester.pump();

    // Submit button should be disabled initially.
    final submitButton = tester.widget<FilledButton>(
      find.widgetWithText(FilledButton, 'Submit'),
    );
    expect(submitButton.onPressed, isNull);
  });

  testWidgets('Submit button enabled after all 12 sliders are moved',
      (tester) async {
    await tester.pumpWidget(_buildSubject(_twelveItems));
    await tester.pump();

    // Drag all 12 sliders to a non-null value.
    for (int i = 0; i < 12; i++) {
      final sliders = find.byType(Slider);
      final slider = tester.widget<Slider>(sliders.at(i));
      // Use the Slider's SemanticAction to set value.
      await tester.drag(sliders.at(i), const Offset(20, 0));
      await tester.pump();
    }

    final submitButton = tester.widget<FilledButton>(
      find.widgetWithText(FilledButton, 'Submit'),
    );
    expect(submitButton.onPressed, isNotNull);
  });
}
```

- [ ] **Step 2: Run test — verify it fails**

```bash
cd /Users/felixreinsch/Github/health-habit-hub-1/mobile && flutter test test/widget/srhi_form_test.dart 2>&1 | head -15
```
Expected: FAIL — `SrhiFormScreen` not found.

- [ ] **Step 3: Implement `SrhiFormScreen`**

```dart
// mobile/lib/features/my_habits/srhi_form_screen.dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../l10n/app_localizations.dart';
import 'my_habits_models.dart';
import 'my_habits_provider.dart';
import 'my_habits_service.dart';

class SrhiFormScreen extends ConsumerStatefulWidget {
  const SrhiFormScreen({
    required this.intentionId,
    required this.weekNumber,
    required this.behaviorLabel,
    required this.srhiItems,
    super.key,
  });

  final String intentionId;
  final int weekNumber;
  final String behaviorLabel;
  final List<SrhiItem> srhiItems;

  @override
  ConsumerState<SrhiFormScreen> createState() => _SrhiFormScreenState();
}

class _SrhiFormScreenState extends ConsumerState<SrhiFormScreen> {
  // null means unanswered; values 1–7.
  late final Map<String, int?> _answers;
  bool _submitting = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _answers = {for (final item in widget.srhiItems) item.id: null};
  }

  bool get _allAnswered =>
      _answers.values.every((v) => v != null);

  Future<void> _submit() async {
    final l10n = AppLocalizations.of(context)!;
    if (!_allAnswered) {
      setState(() => _error = l10n.srhiSubmitIncomplete);
      return;
    }
    setState(() {
      _submitting = true;
      _error = null;
    });
    try {
      await ref.read(myHabitsServiceProvider).submitSrhi(
            intentionId: widget.intentionId,
            weekNumber: widget.weekNumber,
            items: _answers.map((k, v) => MapEntry(k, v!)),
          );
      ref.invalidate(dueSrhiProvider);
      ref.invalidate(srhiTrajectoryProvider(widget.intentionId));
      if (mounted) context.pop();
    } catch (e) {
      setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    final locale = Localizations.localeOf(context).languageCode;

    return Scaffold(
      appBar: AppBar(title: Text(l10n.srhiFormTitle)),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 16, 20, 8),
            child: Text(
              l10n.srhiStem(widget.behaviorLabel),
              style: Theme.of(context)
                  .textTheme
                  .titleMedium
                  ?.copyWith(fontWeight: FontWeight.w700),
            ),
          ),
          Expanded(
            child: ListView.builder(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              itemCount: widget.srhiItems.length,
              itemBuilder: (context, i) {
                final item = widget.srhiItems[i];
                final text = locale == 'de' ? item.de : item.en;
                final value = _answers[item.id];
                return Card(
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('${i + 1}. …$text',
                            style:
                                Theme.of(context).textTheme.bodyMedium),
                        Row(
                          children: [
                            const Text('1',
                                style: TextStyle(fontSize: 11)),
                            Expanded(
                              child: Slider(
                                min: 1,
                                max: 7,
                                divisions: 6,
                                value: (value ?? 0).toDouble(),
                                onChanged: (v) => setState(
                                  () => _answers[item.id] =
                                      v.round(),
                                ),
                              ),
                            ),
                            const Text('7',
                                style: TextStyle(fontSize: 11)),
                            SizedBox(
                              width: 24,
                              child: Text(
                                value != null ? '$value' : '–',
                                style: Theme.of(context)
                                    .textTheme
                                    .labelLarge
                                    ?.copyWith(
                                        color: value != null
                                            ? const Color(0xFF45B700)
                                            : Colors.grey),
                                textAlign: TextAlign.center,
                              ),
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),
                );
              },
            ),
          ),
          if (_error != null)
            Padding(
              padding: const EdgeInsets.symmetric(
                  horizontal: 16, vertical: 4),
              child: Text(_error!,
                  style: TextStyle(
                      color: Theme.of(context).colorScheme.error,
                      fontSize: 13)),
            ),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
            child: FilledButton(
              onPressed: (_allAnswered && !_submitting) ? _submit : null,
              child: _submitting
                  ? const SizedBox(
                      width: 20,
                      height: 20,
                      child: CircularProgressIndicator(
                          strokeWidth: 2, color: Colors.white),
                    )
                  : Text(l10n.srhiSubmit),
            ),
          ),
        ],
      ),
    );
  }
}
```

- [ ] **Step 4: Run test — verify it passes**

```bash
cd /Users/felixreinsch/Github/health-habit-hub-1/mobile && flutter test test/widget/srhi_form_test.dart 2>&1 | tail -8
```
Expected: 2 tests pass.

- [ ] **Step 5: Commit**

```bash
git add mobile/lib/features/my_habits/srhi_form_screen.dart mobile/test/widget/srhi_form_test.dart
git commit -m "feat(flutter): add SrhiFormScreen with 12-item form and submit gate"
```

---

## Task 14: Shell Tab + Router Wiring

**Files:**
- Modify: `mobile/lib/screens/shell_screen.dart`
- Modify: `mobile/lib/main.dart`

- [ ] **Step 1: Add "Habits" tab to `shell_screen.dart`**

Open `mobile/lib/screens/shell_screen.dart`. Change `_allTabs` to insert the Habits tab at index 2 and update `_adminBranchIndex`:

```dart
  static const _allTabs = [
    _TabConfig(label: 'Share',   icon: Icons.volunteer_activism,    path: '/share'),
    _TabConfig(label: 'Explore', icon: Icons.hub,                   path: '/explore'),
    _TabConfig(label: 'Habits',  icon: Icons.self_improvement,      path: '/habits'),  // NEW
    _TabConfig(label: 'Recs',    icon: Icons.lightbulb,             path: '/recommend'),
    _TabConfig(label: 'Account', icon: Icons.manage_accounts,       path: '/settings'),
    _TabConfig(label: 'Admin',   icon: Icons.admin_panel_settings,  path: '/admin'),
  ];

  static const int _adminBranchIndex = 5;  // was 4
```

- [ ] **Step 2: Add the `/habits` branch and sub-routes to `main.dart`**

Add these imports at the top of `main.dart` (after the existing feature imports):

```dart
import 'features/my_habits/my_habits_screen.dart';
import 'features/my_habits/new_habit_screen_1_behavior.dart';
import 'features/my_habits/new_habit_screen_2_cue.dart';
import 'features/my_habits/new_habit_screen_3_confirm.dart';
import 'features/my_habits/habit_detail_screen.dart';
import 'features/my_habits/srhi_form_screen.dart';
import 'features/my_habits/my_habits_models.dart';
```

In `routerProvider`, after the `/explore` branch and before the `/recommend` branch, insert a new `StatefulShellBranch`:

```dart
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: '/habits',
                builder: (context, state) => const MyHabitsScreen(),
                routes: [
                  GoRoute(
                    path: 'new/behavior',
                    builder: (context, state) =>
                        const PickBehaviorScreen(),
                  ),
                  GoRoute(
                    path: 'new/cue',
                    builder: (context, state) {
                      final extra =
                          state.extra as Map<String, dynamic>;
                      return SetCueScreen(
                        behaviorKey: extra['behaviorKey'] as String,
                        behaviorLabel:
                            extra['behaviorLabel'] as String,
                        config: extra['config'] as HabitConfig,
                      );
                    },
                  ),
                  GoRoute(
                    path: 'new/confirm',
                    builder: (context, state) {
                      final extra =
                          state.extra as Map<String, dynamic>;
                      return ConfirmPlanScreen(
                        behaviorKey: extra['behaviorKey'] as String,
                        behaviorLabel:
                            extra['behaviorLabel'] as String,
                        config: extra['config'] as HabitConfig,
                        cues: (extra['cues'] as List<dynamic>)
                            .cast<IntentionCue>(),
                      );
                    },
                  ),
                  GoRoute(
                    path: ':intentionId',
                    builder: (context, state) => HabitDetailScreen(
                      intentionId:
                          state.pathParameters['intentionId']!,
                    ),
                    routes: [
                      GoRoute(
                        path: 'srhi/:weekNumber',
                        builder: (context, state) {
                          final extra =
                              state.extra as Map<String, dynamic>?;
                          return SrhiFormScreen(
                            intentionId: state
                                .pathParameters['intentionId']!,
                            weekNumber: int.parse(
                                state.pathParameters['weekNumber']!),
                            behaviorLabel:
                                extra?['behaviorLabel'] as String? ??
                                    '',
                            srhiItems: (extra?['srhiItems']
                                        as List<dynamic>?)
                                    ?.cast<SrhiItem>() ??
                                const [],
                          );
                        },
                      ),
                    ],
                  ),
                ],
              ),
            ],
          ),
```

- [ ] **Step 3: Run flutter analyze**

```bash
cd /Users/felixreinsch/Github/health-habit-hub-1/mobile && flutter analyze 2>&1 | grep -E "^  error" | head -20
```
Expected: no errors. Fix any that appear (likely missing imports).

- [ ] **Step 4: Run the full test suite**

```bash
cd /Users/felixreinsch/Github/health-habit-hub-1/mobile && flutter test 2>&1 | tail -10
```
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add mobile/lib/screens/shell_screen.dart mobile/lib/main.dart
git commit -m "feat(flutter): wire My Habits tab and routes into shell"
```

---

## Task 15: Onboarding Routing — Study Code → Habits

**Files:**
- Modify: `mobile/lib/screens/onboarding/study_code_screen.dart`

- [ ] **Step 1: Read the current study code screen**

```bash
cat /Users/felixreinsch/Github/health-habit-hub-1/mobile/lib/screens/onboarding/study_code_screen.dart
```

Find the `context.go(...)` call that fires after a successful code redemption. It currently routes to `/share` (or `/donate`).

- [ ] **Step 2: Change the successful-redemption route to `/habits/new/behavior`**

Locate the line that navigates after success, e.g.:
```dart
context.go('/share');
```
or
```dart
context.go('/donate');
```

Change it to:
```dart
context.go('/habits/new/behavior');
```

- [ ] **Step 3: Run analyze and tests**

```bash
cd /Users/felixreinsch/Github/health-habit-hub-1/mobile && flutter analyze 2>&1 | grep "error" | head -5
cd /Users/felixreinsch/Github/health-habit-hub-1/mobile && flutter test 2>&1 | tail -5
```
Expected: no errors, all tests pass.

- [ ] **Step 4: Commit**

```bash
git add mobile/lib/screens/onboarding/study_code_screen.dart
git commit -m "feat(flutter): route study participants directly to new habit flow after code redemption"
```

---

## Task 16: Final Verification

- [ ] **Step 1: Run full test suite**

```bash
cd /Users/felixreinsch/Github/health-habit-hub-1/mobile && flutter gen-l10n && flutter test 2>&1 | tail -10
```
Expected: all tests pass.

- [ ] **Step 2: Run static analysis**

```bash
cd /Users/felixreinsch/Github/health-habit-hub-1/mobile && flutter analyze 2>&1 | tail -5
```
Expected: `No issues found!`

- [ ] **Step 3: Build web target to confirm no compile errors**

```bash
cd /Users/felixreinsch/Github/health-habit-hub-1/mobile && flutter build web --dart-define=API_BASE_URL=http://localhost:3000/api/v1 2>&1 | tail -5
```
Expected: `✓ Built build/web`
