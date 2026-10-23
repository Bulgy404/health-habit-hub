// mobile/test/features/srhi_stem_test.dart
import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hhh/features/my_habits/my_habits_models.dart';
import 'package:hhh/features/my_habits/srhi_stem.dart';
import 'package:hhh/l10n/app_localizations.dart';

SrhiStem _stem(String lang, String behavior, List<String> cues) =>
    buildSrhiStem(
      l10n: lookupAppLocalizations(Locale(lang)),
      languageCode: lang,
      behaviorLabel: behavior,
      cues: [
        for (final c in cues) IntentionCue(text: c, source: 'self_selected'),
      ],
    );

void main() {
  test('no cue keeps the generic behaviour-only stem', () {
    final stem = _stem('en', 'Walking', []);
    expect(stem.text, 'Walking is something…');
    expect(stem.variant, SrhiStemVariant.behaviour);
    expect(stem.variant.wire, 'behaviour');
  });

  test('a cue follows the behaviour, lower-cased mid-sentence', () {
    final stem = _stem('en', 'Walking', ['After dinner each evening.']);
    expect(stem.text, 'Walking after dinner each evening is something…');
    expect(stem.variant.wire, 'behaviour+cue');
  });

  test('two cues are joined in order', () {
    final stem = _stem('en', 'Walking', [
      'After dinner each evening',
      'at home on weekdays',
    ]);
    expect(
      stem.text,
      'Walking after dinner each evening at home on weekdays is something…',
    );
  });

  test('words written in capitals keep their case', () {
    expect(
      _stem('en', 'Stretching', ['I get out of bed']).text,
      'Stretching I get out of bed is something…',
    );
  });

  test('German only lower-cases function words, never nouns', () {
    expect(
      _stem('de', 'Spazieren gehen', ['Nach dem Abendessen']).text,
      'Spazieren gehen nach dem Abendessen ist etwas,',
    );
    expect(
      _stem('de', 'Dehnen', ['Mittagspause im Büro']).text,
      'Dehnen Mittagspause im Büro ist etwas,',
    );
  });

  test('Japanese puts the cue in parentheses after the behaviour', () {
    expect(_stem('ja', '散歩', ['毎晩夕食の後に']).text, '散歩（毎晩夕食の後に）は…');
  });

  test('the stacked-anchor placeholder cue is not a situation', () {
    final stem = _stem('en', 'Drink coffee', [kAnchorRoutineCueText]);
    expect(stem.text, 'Drink coffee is something…');
    expect(stem.variant, SrhiStemVariant.behaviour);
  });
}
