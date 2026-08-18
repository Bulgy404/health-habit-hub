/// Form sub-widget for the habit donation flow.
///
/// Encapsulates all form inputs, local validation state, and the
/// "not a habit" warning banner.  The parent [ShareHabitScreen] drives
/// submission by calling [DonateFormWidget.submit] via a [GlobalKey].
library;

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:path_provider/path_provider.dart';
import 'package:record/record.dart';

import '../../../config/app_config.dart';
import '../../../core/dio_provider.dart';
import '../../../features/my_habits/habit_onboarding_prefs.dart';
import '../../../features/my_habits/habit_onboarding_widgets.dart';
import '../../../features/my_habits/my_habits_provider.dart';
import '../../../l10n/app_localizations.dart';
import '../../../theme/app_colors.dart';
import '../../../theme/motion.dart';
import 'example_habit_widget.dart';

// ---------------------------------------------------------------------------
// Public widget
// ---------------------------------------------------------------------------

/// A multi-part form for collecting a habit description and three rating
/// questions (frequency, health benefit, wellbeing impact).
///
/// Call [DonateFormWidgetState.collectValues] to read the current form data.
/// The parent is responsible for triggering validation and submission.
class DonateFormWidget extends ConsumerStatefulWidget {
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
  ConsumerState<DonateFormWidget> createState() => DonateFormWidgetState();
}

/// State for [DonateFormWidget].
///
/// Expose [formKey], [habitController], and [collectValues] for parent use.
class DonateFormWidgetState extends ConsumerState<DonateFormWidget> {
  /// Form key used for validation.
  final formKey = GlobalKey<FormState>();

  /// Controller for the habit description text field.
  final habitController = TextEditingController();

  int? _frequency;
  int? _healthBenefit;
  int? _wellbeing;

  // null while the dismissal pref is still loading — kept hidden until then
  // so the hint never flashes on screen only to immediately disappear.
  bool? _hasSeenHabitHint;

  // ── Voice input ────────────────────────────────────────────────────────
  final _recorder = AudioRecorder();
  bool _isRecording = false;
  bool _isTranscribing = false;
  String? _voiceError;
  // The locally-recorded audio file, kept around so the parent screen can
  // upload it (POST /habits/donations/:uuid/audio) after a successful
  // donation submit — the transcribe step itself never persists anything.
  String? _recordedAudioPath;
  // The exact text the transcription step returned, so the parent can tell
  // the backend whether the participant edited it afterwards.
  String? _lastTranscript;
  bool _usedSpeech = false;

  @override
  void initState() {
    super.initState();
    HabitOnboardingPrefs.hasSeenDonateHabitIntro().then((seen) {
      if (mounted) setState(() => _hasSeenHabitHint = seen);
    });
  }

  void _dismissHabitHint() {
    setState(() => _hasSeenHabitHint = true);
    HabitOnboardingPrefs.markDonateHabitIntroSeen();
  }

  @override
  void dispose() {
    habitController.dispose();
    _recorder.dispose();
    super.dispose();
  }

  /// Resets all form fields to their initial state.
  void reset() {
    habitController.clear();
    setState(() {
      _frequency = null;
      _healthBenefit = null;
      _wellbeing = null;
      _recordedAudioPath = null;
      _lastTranscript = null;
      _usedSpeech = false;
      _voiceError = null;
    });
  }

  Future<void> _toggleRecording() async {
    setState(() => _voiceError = null);
    if (_isRecording) {
      final path = await _recorder.stop();
      setState(() => _isRecording = false);
      if (path != null) await _transcribe(path);
      return;
    }

    final l10n = AppLocalizations.of(context)!;
    if (!await _recorder.hasPermission()) {
      if (!mounted) return;
      setState(() => _voiceError = l10n.donateVoiceMicPermissionDenied);
      return;
    }

    final dir = await getTemporaryDirectory();
    final path =
        '${dir.path}/habit-donation-${DateTime.now().millisecondsSinceEpoch}.m4a';
    await _recorder.start(
      const RecordConfig(encoder: AudioEncoder.aacLc, numChannels: 1),
      path: path,
    );
    if (mounted) setState(() => _isRecording = true);
  }

  Future<void> _transcribe(String path) async {
    setState(() => _isTranscribing = true);
    final l10n = AppLocalizations.of(context)!;
    try {
      final dio = ref.read(dioProvider);
      final formData = FormData.fromMap({
        'file': await MultipartFile.fromFile(path, filename: 'recording.m4a'),
      });
      final response = await dio.post<Map<String, dynamic>>(
        '${AppConfig.apiBaseUrl}/habits/share/transcribe',
        data: formData,
      );
      final transcript = response.data?['transcript'] as String? ?? '';
      if (!mounted) return;
      setState(() {
        habitController.text = transcript;
        _recordedAudioPath = path;
        _lastTranscript = transcript;
        _usedSpeech = true;
        _isTranscribing = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _isTranscribing = false;
        _voiceError = l10n.donateVoiceTranscriptionFailed;
      });
    }
  }

  /// Returns the current form values, or `null` if any required field is empty.
  ///
  /// Also validates the [FormState] before returning.
  DonateFormValues? collectValues() {
    if (!(formKey.currentState?.validate() ?? false)) return null;
    final f = _frequency;
    final h = _healthBenefit;
    final w = _wellbeing;
    if (f == null || h == null || w == null) return null;
    final sentence = habitController.text.trim();
    return DonateFormValues(
      sentence: sentence,
      frequency: f,
      healthBenefit: h,
      wellbeing: w,
      inputMode: _usedSpeech ? 'speech' : 'text',
      transcript: _usedSpeech ? _lastTranscript : null,
      transcriptEdited: _usedSpeech ? sentence != _lastTranscript : null,
      recordedAudioPath: _usedSpeech ? _recordedAudioPath : null,
    );
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    final colors = context.appColors;
    final donationInputMode = ref.watch(donationInputModeProvider);
    final showVoiceInput =
        donationInputMode == 'speech' || donationInputMode == 'both';
    return Form(
      key: formKey,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(20, 16, 20, 100),
        children: [
          if (_hasSeenHabitHint == false) ...[
            OnboardingExplainerCard(
              icon: Icons.self_improvement,
              title: l10n.donateHabitHintTitle,
              body: l10n.donateHabitHintBody,
              onDismiss: _dismissHabitHint,
              extra: ExampleHabitWidget(textColor: colors.onGreenLight),
            ),
            const SizedBox(height: 16),
          ],
          // ── Habit text input ──────────────────────────────────────────────
          Text(
            l10n.donateFormDescribeHabitLabel,
            style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w800),
          ),
          if (showVoiceInput) ...[
            const SizedBox(height: 8),
            _VoiceInputControl(
              isRecording: _isRecording,
              isTranscribing: _isTranscribing,
              enabled: !widget.submitting,
              error: _voiceError,
              onTap: _toggleRecording,
            ),
          ],
          const SizedBox(height: 4),
          TextFormField(
            controller: habitController,
            maxLines: 3,
            maxLength: 500,
            enabled: !widget.submitting,
            // This form's cards are intentionally light-themed regardless of
            // app theme (fillColor is hardcoded white), so the text and hint
            // colors must be pinned dark too — otherwise dark mode's default
            // light text color renders white-on-white and is unreadable.
            style: const TextStyle(color: Color(0xFF111827)),
            cursorColor: const Color(0xFF45B700),
            decoration: InputDecoration(
              hintText: l10n.donateFormHabitHint,
              hintStyle: const TextStyle(color: Color(0xFF9CA3AF)),
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
                return l10n.donateFormHabitValidationError;
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
            label: l10n.donateFormFrequencyQuestion,
            options: [
              l10n.donateFormFrequencyRarely,
              l10n.donateFormFrequencyWeekly,
              l10n.donateFormFrequencySeveralPerWeek,
              l10n.donateFormFrequencyDaily,
            ],
            selected: _frequency,
            enabled: !widget.submitting,
            onSelected: (v) => setState(() => _frequency = v),
          ),
          const SizedBox(height: 16),
          _RatingQuestion(
            label: l10n.donateFormHealthBenefitQuestion,
            options: const ['1', '2', '3', '4', '5'],
            selected: _healthBenefit,
            enabled: !widget.submitting,
            onSelected: (v) => setState(() => _healthBenefit = v),
            caption: l10n.donateFormRatingCaption,
          ),
          const SizedBox(height: 16),
          _RatingQuestion(
            label: l10n.donateFormWellbeingQuestion,
            options: const ['1', '2', '3', '4', '5'],
            selected: _wellbeing,
            enabled: !widget.submitting,
            onSelected: (v) => setState(() => _wellbeing = v),
            caption: l10n.donateFormRatingCaption,
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

  /// Health benefit rating (1–5).
  final int healthBenefit;

  /// Wellbeing impact rating (1–5).
  final int wellbeing;

  /// `'text'` or `'speech'` — how [sentence] was entered.
  final String inputMode;

  /// The raw speech-to-text output, before any edits — only set when
  /// [inputMode] is `'speech'`.
  final String? transcript;

  /// Whether [sentence] differs from [transcript] — only meaningful when
  /// [inputMode] is `'speech'`.
  final bool? transcriptEdited;

  /// Local path of the recorded audio clip, kept so the caller can upload it
  /// (`POST /habits/donations/:uuid/audio`) after a successful submit — only
  /// set when [inputMode] is `'speech'`.
  final String? recordedAudioPath;

  /// Creates a [DonateFormValues].
  const DonateFormValues({
    required this.sentence,
    required this.frequency,
    required this.healthBenefit,
    required this.wellbeing,
    this.inputMode = 'text',
    this.transcript,
    this.transcriptEdited,
    this.recordedAudioPath,
  });
}

// ---------------------------------------------------------------------------
// Internal widgets
// ---------------------------------------------------------------------------

/// Record/stop control for voice input, with a transcribing spinner and
/// inline error message. Tapping while idle starts recording; tapping while
/// recording stops it and hands off to transcription.
class _VoiceInputControl extends StatelessWidget {
  const _VoiceInputControl({
    required this.isRecording,
    required this.isTranscribing,
    required this.enabled,
    required this.error,
    required this.onTap,
  });

  final bool isRecording;
  final bool isTranscribing;
  final bool enabled;
  final String? error;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    final busy = isTranscribing || !enabled;
    final label = isTranscribing
        ? l10n.donateVoiceTranscribing
        : isRecording
            ? l10n.donateVoiceStopRecording
            : l10n.donateVoiceStartRecording;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        PressableScale(
          onTap: busy ? () {} : onTap,
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
            decoration: BoxDecoration(
              color: isRecording ? const Color(0xFFFEE2E2) : Colors.white,
              borderRadius: BorderRadius.circular(100),
              border: Border.all(
                color: isRecording
                    ? const Color(0xFFDC2626)
                    : const Color(0xFF45B700),
                width: 1.5,
              ),
              boxShadow: AppShadows.card,
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                if (isTranscribing)
                  const SizedBox(
                    width: 16,
                    height: 16,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                else
                  Icon(
                    isRecording ? Icons.stop_circle : Icons.mic,
                    size: 18,
                    color: isRecording
                        ? const Color(0xFFDC2626)
                        : const Color(0xFF2E8C00),
                  ),
                const SizedBox(width: 8),
                Text(
                  label,
                  style: TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w700,
                    color: isRecording
                        ? const Color(0xFFDC2626)
                        : const Color(0xFF2E8C00),
                  ),
                ),
              ],
            ),
          ),
        ),
        if (error != null) ...[
          const SizedBox(height: 4),
          Text(
            error!,
            style: const TextStyle(fontSize: 12, color: Color(0xFFDC2626)),
          ),
        ],
      ],
    );
  }
}

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
            final chip = Container(
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
                boxShadow: AppShadows.card,
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
            );
            // PressableScale.onTap is non-nullable — only wrap when the
            // chip is actually tappable, so a disabled chip stays inert
            // rather than showing press feedback for a no-op.
            return enabled
                ? PressableScale(
                    onTap: () => onSelected(value),
                    child: chip,
                  )
                : chip;
          }),
        ),
      ],
    );
  }
}
