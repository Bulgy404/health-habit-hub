// app/utils/recoveryPhrase.js
//
// Server-side port of the Flutter app's recovery-phrase derivation
// (mobile/lib/screens/onboarding/passphrase_screen.dart). The 24-word phrase
// is a deterministic BIP39-style encoding of the participant's Keycloak
// username (a UUID) and password, so the same (username, password) always
// yields the same words on the device and here. This lets the admin portal
// display the exact phrase a participant sees for verification.
//
// IMPORTANT: the encoding must stay byte-identical to the Dart implementation,
// so this uses the same ported wordlist (bip39Wordlist.js).

import { BIP39_WORDS } from './bip39Wordlist.js';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Whether recovery phrases may be stored and shown in the admin portal.
 * Off by default — phrases are effectively account secrets, so they are only
 * persisted/exposed when EXPOSE_RECOVERY_PHRASES is explicitly set to "true"
 * (intended for local test/verification, not production).
 *
 * @returns {boolean}
 */
export function recoveryPhrasesEnabled() {
  return process.env.EXPOSE_RECOVERY_PHRASES === 'true';
}

/** Hex string → array of byte values (ignores dashes). */
function hexToBytes(hex) {
  const clean = String(hex).replace(/-/g, '');
  const bytes = [];
  for (let i = 0; i + 1 < clean.length; i += 2) {
    bytes.push(parseInt(clean.substring(i, i + 2), 16));
  }
  return bytes;
}

/** Byte array → lowercase hex string. */
function bytesToHex(bytes) {
  return bytes.map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Encode [bytes] into exactly [wordCount] words via 11-bit MSB-first chunks. */
function bytesToWords(bytes, wordCount) {
  const bits = [];
  for (const b of bytes) {
    for (let i = 7; i >= 0; i--) bits.push((b >> i) & 1);
  }
  while (bits.length < wordCount * 11) bits.push(0);
  const words = [];
  for (let w = 0; w < wordCount; w++) {
    let idx = 0;
    for (let b = 0; b < 11; b++) idx = (idx << 1) | bits[w * 11 + b];
    words.push(BIP39_WORDS[idx]);
  }
  return words;
}

const WORD_INDEX = new Map(BIP39_WORDS.map((w, i) => [w, i]));

/** Decode [words] back into exactly [byteCount] bytes (inverse of bytesToWords). */
function wordsToBytes(words, byteCount) {
  const bits = [];
  for (const word of words) {
    const idx = WORD_INDEX.get(String(word).toLowerCase());
    if (idx === undefined) return null;
    for (let b = 10; b >= 0; b--) bits.push((idx >> b) & 1);
  }
  const bytes = [];
  for (let i = 0; i < byteCount; i++) {
    let byte = 0;
    for (let b = 0; b < 8; b++) byte = (byte << 1) | bits[i * 8 + b];
    bytes.push(byte);
  }
  return bytes;
}

/**
 * Derive the 24-word recovery phrase from a UUID username and a hex password,
 * matching the Flutter app exactly.
 *
 * @param {string} username - The Keycloak username (must be a UUID).
 * @param {string} password - The Keycloak password (hex string).
 * @returns {string|null} Space-joined 24-word phrase, or null if the username
 *   is not a UUID / inputs are missing (e.g. admin token-card-only accounts).
 */
export function recoveryPhraseFromCredentials(username, password) {
  if (!username || !password || !UUID_RE.test(username)) return null;
  const uuidBytes = hexToBytes(username.replace(/-/g, '')); // 16 bytes
  const passBytes = hexToBytes(password);
  if (uuidBytes.length < 16 || passBytes.length === 0) return null;
  return [...bytesToWords(uuidBytes, 12), ...bytesToWords(passBytes, 12)].join(
    ' '
  );
}

/**
 * Decode a 24-word recovery phrase back into `{ username, password }`,
 * the inverse of recoveryPhraseFromCredentials, matching the Flutter app's
 * credentialsFromPassphrase exactly (words 0-11 → username UUID, 12-23 →
 * password).
 *
 * @param {string|string[]} phrase - Either a space-separated 24-word string
 *   or an already-split array of 24 words.
 * @returns {{username: string, password: string}|null} null if the input
 *   isn't exactly 24 words or contains a word outside the wordlist.
 */
export function credentialsFromRecoveryPhrase(phrase) {
  const words = Array.isArray(phrase)
    ? phrase
    : String(phrase ?? '')
        .trim()
        .split(/\s+/)
        .filter(Boolean);
  if (words.length !== 24) return null;

  const uuidBytes = wordsToBytes(words.slice(0, 12), 16);
  const passBytes = wordsToBytes(words.slice(12), 16);
  if (!uuidBytes || !passBytes) return null;

  const hex = bytesToHex(uuidBytes);
  const username = [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join('-');

  return { username, password: bytesToHex(passBytes) };
}
