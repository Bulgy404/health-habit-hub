import 'package:material_ui/material_ui.dart';
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

  /// When set, this is a post-donation questionnaire tied to one specific
  /// habit donation — see [QuestionnaireFormWidget.habitUuid].
  final String? habitUuid;

  /// Selected scheduled occurrence, distinct from ad-hoc donation forms.
  final String? windowId;
  final String? scheduledDate;

  /// Creates a [QuestionnaireScreen] for [slug].
  const QuestionnaireScreen({
    super.key,
    required this.slug,
    this.habitUuid,
    this.windowId,
    this.scheduledDate,
  });

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final definitionAsync = ref.watch(questionnaireProvider(slug));
    final l10n = AppLocalizations.of(context)!;
    if (habitUuid == null && windowId == null) {
      final due = ref.watch(dueQuestionnairesProvider);
      return due.when(
        loading: () =>
            const Scaffold(body: Center(child: CircularProgressIndicator())),
        error: (_, _) => Scaffold(
          body: Center(
            child: FilledButton(
              onPressed: () => ref.invalidate(dueQuestionnairesProvider),
              child: Text(l10n.retry),
            ),
          ),
        ),
        data: (items) {
          final eligible =
              items.where((q) => q.slug == slug && q.isDue).toList()..sort(
                (a, b) => (b.scheduledFor ?? DateTime(1970)).compareTo(
                  a.scheduledFor ?? DateTime(1970),
                ),
              );
          if (eligible.isEmpty) {
            final assigned = ref.watch(participantQuestionnairesProvider);
            // Unscheduled questionnaires remain available through Profile.
            if (assigned.isLoading) {
              return const Scaffold(
                body: Center(child: CircularProgressIndicator()),
              );
            }
            final adHoc =
                assigned.value?.any((q) => q.slug == slug && q.available) ??
                false;
            if (adHoc) {
              return Scaffold(
                appBar: AppBar(title: Text(l10n.questionnaireFallbackTitle)),
                body: definitionAsync.when(
                  loading: () =>
                      const Center(child: CircularProgressIndicator()),
                  error: (_, _) =>
                      Center(child: Text(l10n.failedToLoadQuestionnaire)),
                  data: (definition) => QuestionnaireFormWidget(
                    definition: definition,
                    onSubmitted: () => context.pushReplacement(
                      '/questionnaire/$slug/confirmation',
                    ),
                  ),
                ),
              );
            }
            return Scaffold(
              appBar: AppBar(title: Text(l10n.questionnaireFallbackTitle)),
              body: Center(child: Text(l10n.questionnaireCheckInUnavailable)),
            );
          }
          final selected = eligible.first;
          return QuestionnaireScreen(
            slug: slug,
            windowId: selected.windowId,
            scheduledDate: selected.scheduledDate,
          );
        },
      );
    }

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
          habitUuid: habitUuid,
          windowId: windowId,
          scheduledDate: scheduledDate,
          onSubmitted: () => context.pushReplacement(
            habitUuid != null
                ? '/questionnaire/$slug/confirmation?habitUuid=$habitUuid'
                : '/questionnaire/$slug/confirmation',
          ),
        ),
      ),
    );
  }
}

/// Confirmation screen shown after successful questionnaire submission.
class QuestionnaireConfirmationScreen extends StatelessWidget {
  /// The questionnaire slug, used to personalise the confirmation message.
  final String slug;

  /// When set, this was a post-donation questionnaire — the CTA below
  /// returns to the share screen instead of the profile screen, since that's
  /// the flow the participant was already in.
  final String? habitUuid;

  /// Creates a [QuestionnaireConfirmationScreen] for [slug].
  const QuestionnaireConfirmationScreen({
    super.key,
    required this.slug,
    this.habitUuid,
  });

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    final isPostDonation = habitUuid != null;
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
                onPressed: () =>
                    context.go(isPostDonation ? '/share' : '/settings/profile'),
                child: Text(
                  isPostDonation ? l10n.backToShare : l10n.backToProfile,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
