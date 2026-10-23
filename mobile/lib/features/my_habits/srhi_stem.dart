/// Builds the stem shown above the SRHI items (#63).
library;

// mobile/lib/features/my_habits/srhi_stem.dart
import '../../l10n/app_localizations.dart';
import 'my_habits_models.dart';

/// Which stem the participant saw. Sent with every SRHI submission and stored
/// as `srhi_responses.stemVariant`, so analyses can separate generic from
/// context-specific measurements.
enum SrhiStemVariant {
  /// "{behaviour} is something…" — the habit has no usable cue.
  behaviour('behaviour'),

  /// "{behaviour} {cue} is something…" — names the planned cue as well.
  behaviourCue('behaviour+cue');

  const SrhiStemVariant(this.wire);

  /// Value sent to and stored by the backend.
  final String wire;
}

/// The stem text plus which variant it is.
class SrhiStem {
  /// Creates an [SrhiStem].
  const SrhiStem({required this.text, required this.variant});

  /// The rendered stem, in the participant's app language.
  final String text;

  /// Which wording [text] uses.
  final SrhiStemVariant variant;
}

// German capitalises nouns, so a capital letter at the start of a German cue
// is only a sentence-start capital — safe to lower-case mid-sentence — when
// the first word is one of these (prepositions, conjunctions, time adverbs).
const _germanLowercaseStarts = {
  'ab', 'abends', 'am', 'an', 'auf', 'aus', 'bei', 'beim', 'bevor', 'bis',
  'direkt', 'gleich', 'immer', 'im', 'in', 'jede', 'jeden', 'jedes', 'mit',
  'mittags', 'morgens', 'nach', 'nachdem', 'nachmittags', 'nachts', 'ohne',
  'sobald', 'um', 'unter', 'vor', 'vormittags', 'wenn', 'während', 'zu',
  'zum', 'zur',
};

/// Builds the SRHI stem for a habit.
///
/// Gardner, Rebar & Lally (2022) ask habit measures to be specific to the
/// behaviour and its context (criteria M4/M5), so when the habit has a cue
/// the stem names it: "Go for a walk after dinner each evening is
/// something…". Two cues are joined in order, since the second one refines
/// the first ("after dinner each evening" + "at home on weekdays"). Without a
/// usable cue the generic "{behaviour} is something…" stem is kept.
SrhiStem buildSrhiStem({
  required AppLocalizations l10n,
  required String languageCode,
  required String behaviorLabel,
  required List<IntentionCue> cues,
}) {
  final cuePhrase = cues
      .map((c) => c.text.trim())
      .where((t) => t.isNotEmpty && t != kAnchorRoutineCueText)
      .map((t) => t.replaceFirst(RegExp(r'[\s.,;:!?…]+$'), ''))
      .where((t) => t.isNotEmpty)
      .toList();
  if (cuePhrase.isEmpty) {
    return SrhiStem(
      text: l10n.srhiStem(behaviorLabel),
      variant: SrhiStemVariant.behaviour,
    );
  }
  final cue = _midSentence(cuePhrase.join(' '), languageCode);
  return SrhiStem(
    text: l10n.srhiStemWithCue(behaviorLabel, cue),
    variant: SrhiStemVariant.behaviourCue,
  );
}

/// Lower-cases the first letter of a cue typed as a sentence ("After
/// dinner…"), since it follows the behaviour mid-sentence in the stem. Leaves
/// words written in capitals ("I", "TV") and scripts without case alone, and
/// in German only lower-cases the function words in [_germanLowercaseStarts].
String _midSentence(String cue, String languageCode) {
  final firstWord = cue.split(RegExp(r'\s+')).first;
  if (firstWord == firstWord.toUpperCase()) return cue;
  if (languageCode == 'de' &&
      !_germanLowercaseStarts.contains(firstWord.toLowerCase())) {
    return cue;
  }
  return cue[0].toLowerCase() + cue.substring(1);
}
