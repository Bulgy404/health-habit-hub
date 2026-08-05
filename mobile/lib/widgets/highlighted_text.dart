/// Bolds one matched substring within a larger piece of text — e.g. the
/// exact phrase a classifier extracted for a habit's context dimension
/// (Location, Time, ...), shown alongside the dimension badge on the
/// Explore graph's habit detail sheet.
library;

import 'package:flutter/material.dart';

/// Renders [text], bolding the first case-insensitive occurrence of
/// [highlight]. Falls back to a plain [Text] when [highlight] is empty or
/// not actually found in [text] — e.g. [text] is a translation and the
/// phrase (extracted from the original-language sentence) no longer appears
/// verbatim.
class HighlightedText extends StatelessWidget {
  const HighlightedText({
    super.key,
    required this.text,
    required this.highlight,
    this.style,
  });

  final String text;
  final String highlight;
  final TextStyle? style;

  @override
  Widget build(BuildContext context) {
    final needle = highlight.trim();
    final start =
        needle.isEmpty ? -1 : text.toLowerCase().indexOf(needle.toLowerCase());
    if (start == -1) return Text(text, style: style);

    final end = start + needle.length;
    return Text.rich(
      TextSpan(
        style: style,
        children: [
          if (start > 0) TextSpan(text: text.substring(0, start)),
          TextSpan(
            text: text.substring(start, end),
            style: const TextStyle(fontWeight: FontWeight.w800),
          ),
          if (end < text.length) TextSpan(text: text.substring(end)),
        ],
      ),
    );
  }
}
