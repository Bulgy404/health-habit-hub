/// "About the project" info page — kept deliberately short: how a shared
/// habit is used, and how recommendations are generated (with a data-flow
/// diagram). Linked from the donate screen's "Why share?" card and the
/// goal-input screen's "How do recommendations work?" card.
///
/// Copy is provided inline (en/de/ja), the same set of languages used by
/// habit_onboarding_widgets.dart for large explanatory blocks, rather than
/// through the generated l10n bundle — this is a lot of prose for a single
/// static page, and going through full ARB translation for all 5 app
/// languages was judged not worth the translation-quality risk here.
library;

import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../theme/app_colors.dart';
import '../widgets/entrance_fade.dart';

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
  const _Section({
    required this.icon,
    required this.title,
    required this.body,
    this.showFlowDiagramAfter = false,
  });
  final IconData icon;
  final _Copy title;
  final _Copy body;

  /// Renders [_RecommenderFlowDiagram] directly beneath this section, so the
  /// step-by-step visual sits right next to the text explaining it instead
  /// of floating at the end of the page after unrelated sections.
  final bool showFlowDiagramAfter;
}

const _intro = _Copy(
  en:
      "The Health Habit Hub study investigates how everyday habits form, "
      "and how personalized recommendations can help people build "
      "healthier routines. Everything you share and every habit you track "
      "contributes to that research, anonymously.",
  de:
      "Die Health Habit Hub-Studie untersucht, wie sich Alltagsgewohnheiten "
      "bilden und wie personalisierte Empfehlungen Menschen dabei helfen "
      "können, gesündere Routinen aufzubauen. Alles, was du teilst, und "
      "jede Gewohnheit, die du verfolgst, trägt anonym zu dieser Forschung "
      "bei.",
  ja:
      "Health Habit Hub研究は、日常の習慣がどのように形成されるか、そして"
      "パーソナライズされた推奨がより健康的なルーティンの構築にどう役立つ"
      "かを研究しています。あなたが共有するすべての情報と記録するすべての"
      "習慣が、匿名でこの研究に貢献します。",
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
    icon: Icons.lightbulb_outline,
    title: _Copy(
      en: "How recommendations work",
      de: "Wie Empfehlungen entstehen",
      ja: "推奨はどのように作られるか",
    ),
    body: _Copy(
      en:
          "The system compares your goal with anonymized habits from other "
          "participants and behaviour-change research, then an AI model "
          "writes a suggestion using your goal, your own habits, and your "
          "questionnaire answers.",
      de:
          "Das System vergleicht dein Ziel mit anonymisierten Gewohnheiten "
          "anderer Teilnehmender und Verhaltensänderungsforschung. Ein "
          "KI-Modell erstellt daraus einen Vorschlag – basierend auf deinem "
          "Ziel, deinen eigenen Gewohnheiten und deinen "
          "Fragebogenantworten.",
      ja:
          "システムはあなたの目標を、他の参加者の匿名化された習慣や行動変容"
          "研究と照合します。そしてAIモデルが、あなたの目標・自分の習慣・"
          "アンケートの回答をもとに提案を作成します。",
    ),
    showFlowDiagramAfter: true,
  ),
];

/// One data source feeding the recommender, shown as a chip in
/// [_RecommenderFlowDiagram] above the central AI node.
class _DataSource {
  final IconData icon;
  final _Copy label;

  /// A short, one-line explanation shown in the legend below the diagram.
  final _Copy explanation;

  const _DataSource({
    required this.icon,
    required this.label,
    required this.explanation,
  });
}

const _dataSources = [
  _DataSource(
    icon: Icons.flag_outlined,
    label: _Copy(en: 'Your goal', de: 'Dein Ziel', ja: 'あなたの目標'),
    explanation: _Copy(
      en: 'what you just typed',
      de: 'was du gerade eingegeben hast',
      ja: 'たった今入力した内容',
    ),
  ),
  _DataSource(
    icon: Icons.history,
    label: _Copy(
      en: 'Your habits & answers',
      de: 'Deine Gewohnheiten & Antworten',
      ja: 'あなたの習慣と回答',
    ),
    explanation: _Copy(
      en: 'habits you track and your questionnaire answers',
      de: 'deine verfolgten Gewohnheiten und Fragebogenantworten',
      ja: '記録している習慣とアンケートの回答',
    ),
  ),
  _DataSource(
    icon: Icons.groups_outlined,
    label: _Copy(
      en: 'Community habits',
      de: 'Community-Gewohnheiten',
      ja: 'コミュニティの習慣',
    ),
    explanation: _Copy(
      en: 'anonymized habits shared by other participants',
      de: 'anonymisierte Gewohnheiten anderer Teilnehmender',
      ja: '他の参加者が共有した匿名の習慣',
    ),
  ),
  _DataSource(
    icon: Icons.menu_book_outlined,
    label: _Copy(en: 'Research', de: 'Forschung', ja: '研究'),
    explanation: _Copy(
      en: 'established behaviour-change literature',
      de: 'etablierte Verhaltensänderungsforschung',
      ja: '確立された行動変容研究',
    ),
  ),
];

const _aiRecommenderLabel = _Copy(
  en: 'AI Recommender',
  de: 'KI-Empfehlungssystem',
  ja: 'AIレコメンダー',
);

const _outputSuggestionLabel = _Copy(
  en: 'Personalized suggestion',
  de: 'Personalisierter Vorschlag',
  ja: 'パーソナライズされた提案',
);

const _flowDiagramHeading = _Copy(
  en: 'Where your recommendation comes from:',
  de: 'Woher deine Empfehlung kommt:',
  ja: '推奨の情報源：',
);

const _pageTitle = _Copy(
  en: 'About the Health Habit Hub',
  de: 'Über das Health Habit Hub',
  ja: 'Health Habit Hubについて',
);

const _openSourceNote = _Copy(
  en: 'Health Habit Hub is open source.',
  de: 'Health Habit Hub ist Open Source.',
  ja: 'Health Habit Hubはオープンソースです。',
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
            if (section.showFlowDiagramAfter) ...[
              const SizedBox(height: 16),
              _RecommenderFlowDiagram(lang: lang),
            ],
            const SizedBox(height: 24),
          ],
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
            Icon(section.icon, size: 18, color: context.appColors.primary),
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

/// Animated data-flow diagram: the four inputs the recommender actually
/// reads (see docs/architecture.md § M3 Recommendation Pipeline, simplified
/// for a participant audience) converging into one AI step, producing one
/// suggestion. Entrance is a staggered fade/slide per source chip; once
/// settled, small dots continuously travel down each connector toward the
/// AI node, which pulses gently — a lightweight, deliberately subtle way to
/// read as "your data flows in, continuously," not a static chart.
class _RecommenderFlowDiagram extends StatefulWidget {
  const _RecommenderFlowDiagram({required this.lang});
  final String lang;

  @override
  State<_RecommenderFlowDiagram> createState() =>
      _RecommenderFlowDiagramState();
}

class _RecommenderFlowDiagramState extends State<_RecommenderFlowDiagram>
    with TickerProviderStateMixin {
  late final AnimationController _entrance;
  late final AnimationController _flow;
  late final AnimationController _pulse;

  @override
  void initState() {
    super.initState();
    _entrance = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 900),
    )..forward();
    _flow = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1800),
    )..repeat();
    _pulse = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1400),
    )..repeat(reverse: true);
  }

  @override
  void dispose() {
    _entrance.dispose();
    _flow.dispose();
    _pulse.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: colorScheme.surfaceContainerHighest,
        borderRadius: BorderRadius.circular(16),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            _flowDiagramHeading.forLocale(widget.lang),
            style: Theme.of(
              context,
            ).textTheme.labelMedium?.copyWith(fontWeight: FontWeight.w700),
          ),
          const SizedBox(height: 16),
          // Every source sits in its own equal-width column, and
          // _ConvergingConnectorPainter computes each column's center-x with
          // the exact same "width * (i + 0.5) / count" formula the Row below
          // uses implicitly via Expanded — so the lines drawn are guaranteed
          // to start exactly under each source, not just approximately.
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              for (var i = 0; i < _dataSources.length; i++)
                Expanded(
                  child: EntranceFade(
                    animation: _entrance,
                    interval: Interval(
                      (i * 0.15).clamp(0.0, 1.0),
                      (i * 0.15 + 0.6).clamp(0.0, 1.0),
                      curve: Curves.easeOut,
                    ),
                    child: _SourceNode(
                      icon: _dataSources[i].icon,
                      label: _dataSources[i].label.forLocale(widget.lang),
                    ),
                  ),
                ),
            ],
          ),
          SizedBox(
            height: 40,
            child: _ConvergingConnector(
              animation: _flow,
              sourceCount: _dataSources.length,
            ),
          ),
          Center(
            child: _PulsingNode(
              pulse: _pulse,
              label: _aiRecommenderLabel.forLocale(widget.lang),
            ),
          ),
          SizedBox(height: 40, child: _FlowConnector(animation: _flow)),
          Center(
            child: _OutputChip(
              label: _outputSuggestionLabel.forLocale(widget.lang),
            ),
          ),
          const SizedBox(height: 20),
          Divider(color: colorScheme.outlineVariant, height: 1),
          const SizedBox(height: 12),
          _InputLegend(lang: widget.lang),
        ],
      ),
    );
  }
}

/// A short vertical connector with 3 dots continuously travelling downward,
/// looping — "data flowing in," not a one-off transition.
class _FlowConnector extends StatelessWidget {
  const _FlowConnector({required this.animation});
  final Animation<double> animation;

  @override
  Widget build(BuildContext context) {
    final color = context.appColors.primary;
    return AnimatedBuilder(
      animation: animation,
      builder: (context, _) => CustomPaint(
        size: const Size(double.infinity, 48),
        painter: _FlowConnectorPainter(t: animation.value, color: color),
      ),
    );
  }
}

class _FlowConnectorPainter extends CustomPainter {
  _FlowConnectorPainter({required this.t, required this.color});
  final double t;
  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    final cx = size.width / 2;
    final linePaint = Paint()
      ..color = color.withAlpha(60)
      ..strokeWidth = 2;
    canvas.drawLine(Offset(cx, 0), Offset(cx, size.height), linePaint);

    final dotPaint = Paint()..color = color;
    for (final phase in const [0.0, 0.34, 0.68]) {
      final dt = (t + phase) % 1.0;
      canvas.drawCircle(Offset(cx, size.height * dt), 3.5, dotPaint);
    }
  }

  @override
  bool shouldRepaint(covariant _FlowConnectorPainter oldDelegate) =>
      oldDelegate.t != t;
}

/// Draws one vertical drop per source (from directly under each
/// [_SourceNode] down to a shared horizontal bus), the bus itself, and one
/// final drop from the bus's center into the AI node — so every source
/// visibly links into the node via an unbroken line, not just the one
/// nearest the center. An animated dot per source travels down its drop and
/// along the bus toward the center, in lockstep, so the "all four feed in"
/// reading holds even without pausing on the static lines.
class _ConvergingConnector extends StatelessWidget {
  const _ConvergingConnector({required this.animation, required this.sourceCount});
  final Animation<double> animation;
  final int sourceCount;

  @override
  Widget build(BuildContext context) {
    final color = context.appColors.primary;
    return AnimatedBuilder(
      animation: animation,
      builder: (context, _) => CustomPaint(
        size: const Size(double.infinity, 40),
        painter: _ConvergingConnectorPainter(
          t: animation.value,
          color: color,
          sourceCount: sourceCount,
        ),
      ),
    );
  }
}

class _ConvergingConnectorPainter extends CustomPainter {
  _ConvergingConnectorPainter({
    required this.t,
    required this.color,
    required this.sourceCount,
  });
  final double t;
  final Color color;
  final int sourceCount;

  @override
  void paint(Canvas canvas, Size size) {
    final busY = size.height * 0.5;
    final centerX = size.width / 2;
    final linePaint = Paint()
      ..color = color.withAlpha(60)
      ..strokeWidth = 2;
    final dotPaint = Paint()..color = color;

    // Same "column center" formula the Row of Expanded source nodes uses
    // implicitly, so each line starts exactly under its source.
    final xs = [
      for (var i = 0; i < sourceCount; i++) size.width * (i + 0.5) / sourceCount,
    ];

    for (final x in xs) {
      canvas.drawLine(Offset(x, 0), Offset(x, busY), linePaint);
    }
    canvas.drawLine(Offset(xs.first, busY), Offset(xs.last, busY), linePaint);
    canvas.drawLine(Offset(centerX, busY), Offset(centerX, size.height), linePaint);

    for (final x in xs) {
      if (t < 0.5) {
        final localT = t / 0.5;
        canvas.drawCircle(Offset(x, busY * localT), 3.2, dotPaint);
      } else {
        final localT = (t - 0.5) / 0.5;
        canvas.drawCircle(Offset(x + (centerX - x) * localT, busY), 3.2, dotPaint);
      }
    }
  }

  @override
  bool shouldRepaint(covariant _ConvergingConnectorPainter oldDelegate) =>
      oldDelegate.t != t;
}

/// Central "processing" node. Solid primaryDark fill with white content —
/// per docs/design-system.md's rule for any solid fill, not the bright
/// accent shade — gently pulsing to read as active/continuous.
class _PulsingNode extends StatelessWidget {
  const _PulsingNode({required this.pulse, required this.label});
  final Animation<double> pulse;
  final String label;

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: pulse,
      builder: (context, child) =>
          Transform.scale(scale: 1.0 + pulse.value * 0.06, child: child),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
        decoration: BoxDecoration(
          color: context.appColors.primaryDark,
          borderRadius: BorderRadius.circular(100),
          boxShadow: [
            BoxShadow(
              color: context.appColors.primary.withAlpha(70),
              blurRadius: 24,
              offset: const Offset(0, 6),
            ),
          ],
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.auto_awesome, size: 18, color: Colors.white),
            const SizedBox(width: 8),
            Flexible(
              child: Text(
                label,
                style: const TextStyle(
                  color: Colors.white,
                  fontWeight: FontWeight.w800,
                  fontSize: 13,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// One data-source node: icon badge above a short label, stacked vertically
/// so it stays readable inside a narrow 1/4-width column (unlike a
/// horizontal chip, whose Row could overflow on a long label — see
/// CHANGELOG). `maxLines`/`ellipsis` is a hard backstop against that same
/// class of bug even if a future label runs long.
class _SourceNode extends StatelessWidget {
  const _SourceNode({required this.icon, required this.label});
  final IconData icon;
  final String label;

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          width: 34,
          height: 34,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            color: Theme.of(context).colorScheme.surface,
            border: Border.all(color: context.appColors.primary, width: 1.5),
          ),
          child: Icon(icon, size: 16, color: context.appColors.primary),
        ),
        const SizedBox(height: 6),
        Text(
          label,
          textAlign: TextAlign.center,
          maxLines: 2,
          overflow: TextOverflow.ellipsis,
          style: const TextStyle(fontSize: 10.5, fontWeight: FontWeight.w600),
        ),
      ],
    );
  }
}

/// The diagram's output — same accent styling as [_SourceNode] (an
/// announcement on a light surface, not a solid fill) but visually distinct
/// via a filled icon, since it's the result, not an input.
class _OutputChip extends StatelessWidget {
  const _OutputChip({required this.label});
  final String label;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surface,
        borderRadius: BorderRadius.circular(100),
        border: Border.all(color: context.appColors.primary, width: 1.5),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(Icons.check_circle, size: 16, color: context.appColors.primary),
          const SizedBox(width: 6),
          Flexible(
            child: Text(
              label,
              style: TextStyle(
                fontSize: 13,
                fontWeight: FontWeight.w700,
                color: context.appColors.primary,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// One short line per data source explaining what it actually is — the
/// diagram's icon + 2-word label alone isn't self-explanatory.
class _InputLegend extends StatelessWidget {
  const _InputLegend({required this.lang});
  final String lang;

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        for (final source in _dataSources)
          Padding(
            padding: const EdgeInsets.only(bottom: 6),
            child: Text.rich(
              TextSpan(
                style: TextStyle(
                  fontSize: 11.5,
                  height: 1.4,
                  color: colorScheme.onSurfaceVariant,
                ),
                children: [
                  TextSpan(
                    text: '${source.label.forLocale(lang)}: ',
                    style: TextStyle(
                      fontWeight: FontWeight.w700,
                      color: colorScheme.onSurface,
                    ),
                  ),
                  TextSpan(text: source.explanation.forLocale(lang)),
                ],
              ),
            ),
          ),
      ],
    );
  }
}
