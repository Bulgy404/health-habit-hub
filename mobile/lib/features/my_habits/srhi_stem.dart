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

// A cue typed as a clause ("I wake up", "my alarm goes off") rather than a
// phrase ("after dinner") would run straight on from the behaviour, so the
// stem puts this word in front of it. A cue counts as a clause when its first
// word is a subject pronoun or possessive; anything else is left as typed.
// Japanese puts the cue in parentheses instead, so it has no entry.
const _clauseConnectors = <String, ({String word, Set<String> starts})>{
  'en': (
    word: 'when',
    starts: {
      'i', 'we', 'you', 'he', 'she', 'they', 'it', 'my', 'our', 'your',
      'his', 'her', 'their', 'its',
    },
  ),
  'de': (
    word: 'wenn',
    starts: {
      'ich', 'wir', 'du', 'er', 'sie', 'es', 'ihr', 'man', 'mein', 'meine',
      'meinem', 'meinen', 'meiner', 'meines', 'unser', 'unsere', 'unserem',
      'unseren', 'unserer', 'dein', 'deine', 'deinem', 'deinen', 'deiner',
    },
  ),
  'fr': (
    word: 'quand',
    starts: {
      'je', 'j', 'nous', 'tu', 'il', 'elle', 'on', 'ils', 'elles', 'mon',
      'ma', 'mes', 'notre', 'nos', 'ton', 'ta', 'tes',
    },
  ),
  'nl': (
    word: 'wanneer',
    starts: {
      'ik', 'we', 'wij', 'jij', 'je', 'hij', 'zij', 'ze', 'mijn', 'onze',
      'ons', 'jouw',
    },
  ),
};

/// Builds the SRHI stem for a habit.
///
/// Gardner, Rebar & Lally (2022) ask habit measures to be specific to the
/// behaviour and its context (criteria M4/M5), so when the habit has a cue
/// the stem names it: "Go for a walk after dinner each evening is
/// something…". A cue typed as a clause gets "when" in front of it ("Stretch
/// when I get out of bed is something…"). Two cues are joined in order, since
/// the second one refines the first ("after dinner each evening" + "at home
/// on weekdays"). Without a usable cue the generic "{behaviour} is
/// something…" stem is kept.
SrhiStem buildSrhiStem({
  required AppLocalizations l10n,
  required String languageCode,
  required String behaviorLabel,
  required List<IntentionCue> cues,
}) {
  final cuePhrase = cues
      .where((c) => c.namesSituation)
      .map((c) => c.text.trim())
      .map((t) => t.replaceFirst(RegExp(r'[\s.,;:!?…]+$'), ''))
      .where((t) => t.isNotEmpty)
      .toList();
  if (cuePhrase.isEmpty) {
    return SrhiStem(
      text: l10n.srhiStem(behaviorLabel),
      variant: SrhiStemVariant.behaviour,
    );
  }
  final cue = cuePhrase.map((t) => _cueInStem(t, languageCode)).join(' ');
  return SrhiStem(
    text: l10n.srhiStemWithCue(behaviorLabel, cue),
    variant: SrhiStemVariant.behaviourCue,
  );
}

/// One cue as it reads after the behaviour: a clause gets the language's
/// "when" word in front of it and its first word lower-cased (except English
/// "I", "I'm", …), anything else goes through [_midSentence].
String _cueInStem(String cue, String languageCode) {
  final connector = _clauseConnectors[languageCode];
  final firstWord = cue.split(RegExp(r'\s+')).first;
  // "I'm" → "i", "J'arrive" → "j".
  final base = firstWord.split(RegExp("['’]")).first.toLowerCase();
  if (connector == null || !connector.starts.contains(base)) {
    return _midSentence(cue, languageCode);
  }
  final keepCase = languageCode == 'en' && base == 'i';
  final clause = keepCase ? cue : cue[0].toLowerCase() + cue.substring(1);
  return '${connector.word} $clause';
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
