/**
 * Non-English profanity/slur phrases for `commentModerationService`.
 *
 * `obscenity` only ships an English dataset (see `preset/english.js` in the
 * package), so comments written in the app's other supported languages
 * (de, fr, ja, nl) were never checked against anything and always passed
 * moderation. These lists are deliberately not exhaustive — they cover the
 * same severity tier as obscenity's built-in English list (slurs, sexual/
 * scatological vulgarities, common insults) rather than being a complete
 * dictionary.
 *
 * Word-boundary markers (`|word|`) only make sense for space-separated
 * scripts, so German/French/Dutch phrases use them like the English dataset
 * does; Japanese phrases are plain substrings since the language has no
 * inter-word spaces and obscenity's boundary assertion is ASCII-only anyway.
 *
 * All phrases are written in their accent-folded ASCII form (e.g. "batard"
 * not "bâtard", "scheisse" not "scheiße") because obscenity's confusables
 * transformer folds accented input to ASCII *before* matching, so an
 * accented literal in the pattern itself would never match anything.
 */

import { parseRawPattern } from 'obscenity';

/** @param {string[]} words @returns {import('obscenity').ParsedPattern[]} */
function wordBoundaryPatterns(words) {
  return words.map((w) => parseRawPattern(`|${w}|`));
}

/** @param {string[]} words @returns {import('obscenity').ParsedPattern[]} */
function substringPatterns(words) {
  return words.map((w) => parseRawPattern(w));
}

export const GERMAN_PATTERNS = wordBoundaryPatterns([
  'scheisse',
  'arschloch',
  'hurensohn',
  'fotze',
  'wichser',
  'schlampe',
  'spast',
  'neger',
]);

export const FRENCH_PATTERNS = wordBoundaryPatterns([
  'merde',
  'putain',
  'connard',
  'connasse',
  'salope',
  'encule',
  'pute',
  'batard',
]);

export const DUTCH_PATTERNS = wordBoundaryPatterns([
  'kut',
  'klootzak',
  'hoer',
  'kanker',
  'lul',
  'trut',
  'schijt',
]);

export const JAPANESE_PATTERNS = substringPatterns([
  '死ね',
  'くそ',
  'ちんこ',
  'まんこ',
  'きちがい',
  'ばか',
]);
