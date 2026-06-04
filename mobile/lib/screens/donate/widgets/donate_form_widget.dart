/// Form sub-widget for the habit donation flow.
///
/// Encapsulates all form inputs, local validation state, and the
/// "not a habit" warning banner.  The parent [ShareHabitScreen] drives
/// submission by calling [DonateFormWidget.submit] via a [GlobalKey].
library;

import 'package:flutter/material.dart';

// ---------------------------------------------------------------------------
// Public widget
// ---------------------------------------------------------------------------

/// A multi-part form for collecting a habit description and four rating
/// questions (frequency, duration, health benefit, wellbeing impact).
///
/// Call [DonateFormWidgetState.collectValues] to read the current form data.
/// The parent is responsible for triggering validation and submission.
class DonateFormWidget extends StatefulWidget {
  /// Whether form inputs should be disabled (e.g. while submitting).
  final bool submitting;

  /// Optional validation error message shown when the text is not a habit.
  final String? notAHabitMsg;

  /// Creates a [DonateFormWidget].
  const DonateFormWidget({
    super.key,
    required this.submitting,
    this.notAHabitMsg,
  });

  @override
  State<DonateFormWidget> createState() => DonateFormWidgetState();
}

/// State for [DonateFormWidget].
///
/// Expose [formKey], [habitController], and [collectValues] for parent use.
class DonateFormWidgetState extends State<DonateFormWidget> {
  /// Form key used for validation.
  final formKey = GlobalKey<FormState>();

  /// Controller for the habit description text field.
  final habitController = TextEditingController();

  int? _frequency;
  int? _duration;
  int? _healthBenefit;
  int? _wellbeing;

  @override
  void dispose() {
    habitController.dispose();
    super.dispose();
  }

  /// Resets all form fields to their initial state.
  void reset() {
    habitController.clear();
    setState(() {
      _frequency = null;
      _duration = null;
      _healthBenefit = null;
      _wellbeing = null;
    });
  }

  /// Returns the current form values, or `null` if any required field is empty.
  ///
  /// Also validates the [FormState] before returning.
  DonateFormValues? collectValues() {
    if (!(formKey.currentState?.validate() ?? false)) return null;
    final f = _frequency;
    final d = _duration;
    final h = _healthBenefit;
    final w = _wellbeing;
    if (f == null || d == null || h == null || w == null) return null;
    return DonateFormValues(
      sentence: habitController.text.trim(),
      frequency: f,
      duration: d,
      healthBenefit: h,
      wellbeing: w,
    );
  }

  @override
  Widget build(BuildContext context) {
    return Form(
      key: formKey,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(20, 16, 20, 100),
        children: [
          // ── Habit text input ──────────────────────────────────────────────
          const Text(
            'Describe your habit',
            style: TextStyle(fontSize: 16, fontWeight: FontWeight.w800),
          ),
          const SizedBox(height: 4),
          TextFormField(
            controller: habitController,
            maxLines: 3,
            maxLength: 500,
            enabled: !widget.submitting,
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
                return 'Please describe your habit (at least 10 characters)';
              }
              return null;
            },
          ),
          if (widget.notAHabitMsg != null) ...[
            const SizedBox(height: 4),
            _NotAHabitBanner(message: widget.notAHabitMsg!),
          ],
          const SizedBox(height: 20),
          const SizedBox(height: 4),

          // ── Rating questions ──────────────────────────────────────────────
          _RatingQuestion(
            label: 'How often do you do this habit?',
            options: const ['Rarely', 'Weekly', 'Several/week', 'Daily'],
            selected: _frequency,
            enabled: !widget.submitting,
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
            enabled: !widget.submitting,
            onSelected: (v) => setState(() => _duration = v),
          ),
          const SizedBox(height: 16),
          _RatingQuestion(
            label: 'How much does it benefit your health?',
            options: const ['1', '2', '3', '4', '5'],
            selected: _healthBenefit,
            enabled: !widget.submitting,
            onSelected: (v) => setState(() => _healthBenefit = v),
            caption: '1 = Not at all · 5 = Very much',
          ),
          const SizedBox(height: 16),
          _RatingQuestion(
            label: 'How much does it improve your wellbeing?',
            options: const ['1', '2', '3', '4', '5'],
            selected: _wellbeing,
            enabled: !widget.submitting,
            onSelected: (v) => setState(() => _wellbeing = v),
            caption: '1 = Not at all · 5 = Very much',
          ),
        ],
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Value object returned by collectValues()
// ---------------------------------------------------------------------------

/// Immutable snapshot of a completed [DonateFormWidget].
class DonateFormValues {
  /// The habit description entered by the user.
  final String sentence;

  /// Frequency rating (1–4).
  final int frequency;

  /// Duration rating (1–4).
  final int duration;

  /// Health benefit rating (1–5).
  final int healthBenefit;

  /// Wellbeing impact rating (1–5).
  final int wellbeing;

  /// Creates a [DonateFormValues].
  const DonateFormValues({
    required this.sentence,
    required this.frequency,
    required this.duration,
    required this.healthBenefit,
    required this.wellbeing,
  });
}

// ---------------------------------------------------------------------------
// Internal widgets
// ---------------------------------------------------------------------------

class _NotAHabitBanner extends StatelessWidget {
  const _NotAHabitBanner({required this.message});
  final String message;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: const Color(0xFFFFF7ED),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: const Color(0xFFFCD34D)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Icon(Icons.info_outline, color: Color(0xFFD97706), size: 18),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              message,
              style: const TextStyle(fontSize: 13, color: Color(0xFF92400E)),
            ),
          ),
        ],
      ),
    );
  }
}

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

  static const _kCardShadow = [
    BoxShadow(color: Color(0x14000000), blurRadius: 20, offset: Offset(0, 4)),
  ];

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
                padding:
                    const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                decoration: BoxDecoration(
                  color:
                      isSelected ? const Color(0xFFEDF7E5) : Colors.white,
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
                    fontWeight:
                        isSelected ? FontWeight.w700 : FontWeight.w500,
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
