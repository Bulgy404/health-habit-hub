import 'package:flutter/foundation.dart';

enum QuestionType { singleChoice, multiChoice, scale, text }

@immutable
class QuestionOption {
  final String value;
  final String label;

  const QuestionOption({required this.value, required this.label});

  factory QuestionOption.fromJson(Map<String, dynamic> json) => QuestionOption(
        value: json['value'] as String,
        label: json['label'] as String,
      );
}

@immutable
class Question {
  final String id;
  final String text;
  final QuestionType type;
  final List<QuestionOption> options;
  final bool required;
  final int? min;
  final int? max;

  const Question({
    required this.id,
    required this.text,
    required this.type,
    required this.options,
    required this.required,
    this.min,
    this.max,
  });

  factory Question.fromJson(Map<String, dynamic> json) {
    final typeStr = json['type'] as String? ?? 'text';
    final type = switch (typeStr) {
      'single_choice' => QuestionType.singleChoice,
      'multi_choice' => QuestionType.multiChoice,
      'scale' => QuestionType.scale,
      _ => QuestionType.text,
    };
    return Question(
      id: json['id'] as String,
      text: json['text'] as String,
      type: type,
      options: (json['options'] as List<dynamic>? ?? [])
          .cast<Map<String, dynamic>>()
          .map(QuestionOption.fromJson)
          .toList(),
      required: json['required'] as bool? ?? false,
      min: json['min'] as int?,
      max: json['max'] as int?,
    );
  }
}

/// Lightweight summary of a questionnaire assigned to the participant's study.
///
/// Returned by GET /api/v1/participant/questionnaires.
@immutable
class ParticipantQuestionnaire {
  final String slug;
  final String title;

  const ParticipantQuestionnaire({required this.slug, required this.title});

  factory ParticipantQuestionnaire.fromJson(Map<String, dynamic> json) {
    return ParticipantQuestionnaire(
      slug: json['slug'] as String,
      title: json['title'] as String,
    );
  }
}

@immutable
class QuestionnaireDefinition {
  final String slug;
  final String title;
  final String description;
  final String version;
  final List<Question> questions;

  const QuestionnaireDefinition({
    required this.slug,
    required this.title,
    required this.description,
    required this.version,
    required this.questions,
  });

  factory QuestionnaireDefinition.fromJson(Map<String, dynamic> json) {
    return QuestionnaireDefinition(
      slug: json['slug'] as String,
      title: json['title'] as String,
      description: json['description'] as String? ?? '',
      version: json['version'] as String? ?? '1.0',
      questions: (json['questions'] as List<dynamic>? ?? [])
          .cast<Map<String, dynamic>>()
          .map(Question.fromJson)
          .toList(),
    );
  }
}
