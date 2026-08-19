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
import '../../../features/my_habits/my_habits_models.dart';
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

  /// Focus node for the habit field, so the edit affordance can jump the
  /// caret straight into the (otherwise greyed-out) transcript.
  final _habitFocus = FocusNode();

  /// In voice mode the transcript field is read-only by default; tapping the
  /// small edit icon flips this to allow manual correction of the transcript.
  bool _editingTranscript = false;

  int? _frequency;
  int? _healthBenefit;
  int? _wellbeing;

  // ── Structured entry mode ─────────────────────────────────────────────
  String? _selectedBehaviorKey;
  String? _selectedBehaviorLabel;

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
  // Bumped every time a new recording starts. Each transcription attempt
  // captures its value up front and re-checks it before ever writing to
  // state, so if the participant re-records while a previous take is still
  // being transcribed (queued async — see _pollTranscriptionJob), the
  // stale result is dropped instead of clobbering the newer one: last
  // recording wins.
  int _recordingGeneration = 0;

  // How long to keep polling a transcription job before giving up and
  // surfacing an error. Generous: SCADS.AI retries up to 3x with
  // exponential backoff server-side (see lib/transcribeQueue.js) before a
  // job is even marked failed.
  static const _transcribePollTimeout = Duration(seconds: 45);

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
    _habitFocus.dispose();
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
      _editingTranscript = false;
      _selectedBehaviorKey = null;
      _selectedBehaviorLabel = null;
    });
  }

  /// Hold-to-speak: begin recording. A fresh recording replaces whatever the
  /// previous transcription produced (see [_transcribe], which overwrites the
  /// field), so we lock editing back down while a new take is captured.
  ///
  /// Deliberately does NOT block on `_isTranscribing` — a participant can
  /// start re-recording immediately even while an earlier take is still
  /// being transcribed; [_recordingGeneration] makes sure only the last one
  /// ever gets saved.
  Future<void> _startRecording() async {
    if (_isRecording) return;
    final generation = ++_recordingGeneration;
    setState(() {
      _voiceError = null;
      _editingTranscript = false;
    });

    final l10n = AppLocalizations.of(context)!;
    if (!await _recorder.hasPermission()) {
      if (!mounted || generation != _recordingGeneration) return;
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
    if (mounted && generation == _recordingGeneration) {
      setState(() => _isRecording = true);
    }
  }

  /// Hold-to-speak: release stops recording and hands off to transcription.
  Future<void> _stopRecording() async {
    if (!_isRecording) return;
    final generation = _recordingGeneration;
    final path = await _recorder.stop();
    setState(() => _isRecording = false);
    if (path != null) await _transcribe(path, generation);
  }

  /// Unlock the greyed transcript field for manual correction and focus it.
  void _startEditingTranscript() {
    setState(() => _editingTranscript = true);
    _habitFocus.requestFocus();
  }

  /// Uploads [path] for transcription and applies the result — unless a
  /// newer recording has started in the meantime (see [_recordingGeneration]),
  /// in which case this outcome is silently dropped.
  Future<void> _transcribe(String path, int generation) async {
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

      String transcript;
      final jobId = response.data?['jobId'] as String?;
      if (response.statusCode == 202 && jobId != null) {
        // Async path: the backend queued the clip (BullMQ + Redis) so
        // SCADS.AI gets however long it needs without holding this HTTP
        // request open — poll for the result instead.
        final result = await _pollTranscriptionJob(dio, jobId, generation);
        if (result == null) return; // superseded by a newer recording
        transcript = result;
      } else {
        // Fallback: queue disabled server-side, response is synchronous.
        transcript = response.data?['transcript'] as String? ?? '';
      }

      if (!mounted || generation != _recordingGeneration) return;
      setState(() {
        habitController.text = transcript;
        _recordedAudioPath = path;
        _lastTranscript = transcript;
        _usedSpeech = true;
        _isTranscribing = false;
      });
    } catch (_) {
      if (!mounted || generation != _recordingGeneration) return;
      setState(() {
        _isTranscribing = false;
        _voiceError = l10n.donateVoiceTranscriptionFailed;
      });
    }
  }

  /// Polls `GET /habits/share/transcribe/:jobId` roughly once a second
  /// until the job completes, fails, or [_transcribePollTimeout] elapses.
  /// Returns `null` (instead of throwing) the moment a newer recording has
  /// superseded [generation], so the caller can bail out quietly rather
  /// than surface a spurious error for a take the participant already
  /// abandoned.
  Future<String?> _pollTranscriptionJob(
    Dio dio,
    String jobId,
    int generation,
  ) async {
    final deadline = DateTime.now().add(_transcribePollTimeout);
    while (true) {
      if (!mounted || generation != _recordingGeneration) return null;
      if (DateTime.now().isAfter(deadline)) {
        throw Exception('Transcription timed out');
      }
      await Future.delayed(const Duration(seconds: 1));
      if (!mounted || generation != _recordingGeneration) return null;

      final res = await dio.get<Map<String, dynamic>>(
        '${AppConfig.apiBaseUrl}/habits/share/transcribe/$jobId',
      );
      final status = res.data?['status'] as String?;
      if (status == 'done') return res.data?['text'] as String? ?? '';
      if (status == 'failed') {
        throw Exception(res.data?['failReason'] ?? 'Transcription failed');
      }
      // status is 'waiting' / 'active' / 'delayed' — keep polling.
    }
  }

  /// Returns the current form values, or `null` if any required field is empty.
  ///
  /// Also validates the [FormState] before returning.
  DonateFormValues? collectValues() {
    if (!(formKey.currentState?.validate() ?? false)) return null;
    // Only the questions the study actually shows are required; hidden ones
    // are submitted as null (the backend already treats them as optional).
    final askFrequency = ref.read(donationAskFrequencyProvider);
    final askHealthBenefit = ref.read(donationAskHealthBenefitProvider);
    final askWellbeing = ref.read(donationAskWellbeingProvider);
    final f = askFrequency ? _frequency : null;
    final h = askHealthBenefit ? _healthBenefit : null;
    final w = askWellbeing ? _wellbeing : null;
    if ((askFrequency && f == null) ||
        (askHealthBenefit && h == null) ||
        (askWellbeing && w == null)) {
      return null;
    }

    final donationInputMode = ref.read(donationInputModeProvider);
    if (donationInputMode == 'structured') {
      if (_selectedBehaviorKey == null) return null;
      return DonateFormValues(
        sentence: _selectedBehaviorLabel ?? '',
        behaviorKey: _selectedBehaviorKey,
        behaviorLabel: _selectedBehaviorLabel,
        frequency: f,
        healthBenefit: h,
        wellbeing: w,
        inputMode: 'structured',
      );
    }

    final sentence = habitController.text.trim();
    return DonateFormValues(
      sentence: sentence,
      frequency: f,
      healthBenefit: h,
      wellbeing: w,
      inputMode: _usedSpeech ? 'voice' : 'freeText',
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
    final isStructured = donationInputMode == 'structured';
    final showVoiceInput = donationInputMode == 'voice';
    final behaviorOptions = ref
        .watch(habitConfigProvider)
        .maybeWhen(
          data: (c) => c.behaviorOptions,
          orElse: () => const <BehaviorOption>[],
        );
    // Which optional self-report questions the study wants shown.
    final askFrequency = ref.watch(donationAskFrequencyProvider);
    final askHealthBenefit = ref.watch(donationAskHealthBenefitProvider);
    final askWellbeing = ref.watch(donationAskWellbeingProvider);
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
          // ── Habit input ──────────────────────────────────────────────────
          Text(
            isStructured
                ? l10n.donateStructuredPickerLabel
                : l10n.donateFormDescribeHabitLabel,
            style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w800),
          ),
          if (isStructured) ...[
            const SizedBox(height: 4),
            Text(
              l10n.donateStructuredPickerHint,
              style: const TextStyle(fontSize: 13, color: Color(0xFF6B7280)),
            ),
            const SizedBox(height: 12),
            _StructuredBehaviorPicker(
              options: behaviorOptions,
              selectedKey: _selectedBehaviorKey,
              enabled: !widget.submitting,
              emptyStateLabel: l10n.donateStructuredEmptyState,
              onSelected: (option) => setState(() {
                _selectedBehaviorKey = option.key;
                _selectedBehaviorLabel = option.label;
              }),
            ),
          ] else ...[
            if (showVoiceInput) ...[
              const SizedBox(height: 16),
              // In voice mode the speech button is the focal control: a large
              // round hold-to-speak button, centered, with the transcript field
              // demoted to a greyed-out, read-only preview underneath.
              Center(
                child: _VoiceInputControl(
                  isRecording: _isRecording,
                  isTranscribing: _isTranscribing,
                  enabled: !widget.submitting,
                  error: _voiceError,
                  onHoldStart: _startRecording,
                  onHoldEnd: _stopRecording,
                ),
              ),
              const SizedBox(height: 16),
            ],
            if (!showVoiceInput) const SizedBox(height: 4),
            Builder(
              builder: (context) {
                // Voice mode greys the field and locks it until the participant
                // taps the edit icon, keeping the focus on speaking rather than
                // typing. Text-only mode keeps the plain white editable field.
                final readOnly =
                    showVoiceInput && !_editingTranscript && !widget.submitting;
                final fillColor = readOnly
                    ? const Color(0xFFF3F4F6)
                    : Colors.white;
                return TextFormField(
                  controller: habitController,
                  focusNode: _habitFocus,
                  maxLines: 3,
                  maxLength: 500,
                  enabled: !widget.submitting,
                  readOnly: readOnly,
                  // This form's cards are intentionally light-themed regardless
                  // of app theme (fillColor is hardcoded), so the text and hint
                  // colors must be pinned dark too — otherwise dark mode's
                  // default light text renders white-on-white and is unreadable.
                  style: TextStyle(
                    color: readOnly
                        ? const Color(0xFF6B7280)
                        : const Color(0xFF111827),
                  ),
                  cursorColor: const Color(0xFF45B700),
                  decoration: InputDecoration(
                    hintText: showVoiceInput
                        ? l10n.donateVoiceTranscriptPlaceholder
                        : l10n.donateFormHabitHint,
                    hintStyle: const TextStyle(color: Color(0xFF9CA3AF)),
                    filled: true,
                    fillColor: fillColor,
                    // Small edit affordance: only shown in voice mode while the
                    // field is still locked, so a wrong transcription can be
                    // corrected without leaving voice mode.
                    suffixIcon: readOnly
                        ? IconButton(
                            icon: const Icon(Icons.edit_outlined, size: 18),
                            color: const Color(0xFF2E8C00),
                            tooltip: l10n.donateVoiceEditTranscript,
                            onPressed: _startEditingTranscript,
                          )
                        : null,
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
                );
              },
            ),
          ],
          if (widget.notAHabitMsg != null) ...[
            const SizedBox(height: 4),
            _NotAHabitBanner(message: widget.notAHabitMsg!),
          ],
          const SizedBox(height: 20),
          const SizedBox(height: 4),

          // ── Rating questions ──────────────────────────────────────────────
          // Each question is shown only when the study/group config enables it.
          if (askFrequency) ...[
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
          ],
          if (askHealthBenefit) ...[
            _RatingQuestion(
              label: l10n.donateFormHealthBenefitQuestion,
              options: const ['1', '2', '3', '4', '5'],
              selected: _healthBenefit,
              enabled: !widget.submitting,
              onSelected: (v) => setState(() => _healthBenefit = v),
              caption: l10n.donateFormRatingCaption,
            ),
            const SizedBox(height: 16),
          ],
          if (askWellbeing)
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
  /// The habit description entered by the user, or — in `'structured'` mode
  /// — the resolved label of the selected catalog entry (kept for local
  /// display only; the server re-resolves the label itself from
  /// [behaviorKey] rather than trusting this).
  final String sentence;

  /// Frequency rating (1–4), or `null` when the study hides this question.
  final int? frequency;

  /// Health benefit rating (1–5), or `null` when the study hides this question.
  final int? healthBenefit;

  /// Wellbeing impact rating (1–5), or `null` when the study hides this question.
  final int? wellbeing;

  /// `'freeText'`, `'structured'`, or `'voice'` — how [sentence] was entered.
  final String inputMode;

  /// The raw speech-to-text output, before any edits — only set when
  /// [inputMode] is `'voice'`.
  final String? transcript;

  /// Whether [sentence] differs from [transcript] — only meaningful when
  /// [inputMode] is `'voice'`.
  final bool? transcriptEdited;

  /// Local path of the recorded audio clip, kept so the caller can upload it
  /// (`POST /habits/donations/:uuid/audio`) after a successful submit — only
  /// set when [inputMode] is `'voice'`.
  final String? recordedAudioPath;

  /// The picked activity_types catalog key — only set when [inputMode] is
  /// `'structured'`. Submitted instead of a typed sentence.
  final String? behaviorKey;

  /// Display label of [behaviorKey], for local UI purposes only.
  final String? behaviorLabel;

  /// Creates a [DonateFormValues].
  const DonateFormValues({
    required this.sentence,
    this.frequency,
    this.healthBenefit,
    this.wellbeing,
    this.inputMode = 'freeText',
    this.transcript,
    this.transcriptEdited,
    this.recordedAudioPath,
    this.behaviorKey,
    this.behaviorLabel,
  });
}

// ---------------------------------------------------------------------------
// Internal widgets
// ---------------------------------------------------------------------------

/// Record/stop control for voice input, with a transcribing spinner and
/// Large, centered, round hold-to-speak button plus a status label and an
/// optional inline error message. The participant presses and holds to record
/// and releases to stop and transcribe; a new take replaces the previous
/// transcript. Disabled/busy while a transcription is in flight.
class _VoiceInputControl extends StatelessWidget {
  const _VoiceInputControl({
    required this.isRecording,
    required this.isTranscribing,
    required this.enabled,
    required this.error,
    required this.onHoldStart,
    required this.onHoldEnd,
  });

  final bool isRecording;
  final bool isTranscribing;
  final bool enabled;
  final String? error;
  final VoidCallback onHoldStart;
  final VoidCallback onHoldEnd;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    // Only the overall "form is submitting" state disables the button.
    // Transcription running in the background does NOT block a re-record —
    // holding the button again starts a fresh take immediately; only the
    // last one taken is kept (see _recordingGeneration in the parent state).
    final busy = !enabled;
    final showSpinner = isTranscribing && !isRecording;
    final label = isRecording
        ? l10n.donateVoiceRecording
        : isTranscribing
        ? l10n.donateVoiceTranscribing
        : l10n.donateVoiceHoldToSpeak;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.center,
      children: [
        GestureDetector(
          onTapDown: busy ? null : (_) => onHoldStart(),
          onTapUp: busy ? null : (_) => onHoldEnd(),
          onTapCancel: busy ? null : onHoldEnd,
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 150),
            width: 88,
            height: 88,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: isRecording
                  ? const Color(0xFFDC2626)
                  : const Color(0xFF45B700),
              boxShadow: [
                BoxShadow(
                  color:
                      (isRecording
                              ? const Color(0xFFDC2626)
                              : const Color(0xFF45B700))
                          .withValues(alpha: isRecording ? 0.35 : 0.25),
                  blurRadius: isRecording ? 24 : 14,
                  spreadRadius: isRecording ? 4 : 0,
                ),
              ],
            ),
            child: Center(
              child: showSpinner
                  ? const SizedBox(
                      width: 28,
                      height: 28,
                      child: CircularProgressIndicator(
                        strokeWidth: 2.5,
                        valueColor: AlwaysStoppedAnimation<Color>(Colors.white),
                      ),
                    )
                  : Icon(
                      isRecording ? Icons.stop_rounded : Icons.mic,
                      size: 38,
                      color: Colors.white,
                    ),
            ),
          ),
        ),
        const SizedBox(height: 10),
        Text(
          label,
          textAlign: TextAlign.center,
          style: TextStyle(
            fontSize: 13,
            fontWeight: FontWeight.w700,
            color: isRecording
                ? const Color(0xFFDC2626)
                : const Color(0xFF2E8C00),
          ),
        ),
        if (error != null) ...[
          const SizedBox(height: 6),
          Text(
            error!,
            textAlign: TextAlign.center,
            style: const TextStyle(fontSize: 12, color: Color(0xFFDC2626)),
          ),
        ],
      ],
    );
  }
}

/// Catalog picker shown when the study's entry mode is `'structured'` —
/// mirrors `new_habit_screen_1_behavior.dart`'s `_BehaviorList`, but selects
/// locally into the parent's state (`setState`) instead of navigating to a
/// sub-route, since donation submits everything from this one screen.
class _StructuredBehaviorPicker extends StatelessWidget {
  const _StructuredBehaviorPicker({
    required this.options,
    required this.selectedKey,
    required this.enabled,
    required this.emptyStateLabel,
    required this.onSelected,
  });

  final List<BehaviorOption> options;
  final String? selectedKey;
  final bool enabled;
  final String emptyStateLabel;
  final ValueChanged<BehaviorOption> onSelected;

  @override
  Widget build(BuildContext context) {
    if (options.isEmpty) {
      return Text(
        emptyStateLabel,
        style: const TextStyle(fontSize: 13, color: Color(0xFF6B7280)),
      );
    }
    return Column(
      children: [
        for (final option in options)
          Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: Card(
              margin: EdgeInsets.zero,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(14),
                side: BorderSide(
                  color: selectedKey == option.key
                      ? const Color(0xFF45B700)
                      : const Color(0xFFE5E7EB),
                  width: selectedKey == option.key ? 1.5 : 1,
                ),
              ),
              child: ListTile(
                title: Text(option.label),
                trailing: selectedKey == option.key
                    ? const Icon(Icons.check_circle, color: Color(0xFF45B700))
                    : const Icon(
                        Icons.radio_button_unchecked,
                        color: Color(0xFFE5E7EB),
                      ),
                onTap: enabled ? () => onSelected(option) : null,
              ),
            ),
          ),
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
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
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
                ? PressableScale(onTap: () => onSelected(value), child: chip)
                : chip;
          }),
        ),
      ],
    );
  }
}
