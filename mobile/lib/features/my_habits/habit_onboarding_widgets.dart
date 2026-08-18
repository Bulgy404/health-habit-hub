/// Educational content + widgets for the first-run habit-creation onboarding.
///
/// Copy is provided inline (en/de/ja) rather than through the generated l10n
/// bundle so the flow can ship without regenerating localizations. Keep the
/// strings short and plain-language.
library;

import 'package:flutter/material.dart';

import '../../theme/app_colors.dart';

/// Localized copy for one explainer block.
class _Copy {
  const _Copy({required this.en, required this.de, required this.ja});
  final String en;
  final String de;
  final String ja;
  String forLocale(String lang) {
    if (lang == 'de') return de;
    if (lang == 'ja') return ja;
    return en;
  }
}

/// Static educational copy used across the onboarding flow.
class HabitOnboardingCopy {
  const HabitOnboardingCopy._();

  static const habitTitle = _Copy(
    en: "What's a habit?",
    de: 'Was ist eine Gewohnheit?',
    ja: '習慣とは？',
  );
  static const habitBody = _Copy(
    en:
        'A habit is a small action you repeat regularly until it becomes '
        'automatic: something you do almost without thinking. Start by '
        'choosing one specific action you would like to make part of your '
        'routine.',
    de:
        'Eine Gewohnheit ist eine kleine Handlung, die du regelmäßig '
        'wiederholst, bis sie automatisch abläuft: etwas, das du fast ohne '
        'Nachdenken tust. Wähle zuerst eine konkrete Handlung, die zur '
        'Routine werden soll.',
    ja:
        '習慣とは、自動的にできるようになるまで繰り返す小さな行動のことです。'
        'ほとんど意識せずに行えるようになります。まずは、日課に取り入れたい'
        '具体的な行動を一つ選びましょう。',
  );

  static const cueTitle = _Copy(
    en: "What's a cue?",
    de: 'Was ist ein Auslöser?',
    ja: 'きっかけとは？',
  );
  static const cueBody = _Copy(
    en:
        'A cue is the moment or situation that triggers your habit, like '
        '"after my morning coffee". Linking your action to something you '
        'already do every day makes it far more likely to stick. Add one or '
        'more cues that fit your routine.',
    de:
        'Ein Auslöser ist der Moment oder die Situation, die deine Gewohnheit '
        'anstößt, z. B. „nach meinem Morgenkaffee". Wenn du deine Handlung '
        'mit etwas verknüpfst, das du ohnehin täglich tust, bleibt sie viel '
        'eher bestehen. Füge einen oder mehrere Auslöser hinzu, die zu deinem '
        'Alltag passen.',
    ja:
        'きっかけとは、習慣を引き起こす瞬間や状況のことです。例えば「朝の'
        'コーヒーを飲んだ後」などです。すでに毎日行っていることと行動を'
        '結びつけると、習慣が定着しやすくなります。あなたの生活に合った'
        'きっかけを一つ以上追加しましょう。',
  );

  /// Appended to [cueBody] when habit stacking is available for this
  /// participant, so the "what's a cue" explainer also introduces stacking
  /// as an alternative to typing a separate cue.
  static const cueStackingHint = _Copy(
    en:
        ' You can also stack this habit onto one you already do — the '
        'existing habit becomes the cue, so you may not need to write a '
        'separate one.',
    de:
        ' Du kannst diese Gewohnheit auch an eine bestehende „anstapeln" – '
        'die bestehende Gewohnheit wird dann selbst zum Auslöser, sodass du '
        'keinen separaten Auslöser formulieren musst.',
    ja:
        'また、すでに行っている習慣にこの習慣を「積み重ねる」こともできます。'
        'その場合、既存の習慣自体がきっかけになるため、別のきっかけを'
        '書く必要がない場合があります。',
  );

  static const intentionRevealTitle = _Copy(
    en: 'Your implementation intention is ready',
    de: 'Deine Wenn-Dann-Absicht ist fertig',
    ja: '実行意図の準備ができました',
  );
  static const intentionExplainer = _Copy(
    en:
        'This "when–then" plan is called an implementation intention. Deciding '
        'in advance exactly when and where you will act makes you markedly '
        'more likely to follow through, because the cue does the remembering '
        'for you.',
    de:
        'Dieser „Wenn-Dann"-Plan nennt sich Umsetzungsabsicht. Wenn du im '
        'Voraus genau festlegst, wann und wo du handelst, hältst du deutlich '
        'eher durch – denn der Auslöser übernimmt das Erinnern für dich.',
    ja:
        'この「いつ・どうする」という計画は実行意図と呼ばれます。いつ、'
        'どこで行動するかをあらかじめ正確に決めておくことで、実行できる'
        '可能性が大きく高まります。きっかけがあなたの代わりに思い出して'
        'くれるからです。',
  );
  static const intentionCitation = _Copy(
    en: 'Based on habit-formation research (Gollwitzer & Sheeran, 2006).',
    de: 'Basierend auf der Gewohnheitsforschung (Gollwitzer & Sheeran, 2006).',
    ja: '習慣形成に関する研究に基づく（Gollwitzer & Sheeran, 2006年）。',
  );

  static String habitTitleFor(String lang) => habitTitle.forLocale(lang);
  static String habitBodyFor(String lang) => habitBody.forLocale(lang);
  static String cueTitleFor(String lang) => cueTitle.forLocale(lang);
  static String cueBodyFor(String lang, {bool includeStackingHint = false}) =>
      cueBody.forLocale(lang) +
      (includeStackingHint ? cueStackingHint.forLocale(lang) : '');
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
    this.extra,
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

  /// Optional extra content rendered below [body] (e.g. a worked example),
  /// inside the same card. Null by default so existing call sites are
  /// unaffected.
  final Widget? extra;

  @override
  Widget build(BuildContext context) {
    // A fixed, pre-checked-for-contrast green/on-green pair (see
    // AppColors.greenLight/onGreenLight) rather than an alpha-blended
    // colorScheme.primaryContainer — the latter turns into a muddy,
    // low-contrast tint in dark mode since it depends on whatever's behind
    // the card.
    final colors = context.appColors;
    return Card(
      elevation: 0,
      color: colors.greenLight,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 14, 12, 14),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(icon, color: colors.onGreenLight),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    style: Theme.of(context).textTheme.titleSmall?.copyWith(
                      color: colors.onGreenLight,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    body,
                    style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                      color: colors.onGreenLight,
                      height: 1.4,
                    ),
                  ),
                  if (extra != null) ...[const SizedBox(height: 10), extra!],
                ],
              ),
            ),
            if (onDismiss != null)
              IconButton(
                icon: Icon(Icons.close, size: 18, color: colors.onGreenLight),
                tooltip: MaterialLocalizations.of(context).closeButtonTooltip,
                onPressed: onDismiss,
              ),
          ],
        ),
      ),
    );
  }
}
