/// Data models for the questionnaire feature.
library;

import 'package:flutter/foundation.dart';

/// Type discriminator for questionnaire question inputs.
enum QuestionType {
  /// Single-choice (radio) question.
  singleChoice,

  /// Multi-choice (checkbox) question.
  multiChoice,

  /// Numeric scale question.
  scale,

  /// Free-text question.
  text,
}

/// An individual answer option for choice or scale questions.
@immutable
class QuestionOption {
  /// Stored answer value.
  final String value;

  /// Display label shown to the participant.
  final String label;

  /// Creates a [QuestionOption].
  const QuestionOption({required this.value, required this.label});

  /// Deserialises a [QuestionOption] from JSON.
  factory QuestionOption.fromJson(Map<String, dynamic> json) => QuestionOption(
        value: json['value'] as String,
        label: json['label'] as String,
      );
}

/// A single question within a [QuestionnaireDefinition].
@immutable
class Question {
  /// Unique question identifier.
  final String id;

  /// Question text shown to the participant.
  final String text;

  /// Input type for this question.
  final QuestionType type;

  /// Answer options (for choice and scale types).
  final List<QuestionOption> options;

  /// Whether an answer is required before the form can be submitted.
  final bool required;

  /// Minimum value for scale questions.
  final int? min;

  /// Maximum value for scale questions.
  final int? max;

  /// Creates a [Question].
  const Question({
    required this.id,
    required this.text,
    required this.type,
    required this.options,
    required this.required,
    this.min,
    this.max,
  });

  /// Deserialises a [Question] from JSON.
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
  /// URL-friendly questionnaire slug.
  final String slug;

  /// Human-readable questionnaire title.
  final String title;

  /// Whether there's an open window due now — fillable when true.
  final bool available;

  /// When the most recently closed window was submitted, or `null` if never
  /// completed.
  final DateTime? completedAt;

  /// Creates a [ParticipantQuestionnaire].
  const ParticipantQuestionnaire({
    required this.slug,
    required this.title,
    required this.available,
    this.completedAt,
  });

  /// Deserialises a [ParticipantQuestionnaire] from JSON.
  factory ParticipantQuestionnaire.fromJson(Map<String, dynamic> json) {
    return ParticipantQuestionnaire(
      slug: json['slug'] as String,
      title: json['title'] as String,
      available: json['available'] as bool? ?? true,
      completedAt: json['completedAt'] != null
          ? DateTime.tryParse(json['completedAt'] as String)
          : null,
    );
  }
}

/// Full questionnaire definition including all questions.
@immutable
class QuestionnaireDefinition {
  /// URL-friendly questionnaire slug.
  final String slug;

  /// Human-readable questionnaire title.
  final String title;

  /// Brief description of the questionnaire's purpose.
  final String description;

  /// Version string.
  final String version;

  /// Ordered list of questions.
  final List<Question> questions;

  /// Creates a [QuestionnaireDefinition].
  const QuestionnaireDefinition({
    required this.slug,
    required this.title,
    required this.description,
    required this.version,
    required this.questions,
  });

  /// Deserialises a [QuestionnaireDefinition] from JSON.
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
