import 'package:flutter/material.dart';
import '../l10n/app_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:dio/dio.dart';

import '../config/app_config.dart';
import '../core/dio_provider.dart';
import '../providers/locale_provider.dart';
import '../services/habit_service.dart';
import '../services/survey_service.dart';

const _kCardShadow = [
  BoxShadow(color: Color(0x14000000), blurRadius: 20, offset: Offset(0, 4)),
];
const _kGreenGlow = [
  BoxShadow(color: Color(0x4745B700), blurRadius: 28, offset: Offset(0, 8)),
];

class ShareHabitScreen extends ConsumerStatefulWidget {
  const ShareHabitScreen({super.key});

  @override
  ConsumerState<ShareHabitScreen> createState() => _ShareHabitScreenState();
}

class _ShareHabitScreenState extends ConsumerState<ShareHabitScreen> {
  final _formKey = GlobalKey<FormState>();
  final _habitController = TextEditingController();

  bool _surveyMode = false;
  bool _submitting = false;
  bool _showSuccess = false;
  String? _notAHabitMsg;

  int? _frequency; // 1–4
  int? _duration; // 1–4
  int? _healthBenefit; // 1–5
  int? _wellbeing; // 1–5

  String? _surveyId;
  late String _lang;

  @override
  void initState() {
    super.initState();
    _lang = ref.read(localeProvider).languageCode;
    _loadSurveyId();
  }

  @override
  void dispose() {
    _habitController.dispose();
    super.dispose();
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
    _habitController.clear();
    setState(() {
      _surveyMode = false;
      _submitting = false;
      _showSuccess = false;
      _notAHabitMsg = null;
      _frequency = null;
      _duration = null;
      _healthBenefit = null;
      _wellbeing = null;
    });
  }

  Future<void> _submit() async {
    if (!(_formKey.currentState?.validate() ?? false)) return;
    if (_frequency == null ||
        _duration == null ||
        _healthBenefit == null ||
        _wellbeing == null) {
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
    final sentence = _habitController.text.trim();
    final dio = ref.read(dioProvider);

    try {
      // Step 1: Submit the habit text → Neo4j (counted in stats).
      final shareResp = await dio.post<Map<String, dynamic>>(
        '${AppConfig.apiBaseUrl}/habits/share',
        data: {'sentence': sentence, 'language': _lang},
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

      // Step 2: Submit ratings metadata to the survey system (best-effort).
      if (_surveyId != null) {
        try {
          await ref.read(surveyServiceProvider).submitResult(_surveyId!, {
            'frequency': _frequency,
            'duration': _duration,
            'health_benefit': _healthBenefit,
            'wellbeing_impact': _wellbeing,
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
      debugPrint(
        'ShareHabitScreen._submit DioException: status=$statusCode '
        'path=${e.requestOptions.path} data=${e.response?.data}',
      );
      if (mounted) {
        setState(() => _submitting = false);
        if (statusCode == 401) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text('Unauthorized. Please sign in again.'),
            ),
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

  // ---------------------------------------------------------------------------
  // Build
  // ---------------------------------------------------------------------------

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;

    if (_surveyMode) return _buildForm(l10n);

    final statsAsync = ref.watch(habitStatsProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Health Habit Hub'),
        titleSpacing: 16,
        actions: const [
          Padding(
            padding: EdgeInsets.only(right: 16),
            child: Icon(Icons.notifications_outlined),
          ),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.only(bottom: 24),
        children: [
          // ── Hero card ────────────────────────────────────────────────────
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

          // ── Stats row ────────────────────────────────────────────────────
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

  // ---------------------------------------------------------------------------
  // Native survey form (replaces WebView)
  // ---------------------------------------------------------------------------

  Widget _buildForm(AppLocalizations l10n) {
    if (_showSuccess) {
      return Scaffold(
        appBar: AppBar(
          title: Text(l10n.shareHabit),
          leading: IconButton(
            icon: const Icon(Icons.close),
            onPressed: _resetForm,
          ),
        ),
        body: Center(
          child: Padding(
            padding: const EdgeInsets.all(32),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Container(
                  width: 72,
                  height: 72,
                  decoration: BoxDecoration(
                    color: const Color(0xFFEDF7E5),
                    borderRadius: BorderRadius.circular(22),
                  ),
                  child: const Icon(
                    Icons.check_circle,
                    size: 44,
                    color: Color(0xFF45B700),
                  ),
                ),
                const SizedBox(height: 24),
                Text(
                  l10n.habitSharedSuccess,
                  style: const TextStyle(
                    fontSize: 22,
                    fontWeight: FontWeight.w900,
                  ),
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 8),
                Text(
                  'Thank you for contributing to health research.',
                  style: TextStyle(fontSize: 14, color: Colors.grey.shade600),
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 28),
                FilledButton(
                  onPressed: _resetForm,
                  child: const Text('Share another habit'),
                ),
              ],
            ),
          ),
        ),
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
          Form(
            key: _formKey,
            child: ListView(
              padding: const EdgeInsets.fromLTRB(20, 16, 20, 100),
              children: [
                // Habit text input
                const Text(
                  'Describe your habit',
                  style: TextStyle(fontSize: 16, fontWeight: FontWeight.w800),
                ),
                const SizedBox(height: 4),
                TextFormField(
                  controller: _habitController,
                  maxLines: 3,
                  maxLength: 500,
                  enabled: !_submitting,
                  decoration: InputDecoration(
                    hintText: 'e.g. I go for a 30-minute walk every morning',
                    filled: true,
                    fillColor: Colors.white,
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(14),
                      borderSide: const BorderSide(color: Color(0xFFE5E7EB)),
                    ),
                    enabledBorder: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(14),
                      borderSide: const BorderSide(color: Color(0xFFE5E7EB)),
                    ),
                    focusedBorder: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(14),
                      borderSide: const BorderSide(
                        color: Color(0xFF45B700),
                        width: 1.5,
                      ),
                    ),
                  ),
                  validator: (v) {
                    if (v == null || v.trim().length < 10) {
                      return 'Please describe your habit '
                          '(at least 10 characters)';
                    }
                    return null;
                  },
                ),
                if (_notAHabitMsg != null) ...[
                  const SizedBox(height: 4),
                  Container(
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: const Color(0xFFFFF7ED),
                      borderRadius: BorderRadius.circular(10),
                      border: Border.all(color: const Color(0xFFFCD34D)),
                    ),
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Icon(
                          Icons.info_outline,
                          color: Color(0xFFD97706),
                          size: 18,
                        ),
                        const SizedBox(width: 8),
                        Expanded(
                          child: Text(
                            _notAHabitMsg!,
                            style: const TextStyle(
                              fontSize: 13,
                              color: Color(0xFF92400E),
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
                const SizedBox(height: 20),

                const SizedBox(height: 4),

                // Rating questions
                _RatingQuestion(
                  label: 'How often do you do this habit?',
                  options: const ['Rarely', 'Weekly', 'Several/week', 'Daily'],
                  selected: _frequency,
                  enabled: !_submitting,
                  onSelected: (v) => setState(() => _frequency = v),
                ),
                const SizedBox(height: 16),
                _RatingQuestion(
                  label: 'How long have you had this habit?',
                  options: const [
                    '< 1 month',
                    '1–3 months',
                    '3–12 months',
                    '> 1 year',
                  ],
                  selected: _duration,
                  enabled: !_submitting,
                  onSelected: (v) => setState(() => _duration = v),
                ),
                const SizedBox(height: 16),
                _RatingQuestion(
                  label: 'How much does it benefit your health?',
                  options: const ['1', '2', '3', '4', '5'],
                  selected: _healthBenefit,
                  enabled: !_submitting,
                  onSelected: (v) => setState(() => _healthBenefit = v),
                  caption: '1 = Not at all · 5 = Very much',
                ),
                const SizedBox(height: 16),
                _RatingQuestion(
                  label: 'How much does it improve your wellbeing?',
                  options: const ['1', '2', '3', '4', '5'],
                  selected: _wellbeing,
                  enabled: !_submitting,
                  onSelected: (v) => setState(() => _wellbeing = v),
                  caption: '1 = Not at all · 5 = Very much',
                ),
              ],
            ),
          ),

          // Submit button pinned at bottom
          Positioned(
            bottom: 0,
            left: 0,
            right: 0,
            child: Container(
              color: Theme.of(context).scaffoldBackgroundColor,
              padding: const EdgeInsets.fromLTRB(20, 12, 20, 24),
              child: FilledButton(
                onPressed: _submitting ? null : _submit,
                child: _submitting
                    ? const SizedBox(
                        width: 20,
                        height: 20,
                        child: CircularProgressIndicator(
                          strokeWidth: 2,
                          color: Colors.white,
                        ),
                      )
                    : const Text('Donate habit'),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Rating question widget — native ChoiceChip row
// ---------------------------------------------------------------------------

class _RatingQuestion extends StatelessWidget {
  const _RatingQuestion({
    required this.label,
    required this.options,
    required this.selected,
    required this.enabled,
    required this.onSelected,
    this.caption,
  });

  final String label;
  final List<String> options;
  final int? selected;
  final bool enabled;
  final ValueChanged<int> onSelected;
  final String? caption;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          label,
          style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w700),
        ),
        if (caption != null)
          Padding(
            padding: const EdgeInsets.only(top: 2),
            child: Text(
              caption!,
              style: const TextStyle(fontSize: 11, color: Color(0xFF6B7280)),
            ),
          ),
        const SizedBox(height: 8),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: List.generate(options.length, (i) {
            final value = i + 1;
            final isSelected = selected == value;
            return GestureDetector(
              onTap: enabled ? () => onSelected(value) : null,
              child: Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: 14,
                  vertical: 8,
                ),
                decoration: BoxDecoration(
                  color: isSelected ? const Color(0xFFEDF7E5) : Colors.white,
                  borderRadius: BorderRadius.circular(100),
                  border: Border.all(
                    color: isSelected
                        ? const Color(0xFF45B700)
                        : const Color(0xFFE5E7EB),
                    width: isSelected ? 1.5 : 1,
                  ),
                  boxShadow: _kCardShadow,
                ),
                child: Text(
                  options[i],
                  style: TextStyle(
                    fontSize: 13,
                    fontWeight: isSelected ? FontWeight.w700 : FontWeight.w500,
                    color: isSelected
                        ? const Color(0xFF2E8C00)
                        : const Color(0xFF374151),
                  ),
                ),
              ),
            );
          }),
        ),
      ],
    );
  }
}

// ---------------------------------------------------------------------------
// Stat card
// ---------------------------------------------------------------------------

class _StatCard extends StatelessWidget {
  const _StatCard({this.value, this.icon, required this.label});

  final String? value;
  final IconData? icon;
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
