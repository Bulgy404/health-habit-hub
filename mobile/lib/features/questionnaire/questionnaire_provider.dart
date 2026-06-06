/// Riverpod state management for the questionnaire form.
library;

import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Immutable state for a questionnaire form in progress.
class QuestionnaireFormState {
  /// Index of the currently displayed question (0-based).
  final int currentIndex;

  /// Map of question ID → collected answer value.
  final Map<String, dynamic> answers;

  /// Creates a [QuestionnaireFormState].
  const QuestionnaireFormState({
    this.currentIndex = 0,
    this.answers = const {},
  });

  /// Returns a copy with the given fields replaced.
  QuestionnaireFormState copyWith({
    int? currentIndex,
    Map<String, dynamic>? answers,
  }) {
    return QuestionnaireFormState(
      currentIndex: currentIndex ?? this.currentIndex,
      answers: answers ?? this.answers,
    );
  }
}

/// Manages the form state for a single questionnaire.
class QuestionnaireFormNotifier extends Notifier<QuestionnaireFormState> {
  /// Creates a notifier for the questionnaire identified by [slug].
  QuestionnaireFormNotifier(this.slug);

  /// The questionnaire slug this notifier manages.
  final String slug;

  @override
  QuestionnaireFormState build() {
    return const QuestionnaireFormState();
  }

  /// Records [value] as the answer for [questionId].
  void setAnswer(String questionId, dynamic value) {
    final updated = Map<String, dynamic>.from(state.answers);
    updated[questionId] = value;
    state = state.copyWith(answers: updated);
  }

  /// Advances to the next question.
  void nextQuestion() {
    state = state.copyWith(currentIndex: state.currentIndex + 1);
  }

  /// Returns to the previous question (no-op if already on the first).
  void previousQuestion() {
    if (state.currentIndex > 0) {
      state = state.copyWith(currentIndex: state.currentIndex - 1);
    }
  }

  /// Resets the form to its initial state.
  void reset() {
    state = const QuestionnaireFormState();
  }
}

/// Keyed by questionnaire slug so each questionnaire has independent form state.
final questionnaireFormProvider = NotifierProvider.family<
    QuestionnaireFormNotifier, QuestionnaireFormState, String>(
  QuestionnaireFormNotifier.new,
);
