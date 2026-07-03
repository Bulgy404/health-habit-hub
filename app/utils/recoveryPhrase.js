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
