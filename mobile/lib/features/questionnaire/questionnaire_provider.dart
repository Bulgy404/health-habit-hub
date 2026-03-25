import 'package:flutter_riverpod/flutter_riverpod.dart';

class QuestionnaireFormState {
  final int currentIndex;
  final Map<String, dynamic> answers;

  const QuestionnaireFormState({
    this.currentIndex = 0,
    this.answers = const {},
  });

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

class QuestionnaireFormNotifier extends Notifier<QuestionnaireFormState> {
  QuestionnaireFormNotifier(this.slug);

  final String slug;

  @override
  QuestionnaireFormState build() {
    return const QuestionnaireFormState();
  }

  void setAnswer(String questionId, dynamic value) {
    final updated = Map<String, dynamic>.from(state.answers);
    updated[questionId] = value;
    state = state.copyWith(answers: updated);
  }

  void nextQuestion() {
    state = state.copyWith(currentIndex: state.currentIndex + 1);
  }

  void previousQuestion() {
    if (state.currentIndex > 0) {
      state = state.copyWith(currentIndex: state.currentIndex - 1);
    }
  }

  void reset() {
    state = const QuestionnaireFormState();
  }
}

/// Keyed by questionnaire slug so each questionnaire has independent form state.
final questionnaireFormProvider = NotifierProvider.family<
    QuestionnaireFormNotifier, QuestionnaireFormState, String>(
  QuestionnaireFormNotifier.new,
);
