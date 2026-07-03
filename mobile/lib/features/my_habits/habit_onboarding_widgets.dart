/// Educational content + widgets for the first-run habit-creation onboarding.
///
/// Copy is provided inline (en/de, with en fallback) rather than through the
/// generated l10n bundle so the flow can ship without regenerating
/// localizations. Keep the strings short and plain-language.
library;

import 'package:flutter/material.dart';

/// Localized copy for one explainer block.
class _Copy {
  const _Copy({required this.en, required this.de});
  final String en;
  final String de;
  String forLocale(String lang) => lang == 'de' ? de : en;
}

/// Static educational copy used across the onboarding flow.
class HabitOnboardingCopy {
  const HabitOnboardingCopy._();

  static const habitTitle = _Copy(
    en: "What's a habit?",
    de: 'Was ist eine Gewohnheit?',
  );
  static const habitBody = _Copy(
    en: 'A habit is a small action you repeat regularly until it becomes '
        'automatic — something you do almost without thinking. Start by '
        'choosing one specific action you would like to make part of your '
        'routine.',
    de: 'Eine Gewohnheit ist eine kleine Handlung, die du regelmäßig '
        'wiederholst, bis sie automatisch abläuft – etwas, das du fast ohne '
        'Nachdenken tust. Wähle zuerst eine konkrete Handlung, die zur '
        'Routine werden soll.',
  );

  static const cueTitle = _Copy(
    en: "What's a cue?",
    de: 'Was ist ein Auslöser?',
  );
  static const cueBody = _Copy(
    en: 'A cue is the moment or situation that triggers your habit — like '
        '"after my morning coffee". Linking your action to something you '
        'already do every day makes it far more likely to stick. Add one or '
        'more cues that fit your routine.',
    de: 'Ein Auslöser ist der Moment oder die Situation, die deine Gewohnheit '
        'anstößt – z. B. „nach meinem Morgenkaffee". Wenn du deine Handlung '
        'mit etwas verknüpfst, das du ohnehin täglich tust, bleibt sie viel '
        'eher bestehen. Füge einen oder mehrere Auslöser hinzu, die zu deinem '
        'Alltag passen.',
  );

  static const intentionRevealTitle = _Copy(
    en: 'Your implementation intention is ready',
    de: 'Deine Wenn-Dann-Absicht ist fertig',
  );
  static const intentionExplainer = _Copy(
    en: 'This "when–then" plan is called an implementation intention. Deciding '
        'in advance exactly when and where you will act makes you markedly '
        'more likely to follow through, because the cue does the remembering '
        'for you.',
    de: 'Dieser „Wenn-Dann"-Plan nennt sich Umsetzungsabsicht. Wenn du im '
        'Voraus genau festlegst, wann und wo du handelst, hältst du deutlich '
        'eher durch – denn der Auslöser übernimmt das Erinnern für dich.',
  );
  static const intentionCitation = _Copy(
    en: 'Based on habit-formation research (Gollwitzer & Sheeran, 2006).',
    de: 'Basierend auf der Gewohnheitsforschung (Gollwitzer & Sheeran, 2006).',
  );

  static String habitTitleFor(String lang) => habitTitle.forLocale(lang);
  static String habitBodyFor(String lang) => habitBody.forLocale(lang);
  static String cueTitleFor(String lang) => cueTitle.forLocale(lang);
  static String cueBodyFor(String lang) => cueBody.forLocale(lang);
  static String intentionRevealTitleFor(String lang) =>
      intentionRevealTitle.forLocale(lang);
  static String intentionExplainerFor(String lang) =>
      intentionExplainer.forLocale(lang);
  static String intentionCitationFor(String lang) =>
      intentionCitation.forLocale(lang);
}

/// A compact, dismissible educational card shown at the top of an onboarding
/// step. Purely presentational; the parent decides whether to render it.
class OnboardingExplainerCard extends StatelessWidget {
  /// Creates an [OnboardingExplainerCard].
  const OnboardingExplainerCard({
    required this.icon,
    required this.title,
    required this.body,
    this.onDismiss,
    super.key,
  });

  /// Leading icon representing the concept.
  final IconData icon;

  /// Short heading, e.g. "What's a habit?".
  final String title;

  /// Plain-language explanation.
  final String body;

  /// Optional dismiss callback; when null, no dismiss affordance is shown.
  final VoidCallback? onDismiss;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Card(
      elevation: 0,
      color: scheme.primaryContainer.withValues(alpha: 0.45),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(14),
      ),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 14, 12, 14),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(icon, color: scheme.primary),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    style: Theme.of(context).textTheme.titleSmall?.copyWith(
                          fontWeight: FontWeight.w700,
                        ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    body,
                    style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                          height: 1.4,
                        ),
                  ),
                ],
              ),
            ),
            if (onDismiss != null)
              IconButton(
                icon: const Icon(Icons.close, size: 18),
                tooltip: MaterialLocalizations.of(context).closeButtonTooltip,
                onPressed: onDismiss,
              ),
          ],
        ),
      ),
    );
  }
}
