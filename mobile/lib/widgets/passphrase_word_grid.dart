import 'package:flutter/material.dart';

/// Displays a 24-word (or any length) recovery passphrase as a numbered
/// 3-column grid of word chips.
///
/// Shared between the onboarding passphrase screen and the recovery-
/// passphrase rotation screen so both render the phrase identically.
class PassphraseWordGrid extends StatelessWidget {
  /// Creates a [PassphraseWordGrid] for [words].
  const PassphraseWordGrid({required this.words, super.key});

  /// The passphrase words, in order.
  final List<String> words;

  @override
  Widget build(BuildContext context) {
    return GridView.count(
      crossAxisCount: 3,
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      mainAxisSpacing: 6,
      crossAxisSpacing: 6,
      childAspectRatio: 2.5,
      children: [
        for (var i = 0; i < words.length; i++)
          _WordChip(number: i + 1, word: words[i]),
      ],
    );
  }
}

class _WordChip extends StatelessWidget {
  const _WordChip({required this.number, required this.word});
  final int number;
  final String word;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(10),
        boxShadow: const [
          BoxShadow(color: Color(0x14000000), blurRadius: 8, offset: Offset(0, 2)),
        ],
      ),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Text(
            '$number',
            maxLines: 1,
            style: const TextStyle(fontSize: 9, color: Color(0xFF6B7280)),
          ),
          Text(
            word,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(
              fontSize: 11,
              fontWeight: FontWeight.w700,
              color: Color(0xFF111827),
            ),
          ),
        ],
      ),
    );
  }
}
