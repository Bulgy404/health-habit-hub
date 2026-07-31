/// Data models for the My Habits feature.
library;

// mobile/lib/features/my_habits/my_habits_models.dart

/// A single SRHI item (id, English text, German text).
class SrhiItem {
  /// Creates a [SrhiItem].
  const SrhiItem({
    required this.id,
    required this.en,
    required this.de,
  });

  /// Unique question identifier.
  final String id;

  /// Question text in English.
  final String en;

  /// Question text in German.
  final String de;

  /// Deserialises from JSON.
  factory SrhiItem.fromJson(Map<String, dynamic> json) => SrhiItem(
        id: json['id'] as String,
        en: json['en'] as String,
        de: json['de'] as String,
      );
}

/// One selectable entry in the structured-activity catalog, already resolved
/// to the app's current language server-side (falls back to English, then
/// the raw key, if no translation exists for that activity type).
class BehaviorOption {
  /// Creates a [BehaviorOption].
  const BehaviorOption({required this.key, required this.label});

  /// Stable identifier submitted as `behaviorKey` when creating a habit.
  final String key;

  /// Display label in the app's current language.
  final String label;

  /// Deserialises from JSON.
  factory BehaviorOption.fromJson(Map<String, dynamic> json) => BehaviorOption(
        key: json['key'] as String? ?? '',
        label: json['label'] as String? ?? '',
      );
}

/// Resolved cue configuration returned by GET /api/v1/me/habit-config.
class HabitConfig {
  /// Creates a [HabitConfig].
  const HabitConfig({
    required this.cueCount,
    required this.cueSource,
    this.cuePoolId,
    required this.behaviorOptions,
    this.maxHabits,
    required this.srhiItems,
    this.assignedCues = const [],
    this.recommenderEnabled = true,
    this.guidedHabitCreationEnabled = true,
    this.communityShareDefault = true,
    this.onboardingEnabled = true,
    this.selfHabitCreationEnabled = true,
    this.habitStackingEnabled = true,
    this.reminderContentMode = 'generic',
    this.informationOverloadEnabled = false,
    this.informationOverloadOptOutAllowed = false,
  });

  /// Cue count mode: `'single'` or `'multi'`.
  final String cueCount;

  /// Cue source: `'low_quality'`, `'high_quality'`, or `'self_selected'`.
  final String cueSource;

  /// Optional pool ID for pre-rated cues.
  final String? cuePoolId;

  /// Structured activities the participant may choose from, localised to the
  /// app's current language. Empty means free-text habit entry.
  final List<BehaviorOption> behaviorOptions;

  /// Maximum allowed intentions; `null` = unlimited (public user).
  final int? maxHabits;

  /// SRHI question items to present at each weekly check-in.
  final List<SrhiItem> srhiItems;

  /// Cues pre-assigned by the study coordinator (empty for self-selected).
  final List<IntentionCue> assignedCues;

  /// Whether the recommender feature is enabled for this participant's study.
  /// Defaults to `true` (enabled) when absent, for backward compatibility.
  final bool recommenderEnabled;

  /// Whether the guided implementation-intention wizard (LLM stitch step) is
  /// enabled. When false, users compose their plan sentence as free text.
  /// Platform-wide flag set in the admin portal (Public App settings).
  /// Defaults to `true` when absent, for backward compatibility.
  final bool guidedHabitCreationEnabled;

  /// Whether the community-sharing opt-in is shown (pre-selected) at the end
  /// of habit creation. Platform-wide flag set in the admin portal (Public
  /// App settings). Defaults to `true` when absent, for backward
  /// compatibility.
  final bool communityShareDefault;

  /// Whether the first-time habit-creation onboarding (educational explainers
  /// for what a habit is and what cues are) should be shown. Resolved from the
  /// participant's study/group; defaults to `true` for public users.
  final bool onboardingEnabled;

  /// Whether the participant may create their own habits. When `false`, the
  /// "add habit" entry point is hidden. Resolved from the participant's
  /// study/group; defaults to `true` for public users.
  final bool selfHabitCreationEnabled;

  /// Whether the "stack onto an existing habit" cue option is offered
  /// (§7.1 Habit Stacking). Resolved from the participant's study/group;
  /// defaults to `true`.
  final bool habitStackingEnabled;

  /// Reminder copy mode: `'generic'` or `'implementation_intention'`
  /// (§7.2). Controls whether reminders repeat the plan's cue→behavior.
  final String reminderContentMode;

  /// Whether the §7.3 Information Overload guard is active for this
  /// participant (limits concurrent new habits per type). Defaults `false`.
  final bool informationOverloadEnabled;

  /// Whether the participant may opt out of the §7.3 guard. Only meaningful
  /// when [informationOverloadEnabled] is `true`. Defaults `false`.
  final bool informationOverloadOptOutAllowed;

  /// Deserialises from the habit-config API response.
  factory HabitConfig.fromJson(Map<String, dynamic> json) => HabitConfig(
        cueCount: json['cueCount'] as String? ?? 'multi',
        cueSource: json['cueSource'] as String? ?? 'high_quality',
        cuePoolId: json['cuePoolId'] as String?,
        behaviorOptions: (json['behaviorOptions'] as List<dynamic>?)
                ?.cast<Map<String, dynamic>>()
                .map(BehaviorOption.fromJson)
                .toList() ??
            const [],
        maxHabits: json['maxHabits'] as int?,
        srhiItems: (json['srhiItems'] as List<dynamic>?)
                ?.cast<Map<String, dynamic>>()
                .map(SrhiItem.fromJson)
                .toList() ??
            const [],
        assignedCues: (json['assignedCues'] as List<dynamic>?)
                ?.cast<Map<String, dynamic>>()
                .map(IntentionCue.fromJson)
                .toList() ??
            const [],
        recommenderEnabled: json['recommenderEnabled'] as bool? ?? true,
        guidedHabitCreationEnabled:
            json['guidedHabitCreationEnabled'] as bool? ?? true,
        communityShareDefault:
            json['communityShareDefault'] as bool? ?? true,
        onboardingEnabled: json['onboardingEnabled'] as bool? ?? true,
        selfHabitCreationEnabled:
            json['selfHabitCreationEnabled'] as bool? ?? true,
        habitStackingEnabled: json['habitStackingEnabled'] as bool? ?? true,
        reminderContentMode:
            json['reminderContentMode'] as String? ?? 'generic',
        informationOverloadEnabled:
            (json['informationOverloadGuard'] as Map<String, dynamic>?)?[
                    'enabled'] as bool? ??
                false,
        informationOverloadOptOutAllowed:
            (json['informationOverloadGuard'] as Map<String, dynamic>?)?[
                    'userOptOutAllowed'] as bool? ??
                false,
      );
}

/// A single cue attached to an implementation intention.
class IntentionCue {
  /// Creates an [IntentionCue].
  const IntentionCue({
    required this.text,
    required this.source,
    this.cueId,
  });

  /// Human-readable cue text (e.g. `'After my morning coffee'`).
  final String text;

  /// Cue provenance: `'pre_rated'` or `'self_selected'`.
  final String source;

  /// Backend ID of the cue when sourced from a cue pool.
  final String? cueId;

  /// Deserialises from JSON.
  factory IntentionCue.fromJson(Map<String, dynamic> json) => IntentionCue(
        text: json['text'] as String,
        source: json['source'] as String,
        cueId: json['cueId'] as String?,
      );

  /// Serialises to JSON.
  Map<String, dynamic> toJson() => {
        'text': text,
        'source': source,
        if (cueId != null) 'cueId': cueId,
      };
}

/// The kind of habit a participant is forming: building a new behaviour or
/// breaking an existing one (§7.4 Habit Distinction). Drives cue guidance and
/// the habit card's colour, and is a standard research covariate.
enum HabitType {
  /// Building a new behaviour — trigger cues.
  build,

  /// Breaking an existing behaviour — disruption/removal cues.
  quit;

  /// Wire value sent to / received from the backend.
  String get wire => name;

  /// Parses the backend string, defaulting to [HabitType.build] for legacy
  /// habits created before Habit Distinction existed.
  static HabitType fromWire(String? value) =>
      value == 'quit' ? HabitType.quit : HabitType.build;
}

/// An implementation intention created by the user.
class Intention {
  /// Creates an [Intention].
  const Intention({
    required this.id,
    required this.behaviorKey,
    required this.behaviorLabel,
    required this.durationMinutes,
    required this.cues,
    required this.intentionStatement,
    required this.status,
    required this.createdAt,
    this.habitType = HabitType.build,
    this.stackedOn,
    this.creationMode = 'standalone',
    this.earnedBadges = const [],
  });

  /// Unique intention identifier.
  final String id;

  /// Key identifying the target behaviour (e.g. `'walking'`).
  final String behaviorKey;

  /// Human-readable behaviour label shown in the UI.
  final String behaviorLabel;

  /// Planned duration of each session in minutes.
  final int durationMinutes;

  /// Implementation intention cues attached to this intention.
  final List<IntentionCue> cues;

  /// Full if-then implementation intention statement.
  final String intentionStatement;

  /// Lifecycle status: `'active'`, `'paused'`, `'completed'`, or `'abandoned'`.
  final String status;

  /// Timestamp when the intention was created.
  final DateTime createdAt;

  /// Whether this is a build or quit habit (§7.4 Habit Distinction).
  final HabitType habitType;

  /// When set, the id of the anchor intention this habit was stacked onto
  /// (§7.1 Habit Stacking); `null` for standalone habits.
  final String? stackedOn;

  /// How the habit was created: `'standalone'` or `'stacked'` (§7.1).
  final String creationMode;

  /// Gamification badges earned for this habit (§7.5).
  final List<EarnedBadge> earnedBadges;

  /// Whether this habit was created by stacking onto an anchor (§7.1).
  bool get isStacked => creationMode == 'stacked';

  /// Deserialises from the intentions API response.
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
        habitType: HabitType.fromWire(json['habitType'] as String?),
        stackedOn: json['stackedOn'] as String?,
        creationMode: json['creationMode'] as String? ?? 'standalone',
        earnedBadges: (json['earnedBadges'] as List<dynamic>?)
                ?.cast<Map<String, dynamic>>()
                .map(EarnedBadge.fromJson)
                .toList() ??
            const [],
      );
}

/// The participant's §7.3 Information Overload preferences and eligibility.
class InformationOverloadPrefs {
  /// Creates an [InformationOverloadPrefs].
  const InformationOverloadPrefs({
    required this.optOut,
    required this.guardEnabled,
    required this.optOutAllowed,
  });

  /// Whether the participant has opted out of the guard.
  final bool optOut;

  /// Whether the guard is active for the participant's study condition.
  final bool guardEnabled;

  /// Whether opting out is permitted (controls whether the toggle is shown).
  final bool optOutAllowed;

  /// Deserialises from the /me/preferences response.
  factory InformationOverloadPrefs.fromJson(Map<String, dynamic> json) =>
      InformationOverloadPrefs(
        optOut: json['informationOverloadOptOut'] as bool? ?? false,
        guardEnabled:
            json['informationOverloadGuardEnabled'] as bool? ?? false,
        optOutAllowed:
            json['informationOverloadOptOutAllowed'] as bool? ?? false,
      );
}

/// The user's §7.5 gamification summary: XP, level, and earned badges.
class Gamification {
  /// Creates a [Gamification] summary.
  const Gamification({
    required this.totalXp,
    required this.level,
    required this.xpIntoLevel,
    required this.xpToNextLevel,
    required this.nextLevelXp,
    required this.badges,
    required this.newlyEarned,
  });

  /// Total accumulated XP across active habits.
  final int totalXp;

  /// Current level.
  final int level;

  /// XP earned into the current level.
  final int xpIntoLevel;

  /// XP remaining until the next level.
  final int xpToNextLevel;

  /// Cumulative XP threshold for the next level.
  final int nextLevelXp;

  /// All currently-earned badges (badgeKey per habit; may repeat keys).
  final List<GamificationBadge> badges;

  /// Badges newly earned on this read — used to fire a one-time praise
  /// notification.
  final List<GamificationBadge> newlyEarned;

  /// Distinct earned badge keys, for a compact profile display.
  Set<String> get distinctBadgeKeys =>
      badges.map((b) => b.badgeKey).toSet();

  /// Deserialises from the /habits/intentions/gamification response.
  factory Gamification.fromJson(Map<String, dynamic> json) => Gamification(
        totalXp: (json['totalXp'] as num?)?.toInt() ?? 0,
        level: (json['level'] as num?)?.toInt() ?? 1,
        xpIntoLevel: (json['xpIntoLevel'] as num?)?.toInt() ?? 0,
        xpToNextLevel: (json['xpToNextLevel'] as num?)?.toInt() ?? 0,
        nextLevelXp: (json['nextLevelXp'] as num?)?.toInt() ?? 0,
        badges: (json['badges'] as List<dynamic>?)
                ?.cast<Map<String, dynamic>>()
                .map(GamificationBadge.fromJson)
                .toList() ??
            const [],
        newlyEarned: (json['newlyEarned'] as List<dynamic>?)
                ?.cast<Map<String, dynamic>>()
                .map(GamificationBadge.fromJson)
                .toList() ??
            const [],
      );
}

/// One earned badge in a [Gamification] summary (badge key + owning habit).
class GamificationBadge {
  /// Creates a [GamificationBadge].
  const GamificationBadge({required this.badgeKey, required this.intentionId});

  /// Stable badge identifier.
  final String badgeKey;

  /// The habit this badge belongs to.
  final String intentionId;

  /// Deserialises from JSON.
  factory GamificationBadge.fromJson(Map<String, dynamic> json) =>
      GamificationBadge(
        badgeKey: json['badgeKey'] as String? ?? '',
        intentionId: json['intentionId'] as String? ?? '',
      );
}

/// A gamification badge earned for a habit (§7.5).
class EarnedBadge {
  /// Creates an [EarnedBadge].
  const EarnedBadge({required this.badgeKey, required this.earnedAt});

  /// Stable badge identifier (e.g. `'first_step'`, `'second_nature'`).
  final String badgeKey;

  /// When the badge was earned.
  final DateTime earnedAt;

  /// Deserialises from JSON.
  factory EarnedBadge.fromJson(Map<String, dynamic> json) => EarnedBadge(
        badgeKey: json['badgeKey'] as String,
        earnedAt: DateTime.parse(json['earnedAt'] as String),
      );
}

/// A single daily behavior log entry.
class DailyLog {
  /// Creates a [DailyLog].
  const DailyLog({
    required this.intentionId,
    required this.date,
    required this.enacted,
    required this.loggedAt,
  });

  /// Identifier of the intention this log belongs to.
  final String intentionId;

  /// Date of the log in `'YYYY-MM-DD'` format.
  final String date;

  /// Whether the habit was enacted on this day.
  final bool enacted;

  /// Timestamp when the log was submitted.
  final DateTime loggedAt;

  /// Deserialises from the daily logs API response.
  factory DailyLog.fromJson(Map<String, dynamic> json) => DailyLog(
        intentionId: json['intentionId'] as String? ?? '',
        date: json['date'] as String,
        enacted: json['enacted'] as bool,
        loggedAt: DateTime.parse(json['loggedAt'] as String),
      );
}

/// An open SRHI measurement window (due for submission).
class SrhiWindow {
  /// Creates an [SrhiWindow].
  const SrhiWindow({
    required this.id,
    required this.intentionId,
    required this.weekNumber,
    required this.scheduledFor,
    this.submittedAt,
    this.score,
  });

  /// Unique window identifier.
  final String id;

  /// Identifier of the intention this window belongs to.
  final String intentionId;

  /// Study week number for this check-in.
  final int weekNumber;

  /// Scheduled submission date.
  final DateTime scheduledFor;

  /// Timestamp when this window was submitted (null if still open).
  final DateTime? submittedAt;

  /// Computed SRHI score after submission (null if not yet submitted).
  final double? score;

  /// Deserialises from the SRHI windows API response.
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
  /// Creates an [SrhiTrajectoryPoint].
  const SrhiTrajectoryPoint({
    required this.weekNumber,
    this.score,
    this.submittedAt,
    this.scheduledFor,
  });

  /// Study week number for this data point.
  final int weekNumber;

  /// SRHI score (1–7 scale average) for this week, or `null` if missing.
  final double? score;

  /// Timestamp when this measurement was submitted.
  final DateTime? submittedAt;

  /// Date this week's check-in is (or was) scheduled for. Present for
  /// not-yet-submitted windows too, so the next due date can be shown.
  final DateTime? scheduledFor;

  /// Deserialises from JSON.
  factory SrhiTrajectoryPoint.fromJson(Map<String, dynamic> json) =>
      SrhiTrajectoryPoint(
        weekNumber: (json['weekNumber'] as num).toInt(),
        score:
            json['score'] != null ? (json['score'] as num).toDouble() : null,
        submittedAt: json['submittedAt'] != null
            ? DateTime.parse(json['submittedAt'] as String)
            : null,
        scheduledFor: json['scheduledFor'] != null
            ? DateTime.parse(json['scheduledFor'] as String)
            : null,
      );
}
