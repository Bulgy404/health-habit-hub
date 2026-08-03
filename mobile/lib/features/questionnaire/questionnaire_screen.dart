import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../l10n/app_localizations.dart';
import '../../theme/app_colors.dart';
import '../../theme/app_icons.dart';
import 'questionnaire_form_widget.dart';
import 'questionnaire_service.dart';

/// Generic questionnaire screen parameterised by [slug].
///
/// Used for both SLIQ (`/questionnaire/sliq`) and
/// RAND-36 (`/questionnaire/rand-36`) — no separate screens needed.
class QuestionnaireScreen extends ConsumerWidget {
  /// The questionnaire slug identifying which questionnaire to display.
  final String slug;

  /// Creates a [QuestionnaireScreen] for [slug].
  const QuestionnaireScreen({super.key, required this.slug});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final definitionAsync = ref.watch(questionnaireProvider(slug));
    final l10n = AppLocalizations.of(context)!;

    return Scaffold(
      appBar: AppBar(
        title: definitionAsync.maybeWhen(
          data: (def) => Text(def.title),
          orElse: () => Text(l10n.questionnaireFallbackTitle),
        ),
      ),
      body: definitionAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (err, _) => Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Icon(Icons.error_outline, size: 48, color: Colors.red),
                const SizedBox(height: 12),
                Text(
                  l10n.failedToLoadQuestionnaire,
                  style: Theme.of(context).textTheme.titleMedium,
                ),
                const SizedBox(height: 8),
                FilledButton(
                  onPressed: () => ref.invalidate(questionnaireProvider(slug)),
                  child: Text(l10n.retry),
                ),
              ],
            ),
          ),
        ),
        data: (definition) => QuestionnaireFormWidget(
          definition: definition,
          onSubmitted: () =>
              context.pushReplacement('/questionnaire/$slug/confirmation'),
        ),
      ),
    );
  }
}

/// Confirmation screen shown after successful questionnaire submission.
class QuestionnaireConfirmationScreen extends StatelessWidget {
  /// The questionnaire slug, used to personalise the confirmation message.
  final String slug;

  /// Creates a [QuestionnaireConfirmationScreen] for [slug].
  const QuestionnaireConfirmationScreen({super.key, required this.slug});

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    return Scaffold(
      appBar: AppBar(title: Text(l10n.thankYou)),
      body: Center(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(
                AppIcons.success,
                size: 72,
                color: context.appColors.primary,
              ),
              const SizedBox(height: 20),
              Text(
                l10n.questionnaireResponseSubmitted,
                style: Theme.of(context).textTheme.headlineSmall,
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 12),
              Text(
                l10n.questionnaireThankYou,
                style: Theme.of(context).textTheme.bodyMedium,
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 32),
              FilledButton(
                onPressed: () => context.go('/settings/profile'),
                child: Text(l10n.backToProfile),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
