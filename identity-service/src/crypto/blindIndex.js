/**
 * Blind indexes — keyed, deterministic digests that make encrypted fields
 * exact-matchable without decrypting them.
 *
 *   bi = HMAC-SHA256(pepper, normalize(value))
 *
 * KNOWN LEAK, and it must be written into the DPIA rather than discovered by a
 * reviewer: a deterministic index reveals EQUALITY. An attacker with read
 * access to the database can tell that two rows share an email address, and —
 * if they also hold the pepper — can confirm a guessed value. Without the
 * pepper (which lives in the key file, never in the database) it is a keyed
 * PRF and confirms nothing.
 *
 * Deliberately NOT provided: any n-gram, prefix or substring index over names.
 * At clinical-study scale a trigram index over German surnames is trivially
 * frequency-analysable — it would hand an attacker a substitution cipher with a
 * publicly known plaintext distribution. Nurse name search decrypts the
 * register in memory instead; see docs/identity-register.md for why that
 * refusal is deliberate and must survive the next person who proposes it.
 */

import { createHmac } from 'node:crypto';

/**
 * Normalise before hashing so trivial input differences do not defeat matching.
 *
 * NFKC first: "ﬀ" (U+FB00) and "ff" must hash alike, as must the composed and
 * decomposed forms of "ä" — otherwise a roster imported from one system fails
 * to match the same person typed by hand in another.
 *
 * @param {string} value
 */
export function normalize(value) {
  return String(value).normalize('NFKC').trim().toLowerCase();
}

/**
 * @param {Buffer} pepper 32 derived bytes
 * @param {string|null|undefined} value
 * @returns {Buffer|null} null for absent input, so a missing optional field
 *   does not collide with every other missing one under a unique index.
 */
export function blindIndex(pepper, value) {
  if (value == null || String(value).trim() === '') return null;
  if (!Buffer.isBuffer(pepper) || pepper.length !== 32) {
    throw new Error('pepper must be 32 raw bytes');
  }
  return createHmac('sha256', pepper).update(normalize(value), 'utf8').digest();
}

/**
 * Composite index used ONLY to warn about probable duplicates at roster import
 * ("this looks like TUD-DFG01-0017"). Never used for lookup, and deliberately
 * non-unique: two people can genuinely share a name and birth date.
 *
 * @param {Buffer} pepper
 * @param {{ familyName?: string, givenName?: string, dateOfBirth?: string }} p
 */
export function personBlindIndex(
  pepper,
  { familyName, givenName, dateOfBirth }
) {
  if (!familyName && !givenName) return null;
  const composite = [
    normalize(familyName ?? ''),
    normalize(givenName ?? ''),
    normalize(dateOfBirth ?? ''),
  ].join('|');
  return createHmac('sha256', pepper).update(composite, 'utf8').digest();
}

/**
 * Hash an IP for the audit log. Staff IP addresses are personal data too, and
 * an audit trail is retained far longer than any operational log needs to be.
 */
export function hashIp(pepper, ip) {
  return blindIndex(pepper, ip);
}
