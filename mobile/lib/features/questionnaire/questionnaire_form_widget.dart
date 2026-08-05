import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../l10n/app_localizations.dart';
import 'questionnaire_models.dart';
import 'questionnaire_provider.dart';
import 'questionnaire_service.dart';

/// Reusable multi-step questionnaire form widget.
///
/// Renders all question types (single_choice, multi_choice, scale, text)
/// from a [QuestionnaireDefinition]. Saves partial progress to Riverpod state
/// on "Save & Continue" and POSTs the final response to the backend on "Submit".
class QuestionnaireFormWidget extends ConsumerStatefulWidget {
  /// The questionnaire definition containing all questions.
  final QuestionnaireDefinition definition;

  /// Called after the response has been successfully submitted to the backend.
  final VoidCallback onSubmitted;

  /// Creates a [QuestionnaireFormWidget].
  const QuestionnaireFormWidget({
    super.key,
    required this.definition,
    required this.onSubmitted,
  });

  @override
  ConsumerState<QuestionnaireFormWidget> createState() =>
      _QuestionnaireFormWidgetState();
}

class _QuestionnaireFormWidgetState
    extends ConsumerState<QuestionnaireFormWidget> {
  final _textControllers = <String, TextEditingController>{};
  bool _isSubmitting = false;
  String? _error;

  @override
  void dispose() {
    for (final c in _textControllers.values) {
      c.dispose();
    }
    super.dispose();
  }

  TextEditingController _controllerFor(String id) =>
      _textControllers.putIfAbsent(id, TextEditingController.new);

  @override
  Widget build(BuildContext context) {
    final slug = widget.definition.slug;
    final formState = ref.watch(questionnaireFormProvider(slug));
    final notifier = ref.read(questionnaireFormProvider(slug).notifier);
    final questions = widget.definition.questions;
    final total = questions.length;
    final currentIdx = formState.currentIndex;
    final question = questions[currentIdx];
    final isLast = currentIdx == total - 1;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _ProgressHeader(current: currentIdx + 1, total: total),
        Expanded(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(16),
            child: _buildQuestion(
              context,
              question,
              formState.answers,
              notifier,
            ),
          ),
        ),
        if (_error != null)
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: Text(
              _error!,
              style: TextStyle(color: Theme.of(context).colorScheme.error),
            ),
          ),
        _ActionButtons(
          currentIdx: currentIdx,
          isLast: isLast,
          isSubmitting: _isSubmitting,
          onBack: notifier.previousQuestion,
          onSaveAndContinue: () => _onSaveAndContinue(
            context,
            question,
            formState.answers,
            notifier,
          ),
          onSubmit: () => _onSubmit(context, formState, notifier),
        ),
      ],
    );
  }

  Widget _buildQuestion(
    BuildContext context,
    Question question,
    Map<String, dynamic> answers,
    QuestionnaireFormNotifier notifier,
  ) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _QuestionHeader(question: question),
        const SizedBox(height: 16),
        switch (question.type) {
          QuestionType.singleChoice => _SingleChoiceQuestion(
            question: question,
            answers: answers,
            notifier: notifier,
            onChanged: () => setState(() => _error = null),
          ),
          QuestionType.multiChoice => _MultiChoiceQuestion(
            question: question,
            answers: answers,
            notifier: notifier,
            onChanged: () => setState(() => _error = null),
          ),
          QuestionType.scale => _ScaleQuestion(
            question: question,
            answers: answers,
            notifier: notifier,
            onChanged: () => setState(() => _error = null),
          ),
          QuestionType.text => _TextQuestion(
            question: question,
            answers: answers,
            controller: _controllerFor(question.id),
            notifier: notifier,
            onChanged: () => setState(() => _error = null),
          ),
        },
      ],
    );
  }

  bool _validateQuestion(Question question, Map<String, dynamic> answers) {
    if (!question.required) return true;
    final answer = answers[question.id];
    if (answer == null) return false;
    if (answer is String && answer.trim().isEmpty) return false;
    if (answer is List && answer.isEmpty) return false;
    return true;
  }

  void _onSaveAndContinue(
    BuildContext context,
    Question question,
    Map<String, dynamic> answers,
    QuestionnaireFormNotifier notifier,
  ) {
    if (!_validateQuestion(question, answers)) {
      final l10n = AppLocalizations.of(context)!;
      setState(() => _error = l10n.questionnaireFormRequiredQuestion);
      return;
    }
    setState(() => _error = null);
    notifier.nextQuestion();
  }

  Future<void> _onSubmit(
    BuildContext context,
    QuestionnaireFormState formState,
    QuestionnaireFormNotifier notifier,
  ) async {
    final l10n = AppLocalizations.of(context)!;
    final questions = widget.definition.questions;
    final answers = formState.answers;

    if (!_validateQuestion(questions[formState.currentIndex], answers)) {
      setState(() => _error = l10n.questionnaireFormRequiredQuestion);
      return;
    }
    for (final q in questions) {
      if (!_validateQuestion(q, answers)) {
        setState(() => _error = l10n.questionnaireFormAnswerAllRequired);
        return;
      }
    }

    setState(() {
      _isSubmitting = true;
      _error = null;
    });

    try {
      final service = ref.read(questionnaireServiceProvider);
      await service.submitResponse(
        questionnaireSlug: widget.definition.slug,
        answers: answers,
      );
      if (!mounted) return;
      notifier.reset();
      // Refresh completion state everywhere it's shown — Profile's Health
      // Questionnaires list (greys this one out) and Share's due-task cards.
      ref.invalidate(participantQuestionnairesProvider);
      ref.invalidate(dueQuestionnairesProvider);
      widget.onSubmitted();
    } on DioException catch (err) {
      if (!mounted) return;
      // Already completed / not due again yet — the backend enforces this
      // even if the UI's greyed-out state was somehow bypassed (stale cache,
      // a background tab). Also refresh so the UI catches up.
      if (err.response?.statusCode == 409) {
        ref.invalidate(participantQuestionnairesProvider);
        ref.invalidate(dueQuestionnairesProvider);
      }
      setState(() {
        _isSubmitting = false;
        _error = err.response?.statusCode == 409
            ? l10n.questionnaireAlreadyCompleted
            : l10n.submissionFailed;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _isSubmitting = false;
        _error = l10n.submissionFailed;
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Sub-widgets
// ---------------------------------------------------------------------------

class _ProgressHeader extends StatelessWidget {
  final int current;
  final int total;

  const _ProgressHeader({required this.current, required this.total});

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            l10n.questionnaireFormProgressLabel(current, total),
            style: Theme.of(context).textTheme.labelMedium,
          ),
          const SizedBox(height: 4),
          LinearProgressIndicator(
            value: current / total,
            minHeight: 6,
            borderRadius: BorderRadius.circular(3),
          ),
        ],
      ),
    );
  }
}

class _QuestionHeader extends StatelessWidget {
  final Question question;

  const _QuestionHeader({required this.question});

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Expanded(
          child: Text(
            question.text,
            style: Theme.of(context).textTheme.titleMedium,
          ),
        ),
        if (question.required)
          const Text(' *', style: TextStyle(color: Colors.red)),
      ],
    );
  }
}

class _ActionButtons extends StatelessWidget {
  final int currentIdx;
  final bool isLast;
  final bool isSubmitting;
  final VoidCallback onBack;
  final VoidCallback onSaveAndContinue;
  final VoidCallback onSubmit;

  const _ActionButtons({
    required this.currentIdx,
    required this.isLast,
    required this.isSubmitting,
    required this.onBack,
    required this.onSaveAndContinue,
    required this.onSubmit,
  });

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    // This widget isn't wrapped in a SafeArea by its parent screen (a plain
    // Scaffold), so a flat EdgeInsets.all(16) previously left these buttons
    // right up against the iPhone home indicator / Android gesture bar, and
    // felt tight against the side edges too. SafeArea's `minimum` guarantees
    // at least that much space even on devices with no system inset, while
    // still respecting a larger one where it exists.
    return SafeArea(
      top: false,
      minimum: const EdgeInsets.only(bottom: 12),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(20, 16, 20, 20),
        child: Row(
          children: [
            if (currentIdx > 0) ...[
              Expanded(
                child: OutlinedButton(
                  onPressed: onBack,
                  child: Text(l10n.questionnaireFormBackButton),
                ),
              ),
              const SizedBox(width: 12),
            ],
            Expanded(
              flex: 2,
              child: isLast
                  ? FilledButton(
                      onPressed: isSubmitting ? null : onSubmit,
                      child: isSubmitting
                          ? const SizedBox(
                              height: 20,
                              width: 20,
                              child: CircularProgressIndicator(strokeWidth: 2),
                            )
                          : Text(l10n.questionnaireFormSubmitButton),
                    )
                  : FilledButton(
                      onPressed: onSaveAndContinue,
                      child: Text(l10n.questionnaireFormSaveAndContinueButton),
                    ),
            ),
          ],
        ),
      ),
    );
  }
}

class _SingleChoiceQuestion extends StatelessWidget {
  final Question question;
  final Map<String, dynamic> answers;
  final QuestionnaireFormNotifier notifier;
  final VoidCallback onChanged;

  const _SingleChoiceQuestion({
    required this.question,
    required this.answers,
    required this.notifier,
    required this.onChanged,
  });

  @override
  Widget build(BuildContext context) {
    final selected = answers[question.id] as String?;
    return Column(
      children: question.options
          .map(
            (opt) => _RadioOptionTile(
              value: opt.value,
              label: opt.label,
              selected: selected == opt.value,
              onTap: () {
                notifier.setAnswer(question.id, opt.value);
                onChanged();
              },
            ),
          )
          .toList(),
    );
  }
}

class _MultiChoiceQuestion extends StatelessWidget {
  final Question question;
  final Map<String, dynamic> answers;
  final QuestionnaireFormNotifier notifier;
  final VoidCallback onChanged;

  const _MultiChoiceQuestion({
    required this.question,
    required this.answers,
    required this.notifier,
    required this.onChanged,
  });

  @override
  Widget build(BuildContext context) {
    final selected =
        (answers[question.id] as List<dynamic>?)?.cast<String>() ?? [];
    return Column(
      children: question.options
          .map(
            (opt) => CheckboxListTile(
              value: selected.contains(opt.value),
              title: Text(opt.label),
              onChanged: (checked) {
                final updated = List<String>.from(selected);
                if (checked == true) {
                  updated.add(opt.value);
                } else {
                  updated.remove(opt.value);
                }
                notifier.setAnswer(question.id, updated);
                onChanged();
              },
            ),
          )
          .toList(),
    );
  }
}

class _ScaleQuestion extends StatelessWidget {
  final Question question;
  final Map<String, dynamic> answers;
  final QuestionnaireFormNotifier notifier;
  final VoidCallback onChanged;

  const _ScaleQuestion({
    required this.question,
    required this.answers,
    required this.notifier,
    required this.onChanged,
  });

  @override
  Widget build(BuildContext context) {
    final minVal = (question.min ?? 0).toDouble();
    final maxVal = question.options.isNotEmpty
        ? (question.options.length - 1).toDouble()
        : (question.max ?? 10).toDouble();
    final current = (answers[question.id] as num?)?.toDouble() ?? minVal;
    final divisions = (maxVal - minVal).toInt();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Slider(
          value: current.clamp(minVal, maxVal),
          min: minVal,
          max: maxVal,
          divisions: divisions > 0 ? divisions : null,
          label:
              question.options.isNotEmpty &&
                  current.toInt() < question.options.length
              ? question.options[current.toInt()].label
              : current.toInt().toString(),
          onChanged: (val) {
            notifier.setAnswer(question.id, val.toInt());
            onChanged();
          },
        ),
        if (question.options.isNotEmpty)
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Flexible(
                child: Text(
                  question.options.first.label,
                  style: Theme.of(context).textTheme.labelSmall,
                  textAlign: TextAlign.left,
                ),
              ),
              Flexible(
                child: Text(
                  question.options.last.label,
                  style: Theme.of(context).textTheme.labelSmall,
                  textAlign: TextAlign.right,
                ),
              ),
            ],
          )
        else
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(minVal.toInt().toString()),
              Text(maxVal.toInt().toString()),
            ],
          ),
      ],
    );
  }
}

class _TextQuestion extends StatelessWidget {
  final Question question;
  final Map<String, dynamic> answers;
  final TextEditingController controller;
  final QuestionnaireFormNotifier notifier;
  final VoidCallback onChanged;

  const _TextQuestion({
    required this.question,
    required this.answers,
    required this.controller,
    required this.notifier,
    required this.onChanged,
  });

  @override
  Widget build(BuildContext context) {
    if (controller.text.isEmpty && answers[question.id] != null) {
      controller.text = answers[question.id].toString();
    }
    final l10n = AppLocalizations.of(context)!;
    return TextField(
      controller: controller,
      maxLines: 4,
      decoration: InputDecoration(
        border: const OutlineInputBorder(),
        hintText: l10n.questionnaireFormAnswerHint,
      ),
      onChanged: (val) {
        notifier.setAnswer(question.id, val);
        onChanged();
      },
    );
  }
}

/// Simple radio-button tile that does not rely on the deprecated [Radio] API.
class _RadioOptionTile extends StatelessWidget {
  final String value;
  final String label;
  final bool selected;
  final VoidCallback onTap;

  const _RadioOptionTile({
    required this.value,
    required this.label,
    required this.selected,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final color = Theme.of(context).colorScheme.primary;
    return ListTile(
      leading: Icon(
        selected ? Icons.radio_button_checked : Icons.radio_button_unchecked,
        color: selected ? color : null,
      ),
      title: Text(label),
      onTap: onTap,
    );
  }
}
