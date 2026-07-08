/// Habit donation / share screen.
///
/// [ShareHabitScreen] is the top-level coordinator.  It owns the survey-mode
/// toggle and submission logic; the actual form inputs live in
/// [DonateFormWidget] and progress / success display in
/// [DonateProgressWidget] / [DonateSuccessWidget].
library;

import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../config/app_config.dart';
import '../features/questionnaire/questionnaire_service.dart';
import '../core/dio_provider.dart';
import '../l10n/app_localizations.dart';
import '../providers/locale_provider.dart';
import '../services/habit_service.dart';
import '../services/offline_queue_service.dart';
import '../services/survey_service.dart';
import '../widgets/contribution_graph_widget.dart';
import 'donate/widgets/donate_form_widget.dart';
import 'donate/widgets/donate_progress_widget.dart';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const _kCardShadow = [
  BoxShadow(color: Color(0x14000000), blurRadius: 20, offset: Offset(0, 4)),
];
const _kGreenGlow = [
  BoxShadow(color: Color(0x4745B700), blurRadius: 28, offset: Offset(0, 8)),
];

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------

/// Root screen for the habit-donation flow.
///
/// Displays a landing card with community stats when [_surveyMode] is false.
/// Switching [_surveyMode] to true renders the full [DonateFormWidget] with a
/// pinned [DonateProgressWidget] submit button.
class ShareHabitScreen extends ConsumerStatefulWidget {
  /// Creates a [ShareHabitScreen].
  const ShareHabitScreen({super.key});

  @override
  ConsumerState<ShareHabitScreen> createState() => _ShareHabitScreenState();
}

class _ShareHabitScreenState extends ConsumerState<ShareHabitScreen> {
  final _formKey = GlobalKey<DonateFormWidgetState>();

  bool _surveyMode = false;
  bool _submitting = false;
  bool _showSuccess = false;
  String? _notAHabitMsg;

  String? _surveyId;
  late String _lang;

  /// Whether a habit was already shared today (persisted per device).
  bool _sharedToday = false;

  /// Consecutive-day sharing streak (persisted per device).
  int _shareStreak = 0;

  /// Number of habits shared on each day this device has shared on,
  /// keyed by a midnight-normalised date. Feeds the share-activity graph.
  Map<DateTime, int> _shareCounts = {};

  static const _lastShareDateKey = 'last_habit_share_date';
  static const _streakKey = 'habit_share_streak';
  static const _shareCountsKey = 'habit_share_counts_json';

  static DateTime _atMidnight(DateTime d) => DateTime(d.year, d.month, d.day);

  static String _dateStr(DateTime d) =>
      '${d.year}-${d.month.toString().padLeft(2, '0')}-'
      '${d.day.toString().padLeft(2, '0')}';

  static String _todayStr() => _dateStr(DateTime.now());

  static String _yesterdayStr() =>
      _dateStr(DateTime.now().subtract(const Duration(days: 1)));

  @override
  void initState() {
    super.initState();
    _lang = ref.read(localeProvider).languageCode;
    _loadSurveyId();
    _loadSharedToday();
  }

  /// Parses the persisted `{"yyyy-MM-dd": count}` JSON blob into a
  /// midnight-normalised [DateTime] map for [ContributionGraphWidget].
  static Map<DateTime, int> _decodeShareCounts(String? json) {
    if (json == null) return {};
    try {
      final decoded = jsonDecode(json) as Map<String, dynamic>;
      final counts = <DateTime, int>{};
      for (final entry in decoded.entries) {
        final parts = entry.key.split('-');
        if (parts.length != 3) continue;
        final year = int.tryParse(parts[0]);
        final month = int.tryParse(parts[1]);
        final day = int.tryParse(parts[2]);
        if (year == null || month == null || day == null) continue;
        counts[DateTime(year, month, day)] = (entry.value as num).toInt();
      }
      return counts;
    } catch (_) {
      return {};
    }
  }

  Future<void> _loadSharedToday() async {
    final prefs = await SharedPreferences.getInstance();
    final last = prefs.getString(_lastShareDateKey);
    final streak = prefs.getInt(_streakKey) ?? 0;
    // The streak is "alive" only if the last share was today or yesterday;
    // otherwise a day was missed and it has reset.
    final alive = last == _todayStr() || last == _yesterdayStr();
    final counts = _decodeShareCounts(prefs.getString(_shareCountsKey));
    if (mounted) {
      setState(() {
        _sharedToday = last == _todayStr();
        _shareStreak = alive ? streak : 0;
        _shareCounts = counts;
      });
    }
  }

  Future<void> _markSharedToday() async {
    final prefs = await SharedPreferences.getInstance();
    final last = prefs.getString(_lastShareDateKey);
    final prevStreak = prefs.getInt(_streakKey) ?? 0;
    final int newStreak;
    if (last == _todayStr()) {
      newStreak = prevStreak < 1 ? 1 : prevStreak; // already counted today
    } else if (last == _yesterdayStr()) {
      newStreak = prevStreak + 1; // continued the streak
    } else {
      newStreak = 1; // first share, or streak was broken
    }
    await prefs.setString(_lastShareDateKey, _todayStr());
    await prefs.setInt(_streakKey, newStreak);

    final today = DateTime.now();
    final todayKey = _atMidnight(today);
    final updatedCounts = {
      ..._shareCounts,
      todayKey: (_shareCounts[todayKey] ?? 0) + 1,
    };
    await prefs.setString(
      _shareCountsKey,
      jsonEncode(
        updatedCounts.map((date, count) => MapEntry(_dateStr(date), count)),
      ),
    );

    if (mounted) {
      setState(() {
        _sharedToday = true;
        _shareStreak = newStreak;
        _shareCounts = updatedCounts;
      });
    }
  }

  /// The green "today's task" prompt shown until a habit is shared today.
  Widget _taskCard() {
    final l10n = AppLocalizations.of(context)!;
    return Container(
      decoration: BoxDecoration(
        color: const Color(0xFF45B700),
        borderRadius: BorderRadius.circular(20),
        boxShadow: _kGreenGlow,
      ),
      padding: const EdgeInsets.all(18),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            l10n.donateShareEyebrow,
            style: const TextStyle(
              color: Colors.white70,
              fontSize: 10,
              fontWeight: FontWeight.w700,
              letterSpacing: 1,
            ),
          ),
          const SizedBox(height: 6),
          Text(
            l10n.donateHeroTitle,
            style: const TextStyle(
              color: Colors.white,
              fontSize: 18,
              fontWeight: FontWeight.w900,
              height: 1.2,
            ),
          ),
          const SizedBox(height: 6),
          Text(
            l10n.donateHeroSubtitle,
            style: const TextStyle(color: Colors.white70, fontSize: 13),
          ),
          const SizedBox(height: 14),
          GestureDetector(
            onTap: () => setState(() => _surveyMode = true),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 10),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(100),
              ),
              child: Text(
                l10n.donateStartSharingButton,
                style: const TextStyle(
                  color: Color(0xFF2E8C00),
                  fontWeight: FontWeight.w800,
                  fontSize: 14,
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  /// A "today's task" card for a scheduled questionnaire that is currently due.
  Widget _questionnaireTaskCard(DueQuestionnaire q) {
    final l10n = AppLocalizations.of(context)!;
    return Container(
      decoration: BoxDecoration(
        color: const Color(0xFF4F46E5),
        borderRadius: BorderRadius.circular(20),
        boxShadow: _kCardShadow,
      ),
      padding: const EdgeInsets.all(18),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            l10n.donateQuestionnaireEyebrow,
            style: const TextStyle(
              color: Colors.white70,
              fontSize: 10,
              fontWeight: FontWeight.w700,
              letterSpacing: 1,
            ),
          ),
          const SizedBox(height: 6),
          Text(
            q.title,
            style: const TextStyle(
              color: Colors.white,
              fontSize: 18,
              fontWeight: FontWeight.w900,
              height: 1.2,
            ),
          ),
          const SizedBox(height: 6),
          Text(
            l10n.donateQuestionnaireDueSubtitle,
            style: const TextStyle(color: Colors.white70, fontSize: 13),
          ),
          const SizedBox(height: 14),
          GestureDetector(
            onTap: () async {
              await context.push('/questionnaire/${q.slug}');
              if (mounted) ref.invalidate(dueQuestionnairesProvider);
            },
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 10),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(100),
              ),
              child: Text(
                l10n.donateCompleteButton,
                style: const TextStyle(
                  color: Color(0xFF4F46E5),
                  fontWeight: FontWeight.w800,
                  fontSize: 14,
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  /// Shown once a habit has been shared today, replacing the task prompt.
  /// Keeps the daily confirmation message but still encourages sharing more
  /// via a prominent green CTA that re-opens the donate form.
  Widget _sharedTodayCard() {
    final l10n = AppLocalizations.of(context)!;
    final colorScheme = Theme.of(context).colorScheme;
    return Container(
      decoration: BoxDecoration(
        color: colorScheme.surface,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: const Color(0xFF45B700), width: 1),
        boxShadow: _kCardShadow,
      ),
      padding: const EdgeInsets.all(18),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              const Icon(
                Icons.check_circle,
                color: Color(0xFF2E8C00),
                size: 28,
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      l10n.donateSharedTodayTitle,
                      style: const TextStyle(
                        color: Color(0xFF2E8C00),
                        fontSize: 16,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      l10n.donateSharedTodayBody,
                      style: TextStyle(
                        color: colorScheme.onSurfaceVariant,
                        fontSize: 13,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),
          SizedBox(
            width: double.infinity,
            child: FilledButton.icon(
              onPressed: () => setState(() => _surveyMode = true),
              icon: const Icon(Icons.add_circle_outline),
              label: Text(l10n.donateShareAnotherButton),
              style: FilledButton.styleFrom(
                backgroundColor: const Color(0xFF45B700),
                foregroundColor: Colors.white,
                padding: const EdgeInsets.symmetric(vertical: 14),
                textStyle: const TextStyle(
                  fontWeight: FontWeight.w800,
                  fontSize: 15,
                ),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(100),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  /// A short, always-visible explanation of why sharing habits is useful, so
  /// the landing screen isn't sparse.
  Widget _whyShareCard() {
    final l10n = AppLocalizations.of(context)!;
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
      child: Container(
        decoration: BoxDecoration(
          color: Theme.of(context).colorScheme.surface,
          borderRadius: BorderRadius.circular(16),
          boxShadow: _kCardShadow,
        ),
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                const Icon(
                  Icons.science_outlined,
                  size: 18,
                  color: Color(0xFF45B700),
                ),
                const SizedBox(width: 8),
                Text(
                  l10n.donateWhyShareTitle,
                  style: Theme.of(
                    context,
                  ).textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w700),
                ),
              ],
            ),
            const SizedBox(height: 8),
            Text(
              l10n.donateWhyShareBody,
              style: Theme.of(
                context,
              ).textTheme.bodyMedium?.copyWith(height: 1.45),
            ),
            const SizedBox(height: 8),
            InkWell(
              onTap: () => context.push('/about-project'),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    l10n.readMoreAboutProject,
                    style: const TextStyle(
                      color: Color(0xFF45B700),
                      fontWeight: FontWeight.w700,
                      fontSize: 13,
                    ),
                  ),
                  const SizedBox(width: 4),
                  const Icon(
                    Icons.arrow_forward,
                    size: 14,
                    color: Color(0xFF45B700),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _loadSurveyId() async {
    try {
      final survey = await ref
          .read(surveyServiceProvider)
          .fetchSurvey('habit-donation');
      if (mounted) setState(() => _surveyId = survey.id);
    } catch (_) {
      // Survey ID optional — ratings can be skipped, habit text still donated.
    }
  }

  void _resetForm() {
    _formKey.currentState?.reset();
    setState(() {
      _surveyMode = false;
      _submitting = false;
      _showSuccess = false;
      _notAHabitMsg = null;
    });
  }

  Future<void> _submit() async {
    final formState = _formKey.currentState;
    if (formState == null) return;

    final l10n = AppLocalizations.of(context)!;
    final values = formState.collectValues();
    if (values == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(l10n.donatePleaseAnswerAllQuestions)),
      );
      return;
    }

    setState(() {
      _submitting = true;
      _notAHabitMsg = null;
    });

    final dio = ref.read(dioProvider);

    try {
      // ── Step 1: Submit habit text + ratings ──────────────────────────────
      // 200 = classifier rejected (not a habit), 202 = accepted and queued.
      final shareResp = await dio.post<Map<String, dynamic>>(
        '${AppConfig.apiBaseUrl}/habits/share',
        data: {
          'sentence': values.sentence,
          'language': _lang,
          'frequency': values.frequency,
          'duration': values.duration,
          'health_benefit': values.healthBenefit,
          'wellbeing_impact': values.wellbeing,
        },
      );

      final isHabit = shareResp.data?['is_habit'] as bool? ?? true;
      if (!isHabit) {
        if (mounted) {
          setState(() {
            _submitting = false;
            _notAHabitMsg = l10n.donateNotAHabitMessage;
          });
        }
        return;
      }
      // 202: habit accepted and queued for analysis.

      // ── Step 2: Submit ratings to survey system (best-effort) ─────────────
      if (_surveyId != null) {
        try {
          await ref.read(surveyServiceProvider).submitResult(_surveyId!, {
            'frequency': values.frequency,
            'duration': values.duration,
            'health_benefit': values.healthBenefit,
            'wellbeing_impact': values.wellbeing,
          });
        } catch (_) {
          // Non-critical — habit is already saved.
        }
      }

      // Remember that a habit was shared today so the "today's task" prompt
      // gives way to a thank-you until tomorrow.
      await _markSharedToday();

      if (mounted) {
        setState(() {
          _submitting = false;
          _showSuccess = true;
        });
      }
    } on DioException catch (e) {
      final statusCode = e.response?.statusCode;
      final isNetworkError =
          e.type == DioExceptionType.connectionError ||
          e.type == DioExceptionType.connectionTimeout ||
          e.type == DioExceptionType.receiveTimeout;

      if (isNetworkError) {
        await offlineQueueService.enqueue(values, _lang);
        if (mounted) {
          setState(() => _submitting = false);
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text(l10n.donateSavedOffline),
              duration: const Duration(seconds: 4),
            ),
          );
          _resetForm();
        }
        return;
      }

      debugPrint(
        'ShareHabitScreen._submit DioException: status=$statusCode '
        'path=${e.requestOptions.path} data=${e.response?.data}',
      );
      if (mounted) {
        setState(() => _submitting = false);
        if (statusCode == 401) {
          ScaffoldMessenger.of(
            context,
          ).showSnackBar(SnackBar(content: Text(l10n.donateUnauthorized)));
          return;
        }
        if (statusCode == 502 || statusCode == 503) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text(l10n.donateAnalysisUnavailable)),
          );
          return;
        }
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text(l10n.submissionFailed)));
      }
    } catch (e) {
      debugPrint('ShareHabitScreen._submit: $e');
      if (mounted) {
        setState(() => _submitting = false);
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text(l10n.submissionFailed)));
      }
    }
  }

  // ── Build ──────────────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;

    if (_surveyMode) return _buildFormScaffold(l10n);

    // ── Landing page ─────────────────────────────────────────────────────────
    final statsAsync = ref.watch(habitStatsProvider);
    final dueList =
        ref
            .watch(dueQuestionnairesProvider)
            .value
            ?.where((q) => q.isDue)
            .toList() ??
        const <DueQuestionnaire>[];

    return Scaffold(
      appBar: AppBar(title: Text(l10n.appTitle), titleSpacing: 16),
      body: RefreshIndicator(
        onRefresh: () async {
          ref.invalidate(dueQuestionnairesProvider);
          ref.invalidate(habitStatsProvider);
        },
        child: ListView(
          padding: const EdgeInsets.only(bottom: 24),
          children: [
            // ── Share activity graph ─────────────────────────────────────────
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 4),
              child: ContributionGraphWidget(
                counts: _shareCounts,
                baseColorLight: const Color(0xFFFFD8A8),
                baseColor: const Color(0xFFE8590C),
              ),
            ),
            // ── Today's tasks ─────────────────────────────────────────────────
            Padding(
              padding: const EdgeInsets.fromLTRB(18, 12, 18, 6),
              child: Text(
                l10n.donateTodaysTasksEyebrow,
                style: const TextStyle(
                  color: Color(0xFF6B7280),
                  fontSize: 11,
                  fontWeight: FontWeight.w800,
                  letterSpacing: 1,
                ),
              ),
            ),
            // Share-a-habit task (or a thank-you once shared today).
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 0),
              child: _sharedToday ? _sharedTodayCard() : _taskCard(),
            ),
            // A card per questionnaire that is currently due.
            for (final q in dueList)
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
                child: _questionnaireTaskCard(q),
              ),

            // ── Stats row ─────────────────────────────────────────────────────
            statsAsync.when(
              loading: () => const SizedBox(height: 80),
              error: (e, s) => const SizedBox(height: 12),
              data: (stats) => Padding(
                padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
                child: Row(
                  children: [
                    _StatCard(
                      value: '${stats.total}',
                      label: l10n.donateCommunityLabel,
                    ),
                    const SizedBox(width: 10),
                    _StatCard(
                      value: '$_shareStreak',
                      label: l10n.donateDayStreakLabel,
                    ),
                  ],
                ),
              ),
            ),

            // ── Why share? ────────────────────────────────────────────────────
            _whyShareCard(),
          ],
        ),
      ),
    );
  }

  // ── Form scaffold ──────────────────────────────────────────────────────────

  Widget _buildFormScaffold(AppLocalizations l10n) {
    if (_showSuccess) {
      return Scaffold(
        appBar: AppBar(
          title: Text(l10n.shareHabit),
          leading: IconButton(
            icon: const Icon(Icons.close),
            onPressed: _resetForm,
          ),
        ),
        body: DonateSuccessWidget(onReset: _resetForm),
      );
    }

    return Scaffold(
      appBar: AppBar(
        title: Text(l10n.shareHabit),
        leading: IconButton(
          icon: const Icon(Icons.close),
          onPressed: () => setState(() => _surveyMode = false),
        ),
      ),
      body: Stack(
        children: [
          DonateFormWidget(
            key: _formKey,
            submitting: _submitting,
            notAHabitMsg: _notAHabitMsg,
          ),
          DonateProgressWidget(submitting: _submitting, onSubmit: _submit),
        ],
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Stat card
// ---------------------------------------------------------------------------

/// A compact stat display card used in the landing hero section.
class _StatCard extends StatelessWidget {
  /// Creates a [_StatCard].
  const _StatCard({this.value, required this.label});

  /// Numeric value to display.
  final String? value;

  /// Descriptive label shown below the value.
  final String label;

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    return Expanded(
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 12),
        decoration: BoxDecoration(
          color: colorScheme.surface,
          borderRadius: BorderRadius.circular(14),
          boxShadow: _kCardShadow,
        ),
        child: Column(
          children: [
            Text(
              value ?? '-',
              style: const TextStyle(
                fontSize: 20,
                fontWeight: FontWeight.w900,
                color: Color(0xFF45B700),
              ),
            ),
            const SizedBox(height: 3),
            Text(
              label,
              style: TextStyle(fontSize: 11, color: colorScheme.onSurfaceVariant),
            ),
          ],
        ),
      ),
    );
  }
}
