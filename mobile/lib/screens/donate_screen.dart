/// Habit donation / share screen.
///
/// [ShareHabitScreen] is the top-level coordinator.  It owns the survey-mode
/// toggle and submission logic; the actual form inputs live in
/// [DonateFormWidget] and progress / success display in
/// [DonateProgressWidget] / [DonateSuccessWidget].
library;

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../config/app_config.dart';
import '../core/dio_provider.dart';
import '../l10n/app_localizations.dart';
import '../providers/locale_provider.dart';
import '../services/habit_service.dart';
import '../services/offline_queue_service.dart';
import '../services/survey_service.dart';
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

  @override
  void initState() {
    super.initState();
    _lang = ref.read(localeProvider).languageCode;
    _loadSurveyId();
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

    final values = formState.collectValues();
    if (values == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Please answer all questions')),
      );
      return;
    }

    setState(() {
      _submitting = true;
      _notAHabitMsg = null;
    });

    final l10n = AppLocalizations.of(context)!;
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
            _notAHabitMsg =
                'This doesn\'t look like a habit. Try describing a regular behaviour, '
                'e.g. "I go for a 30-minute walk every morning".';
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

      if (mounted) {
        setState(() {
          _submitting = false;
          _showSuccess = true;
        });
      }
    } on DioException catch (e) {
      final statusCode = e.response?.statusCode;
      final isNetworkError = e.type == DioExceptionType.connectionError ||
          e.type == DioExceptionType.connectionTimeout ||
          e.type == DioExceptionType.receiveTimeout;

      if (isNetworkError) {
        await offlineQueueService.enqueue(values, _lang);
        if (mounted) {
          setState(() => _submitting = false);
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text('Saved offline — will submit when connected'),
              duration: Duration(seconds: 4),
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
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('Unauthorized. Please sign in again.')),
          );
          return;
        }
        if (statusCode == 502 || statusCode == 503) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text(
                'Habit analysis is temporarily unavailable. Please try again in a moment.',
              ),
            ),
          );
          return;
        }
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(l10n.submissionFailed)));
      }
    } catch (e) {
      debugPrint('ShareHabitScreen._submit: $e');
      if (mounted) {
        setState(() => _submitting = false);
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(l10n.submissionFailed)));
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

    return Scaffold(
      appBar: AppBar(
        title: const Text('Health Habit Hub'),
        titleSpacing: 16,
      ),
      body: ListView(
        padding: const EdgeInsets.only(bottom: 24),
        children: [
          // ── Hero card ─────────────────────────────────────────────────────
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 0),
            child: Container(
              decoration: BoxDecoration(
                color: const Color(0xFF45B700),
                borderRadius: BorderRadius.circular(20),
                boxShadow: _kGreenGlow,
              ),
              padding: const EdgeInsets.all(18),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    "TODAY'S TASK",
                    style: TextStyle(
                      color: Colors.white70,
                      fontSize: 10,
                      fontWeight: FontWeight.w700,
                      letterSpacing: 1,
                    ),
                  ),
                  const SizedBox(height: 6),
                  const Text(
                    'Share a habit with science',
                    style: TextStyle(
                      color: Colors.white,
                      fontSize: 18,
                      fontWeight: FontWeight.w900,
                      height: 1.2,
                    ),
                  ),
                  const SizedBox(height: 6),
                  const Text(
                    'Anonymous · ~2 min · Helps researchers worldwide',
                    style: TextStyle(color: Colors.white70, fontSize: 13),
                  ),
                  const SizedBox(height: 14),
                  GestureDetector(
                    onTap: () => setState(() => _surveyMode = true),
                    child: Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 20,
                        vertical: 10,
                      ),
                      decoration: BoxDecoration(
                        color: Colors.white,
                        borderRadius: BorderRadius.circular(100),
                      ),
                      child: const Text(
                        'Start sharing',
                        style: TextStyle(
                          color: Color(0xFF2E8C00),
                          fontWeight: FontWeight.w800,
                          fontSize: 14,
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),

          // ── Stats row ─────────────────────────────────────────────────────
          statsAsync.when(
            loading: () => const SizedBox(height: 80),
            error: (e, s) => const SizedBox(height: 12),
            data: (stats) => Padding(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
              child: Row(
                children: [
                  _StatCard(value: '${stats.total}', label: 'Community'),
                  const SizedBox(width: 10),
                  const _StatCard(
                    icon: Icons.military_tech,
                    label: 'Top habit',
                  ),
                ],
              ),
            ),
          ),
        ],
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
          DonateProgressWidget(
            submitting: _submitting,
            onSubmit: _submit,
          ),
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
  const _StatCard({this.value, this.icon, required this.label});

  /// Numeric value to display (mutually exclusive with [icon]).
  final String? value;

  /// Icon to display instead of a numeric value.
  final IconData? icon;

  /// Descriptive label shown below the value or icon.
  final String label;

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 12),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(14),
          boxShadow: _kCardShadow,
        ),
        child: Column(
          children: [
            if (icon != null)
              Icon(icon, color: const Color(0xFF45B700), size: 22)
            else
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
              style: const TextStyle(fontSize: 11, color: Color(0xFF6B7280)),
            ),
          ],
        ),
      ),
    );
  }
}
