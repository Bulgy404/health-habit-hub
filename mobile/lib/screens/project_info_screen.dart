/// "About the project" info page — explains how shared habits are used, what
/// cues and implementation intentions are, how recommendations and adaptive
/// reminders work, and what SRHI measures. Linked from the "Why share?" card
/// on the donate screen via a "Read more" tap target.
///
/// Copy is provided inline (en/de/ja), the same set of languages used by
/// habit_onboarding_widgets.dart for large explanatory blocks, rather than
/// through the generated l10n bundle — this is a lot of prose for a single
/// static page, and going through full ARB translation for all 5 app
/// languages was judged not worth the translation-quality risk here.
library;

import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

const _kProjectGithubUrl =
    'https://github.com/Bulgy404/health-habit-hub';

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

class _Section {
  const _Section({required this.icon, required this.title, required this.body});
  final IconData icon;
  final _Copy title;
  final _Copy body;
}

const _intro = _Copy(
  en:
      "HabConnect studies how everyday habits form, and how personalized "
      "recommendations can help people build healthier routines. Everything "
      "you share and every habit you track contributes to that research, "
      "anonymously.",
  de:
      "HabConnect untersucht, wie sich Alltagsgewohnheiten bilden und wie "
      "personalisierte Empfehlungen Menschen dabei helfen können, gesündere "
      "Routinen aufzubauen. Alles, was du teilst, und jede Gewohnheit, die du "
      "verfolgst, trägt anonym zu dieser Forschung bei.",
  ja:
      "HabConnectは、日常の習慣がどのように形成されるか、そしてパーソナライズ"
      "された推奨がより健康的なルーティンの構築にどう役立つかを研究していま"
      "す。あなたが共有するすべての情報と記録するすべての習慣が、匿名でこの"
      "研究に貢献します。",
);

const _sections = [
  _Section(
    icon: Icons.volunteer_activism,
    title: _Copy(
      en: "How your shared habit is used",
      de: "Wie deine geteilte Gewohnheit verwendet wird",
      ja: "共有した習慣はどのように使われるか",
    ),
    body: _Copy(
      en:
          "When you share a habit, it's stripped of anything that could "
          "identify you and added to an open research dataset. Behind the "
          "scenes, the system reads the sentence you wrote, figures out the "
          "situation it happens in (time of day, location, what comes right "
          "before it), and maps it to established behaviour-change "
          "techniques. That structured version, alongside your original "
          "wording, helps researchers understand what makes habits stick "
          "and improves the recommendations everyone in the app receives.",
      de:
          "Wenn du eine Gewohnheit teilst, wird sie von allem befreit, das "
          "dich identifizieren könnte, und einem offenen Forschungsdatensatz "
          "hinzugefügt. Im Hintergrund liest das System den Satz, den du "
          "geschrieben hast, ermittelt die Situation, in der die Gewohnheit "
          "stattfindet (Tageszeit, Ort, was unmittelbar vorausgeht), und "
          "ordnet sie etablierten Verhaltensänderungstechniken zu. Diese "
          "strukturierte Version hilft zusammen mit deinem Originaltext "
          "Forschenden zu verstehen, was Gewohnheiten dauerhaft macht, und "
          "verbessert die Empfehlungen für alle in der App.",
      ja:
          "習慣を共有すると、あなたを特定できる情報はすべて取り除かれ、公開の"
          "研究データセットに追加されます。裏側では、システムがあなたの書いた"
          "文章を読み取り、その習慣が起こる状況（時間帯、場所、直前に行うこ"
          "と）を把握し、確立された行動変容技法に対応付けます。この構造化さ"
          "れたデータは、あなたの元の文章とともに、研究者が習慣が定着する理"
          "由を理解する助けとなり、アプリ内のすべての人への推奨を改善しま"
          "す。",
    ),
  ),
  _Section(
    icon: Icons.bolt,
    title: _Copy(
      en: "What's a cue?",
      de: "Was ist ein Auslöser?",
      ja: "きっかけとは？",
    ),
    body: _Copy(
      en:
          'A cue is the moment or situation that triggers a habit, like '
          '"after my morning coffee" or "when I sit down at my desk". '
          "Pairing a new habit with something you already do every day, an "
          "established technique called an implementation intention, makes "
          "it far more likely to become automatic.",
      de:
          "Ein Auslöser ist der Moment oder die Situation, die eine "
          'Gewohnheit anstößt, zum Beispiel „nach meinem Morgenkaffee" oder '
          '„wenn ich mich an meinen Schreibtisch setze". Eine neue '
          "Gewohnheit mit etwas zu verknüpfen, das du ohnehin täglich tust, "
          "eine etablierte Technik namens Wenn-Dann-Plan, macht es deutlich "
          "wahrscheinlicher, dass sie automatisch wird.",
      ja:
          "きっかけとは、習慣を引き起こす瞬間や状況のことです。例えば「朝の"
          "コーヒーを飲んだ後」や「デスクに座ったとき」などです。新しい習慣"
          "をすでに毎日行っていることと結びつける、実行意図と呼ばれる確立さ"
          "れた手法により、習慣が自動化される可能性が大きく高まります。",
    ),
  ),
  _Section(
    icon: Icons.public,
    title: _Copy(
      en: "Why this matters",
      de: "Warum das wichtig ist",
      ja: "なぜ重要なのか",
    ),
    body: _Copy(
      en:
          "Most health advice is generic. HabConnect's goal is the "
          "opposite: recommendations built from real examples of how real "
          "people actually build habits, tested and refined with the "
          "community that uses this app. The more habits shared, the "
          "better those recommendations get for everyone, including future "
          "participants.",
      de:
          "Die meisten Gesundheitstipps sind allgemein gehalten. Das Ziel "
          "von HabConnect ist das Gegenteil: Empfehlungen, die auf echten "
          "Beispielen basieren, wie Menschen tatsächlich Gewohnheiten "
          "aufbauen, getestet und verfeinert mit der Community, die diese "
          "App nutzt. Je mehr Gewohnheiten geteilt werden, desto besser "
          "werden diese Empfehlungen für alle, auch für zukünftige "
          "Teilnehmende.",
      ja:
          "多くの健康アドバイスは一般的なものです。HabConnectの目的はその逆"
          "です。実際に人々がどのように習慣を築いているかという実例に基づ"
          "き、このアプリを使うコミュニティとともにテストと改善を重ねた推奨"
          "を提供することです。共有される習慣が増えるほど、これらの推奨は将"
          "来の参加者を含むすべての人にとってより良いものになります。",
    ),
  ),
  _Section(
    icon: Icons.lightbulb,
    title: _Copy(
      en: "How recommendations work",
      de: "Wie Empfehlungen entstehen",
      ja: "推奨はどのように作られるか",
    ),
    body: _Copy(
      en:
          "When you ask for a recommendation, the system searches the "
          "shared-habit dataset for people in similar situations, then a "
          "language model turns the best matches into a suggestion "
          "tailored to your goal.",
      de:
          "Wenn du eine Empfehlung anfragst, durchsucht das System den "
          "Datensatz geteilter Gewohnheiten nach Menschen in ähnlichen "
          "Situationen. Ein Sprachmodell verwandelt die besten Treffer dann "
          "in einen auf dein Ziel zugeschnittenen Vorschlag.",
      ja:
          "推奨をリクエストすると、システムは似た状況にある人々を共有習慣"
          "データセットから検索します。そして言語モデルが最も近い事例を、あ"
          "なたの目標に合わせた提案へと変換します。",
    ),
  ),
  _Section(
    icon: Icons.notifications_active,
    title: _Copy(
      en: "Adaptive reminders",
      de: "Anpassungsfähige Erinnerungen",
      ja: "適応型リマインダー",
    ),
    body: _Copy(
      en:
          "Reminders for a new habit start daily. As you log it "
          "consistently and your SRHI score rises (meaning the habit is "
          "becoming automatic), reminders taper off on their own. You're "
          "always in control from the habit's settings.",
      de:
          "Erinnerungen für eine neue Gewohnheit beginnen täglich. Wenn du "
          "sie konsequent protokollierst und dein SRHI-Wert steigt (das "
          "heißt, die Gewohnheit wird automatischer), lassen die "
          "Erinnerungen von selbst nach. Du behältst über die Einstellungen "
          "der Gewohnheit jederzeit die Kontrolle.",
      ja:
          "新しい習慣のリマインダーは毎日届きます。一貫して記録を続けSRHIス"
          "コアが上がる（つまり習慣がより自動的になる）につれて、リマイン"
          "ダーは自然と少なくなっていきます。習慣の設定からいつでも自分でコ"
          "ントロールできます。",
    ),
  ),
  _Section(
    icon: Icons.psychology,
    title: _Copy(
      en: "What's SRHI?",
      de: "Was ist SRHI?",
      ja: "SRHIとは？",
    ),
    body: _Copy(
      en:
          "The Self-Report Habit Index (SRHI) is a short weekly check-in "
          "that measures how automatic a habit feels, on a 1–7 scale. "
          "Tracking it over time shows your habit-strength trajectory, and "
          "the app uses it to know when to ease off reminders.",
      de:
          "Der Self-Report Habit Index (SRHI) ist ein kurzer wöchentlicher "
          "Check-in, der misst, wie automatisch sich eine Gewohnheit "
          "anfühlt, auf einer Skala von 1 bis 7. Er zeigt im Zeitverlauf, "
          "wie stark deine Gewohnheit geworden ist, und die App nutzt ihn, "
          "um zu wissen, wann Erinnerungen reduziert werden können.",
      ja:
          "自己報告習慣指標（SRHI）は、習慣がどれくらい自動的に感じられるか"
          "を1〜7の尺度で測定する、短い週次チェックインです。時間の経過に伴"
          "う習慣の強さの推移を示し、アプリはこれを使ってリマインダーを減ら"
          "すタイミングを判断します。",
    ),
  ),
];

const _flowSteps = [
  _Copy(en: 'Your goal', de: 'Dein Ziel', ja: 'あなたの目標'),
  _Copy(
    en: 'Similar shared habits',
    de: 'Ähnliche geteilte Gewohnheiten',
    ja: '似た共有習慣',
  ),
  _Copy(
    en: 'Behaviour-change technique',
    de: 'Verhaltensänderungstechnik',
    ja: '行動変容技法',
  ),
  _Copy(
    en: 'Personalized suggestion',
    de: 'Personalisierter Vorschlag',
    ja: 'パーソナライズされた提案',
  ),
];

const _pageTitle = _Copy(
  en: 'About HabConnect',
  de: 'Über HabConnect',
  ja: 'HabConnectについて',
);

const _openSourceNote = _Copy(
  en: 'HabConnect is open source.',
  de: 'HabConnect ist Open Source.',
  ja: 'HabConnectはオープンソースです。',
);

const _viewOnGithub = _Copy(
  en: 'View on GitHub',
  de: 'Auf GitHub ansehen',
  ja: 'GitHubで見る',
);

/// "About the project" screen — reachable from the donate screen's "Why
/// share?" card via a "Read more" tap target.
class ProjectInfoScreen extends StatelessWidget {
  /// Creates a [ProjectInfoScreen].
  const ProjectInfoScreen({super.key});

  Future<void> _openGithub(BuildContext context) async {
    final uri = Uri.parse(_kProjectGithubUrl);
    final ok = await launchUrl(uri, mode: LaunchMode.externalApplication);
    if (!ok && context.mounted) {
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text(_kProjectGithubUrl)));
    }
  }

  @override
  Widget build(BuildContext context) {
    final lang = Localizations.localeOf(context).languageCode;
    final colorScheme = Theme.of(context).colorScheme;

    return Scaffold(
      appBar: AppBar(title: Text(_pageTitle.forLocale(lang))),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Text(
            _intro.forLocale(lang),
            style: Theme.of(context).textTheme.bodyLarge?.copyWith(height: 1.5),
          ),
          const SizedBox(height: 24),
          for (final section in _sections) ...[
            _InfoSection(section: section, lang: lang),
            const SizedBox(height: 24),
          ],
          _RecommenderFlowDiagram(lang: lang),
          const SizedBox(height: 32),
          Center(
            child: Column(
              children: [
                Text(
                  _openSourceNote.forLocale(lang),
                  style: TextStyle(color: colorScheme.onSurfaceVariant),
                ),
                const SizedBox(height: 8),
                OutlinedButton.icon(
                  onPressed: () => _openGithub(context),
                  icon: const Icon(Icons.open_in_new, size: 16),
                  label: Text(_viewOnGithub.forLocale(lang)),
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),
        ],
      ),
    );
  }
}

class _InfoSection extends StatelessWidget {
  const _InfoSection({required this.section, required this.lang});
  final _Section section;
  final String lang;

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Icon(section.icon, size: 18, color: const Color(0xFF45B700)),
            const SizedBox(width: 8),
            Expanded(
              child: Text(
                section.title.forLocale(lang),
                style: Theme.of(
                  context,
                ).textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w700),
              ),
            ),
          ],
        ),
        const SizedBox(height: 8),
        Text(
          section.body.forLocale(lang),
          style: Theme.of(context).textTheme.bodyMedium?.copyWith(
            height: 1.5,
            color: colorScheme.onSurface,
          ),
        ),
      ],
    );
  }
}

/// Small step-by-step visualization of the recommender pipeline: goal in,
/// personalized suggestion out.
class _RecommenderFlowDiagram extends StatelessWidget {
  const _RecommenderFlowDiagram({required this.lang});
  final String lang;

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: colorScheme.surfaceContainerHighest,
        borderRadius: BorderRadius.circular(16),
      ),
      child: Wrap(
        crossAxisAlignment: WrapCrossAlignment.center,
        alignment: WrapAlignment.center,
        spacing: 6,
        runSpacing: 12,
        children: [
          for (var i = 0; i < _flowSteps.length; i++) ...[
            if (i > 0)
              Icon(
                Icons.arrow_forward,
                size: 16,
                color: colorScheme.onSurfaceVariant,
              ),
            _FlowChip(label: _flowSteps[i].forLocale(lang)),
          ],
        ],
      ),
    );
  }
}

class _FlowChip extends StatelessWidget {
  const _FlowChip({required this.label});
  final String label;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surface,
        borderRadius: BorderRadius.circular(100),
        border: Border.all(color: const Color(0xFF45B700)),
      ),
      child: Text(
        label,
        style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600),
        textAlign: TextAlign.center,
      ),
    );
  }
}
