/// A worked example habit sentence for the donation-form hint card, with its
/// Time/Behavior/Location/Reasoning phrases colour-coded to match the
/// Explore graph's dimension colours (see [kDimensionColors]), plus a small
/// legend mapping each colour to its dimension name.
library;

import 'package:flutter/material.dart';

import '../../../l10n/app_localizations.dart';
import '../../../widgets/bubble_graph/bubble_graph_data.dart';

/// Maps this widget's short tag letters to the dimension IDs
/// [kDimensionColors]/`colorFor` already use, so the legend and highlight
/// colours are exactly the ones the participant already sees on the Explore
/// graph — not a second, drifting colour scheme.
const _kTagToDimensionId = {
  'T': 'TIME',
  'B': 'BEHAVIOR',
  'L': 'PHYSICAL_SETTING',
  'R': 'REASONING',
};

final _kTagPattern = RegExp(r'\[(T|B|L|R)\](.*?)\[/\1\]');

/// `colorFor('REASONING')` (slate, #64748B — see [kDimensionColors]) is
/// tuned for small bubble labels on the Explore graph's own background, not
/// for body text on this card's fixed green background — read as low
/// contrast (and visually flat) there. Pink reads clearly on both card
/// backgrounds and isn't otherwise used in this 4-dimension example, so no
/// risk of confusion with another highlighted phrase; the other three
/// dimensions read fine as-is and keep using `colorFor` directly, so they
/// stay pixel-identical to the Explore graph.
Color _highlightColorFor(String dimensionId, Brightness brightness) {
  if (dimensionId == 'REASONING') {
    return brightness == Brightness.dark
        ? const Color(0xFFF9A8D4)
        : const Color(0xFFBE185D);
  }
  return colorFor(dimensionId);
}

/// Splits a translator-authored [tagged] string like
/// `"[T]After breakfast[/T], I will [B]walk[/B]."` into [InlineSpan]s,
/// colouring each `[X]...[/X]` phrase via [_highlightColorFor] and leaving
/// everything else in [baseStyle]. Translators may reorder the tagged
/// phrases freely to fit natural word order in their language — this only
/// cares about the tag pairs, not their position in the string.
List<InlineSpan> _parseTaggedExample(
  String tagged,
  TextStyle? baseStyle,
  Brightness brightness,
) {
  final spans = <InlineSpan>[];
  var cursor = 0;
  for (final match in _kTagPattern.allMatches(tagged)) {
    if (match.start > cursor) {
      spans.add(
        TextSpan(text: tagged.substring(cursor, match.start), style: baseStyle),
      );
    }
    final dimensionId = _kTagToDimensionId[match.group(1)]!;
    spans.add(
      TextSpan(
        text: match.group(2),
        style: baseStyle?.copyWith(
          color: _highlightColorFor(dimensionId, brightness),
          fontWeight: FontWeight.w700,
        ),
      ),
    );
    cursor = match.end;
  }
  if (cursor < tagged.length) {
    spans.add(TextSpan(text: tagged.substring(cursor), style: baseStyle));
  }
  return spans;
}

/// Renders the worked example sentence plus a colour legend, for use as the
/// `extra` slot of the donation form's [OnboardingExplainerCard].
class ExampleHabitWidget extends StatelessWidget {
  /// Creates an [ExampleHabitWidget].
  const ExampleHabitWidget({super.key, required this.textColor});

  /// Text colour to use for the non-highlighted parts of the sentence and
  /// the legend labels — passed in so this matches whatever background the
  /// hint card renders on (the same fixed green/on-green pair as the rest
  /// of the card, not a theme colour that could clash).
  final Color textColor;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    final brightness = Theme.of(context).brightness;
    final baseStyle = Theme.of(
      context,
    ).textTheme.bodyMedium?.copyWith(color: textColor, height: 1.4);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          l10n.donateHabitHintExampleIntro,
          style: baseStyle?.copyWith(fontWeight: FontWeight.w600),
        ),
        const SizedBox(height: 2),
        Text.rich(
          TextSpan(
            children: _parseTaggedExample(
              l10n.donateHabitHintExampleSentence,
              baseStyle,
              brightness,
            ),
          ),
        ),
        const SizedBox(height: 8),
        Wrap(
          spacing: 12,
          runSpacing: 4,
          children: [
            _LegendDot(color: colorFor('TIME'), label: l10n.bubbleGraphDimensionTime, textColor: textColor),
            _LegendDot(color: colorFor('BEHAVIOR'), label: l10n.bubbleGraphDimensionBehavior, textColor: textColor),
            _LegendDot(color: colorFor('PHYSICAL_SETTING'), label: l10n.bubbleGraphDimensionLocation, textColor: textColor),
            _LegendDot(
              color: _highlightColorFor('REASONING', brightness),
              label: l10n.bubbleGraphDimensionReasoning,
              textColor: textColor,
            ),
          ],
        ),
      ],
    );
  }
}

class _LegendDot extends StatelessWidget {
  const _LegendDot({
    required this.color,
    required this.label,
    required this.textColor,
  });

  final Color color;
  final String label;
  final Color textColor;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          width: 8,
          height: 8,
          decoration: BoxDecoration(color: color, shape: BoxShape.circle),
        ),
        const SizedBox(width: 4),
        Text(
          label,
          style: Theme.of(
            context,
          ).textTheme.labelSmall?.copyWith(color: textColor),
        ),
      ],
    );
  }
}
