/**
 * Code generation.
 *
 * Two distinct identifiers, deliberately not one:
 *
 *   subject code    TUD-DFG01-0042      a pseudonym. Stable, human-readable,
 *                                       shared with HHH and with researchers.
 *   enrollment code HHV-4K7P2-9QX3R     a one-time bearer credential. Never
 *                                       leaves the identity service except on
 *                                       paper or in an invite.
 *
 * For identity-mode studies the enrollment code REPLACES the anonymous
 * `HHH-XXXXX` study code rather than accompanying it. Two codes at a study
 * site is an operational trap: nurses mix them up, participants type the wrong
 * one, and the failure mode is a participant enrolled as the wrong person.
 * The distinct prefix lets the backend route on sight, with no study lookup.
 */

import { randomBytes } from 'node:crypto';

/**
 * Crockford base32: no I, L, O or U.
 *
 * I/1, L/1 and O/0 are the classic misreads when a code is read off a printed
 * sheet and typed on a phone; U is excluded so the alphabet cannot spell
 * unfortunate words by accident. This matters more than it sounds — every
 * ambiguous character is a support call from a study site.
 */
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

export const ENROLLMENT_CODE_PREFIX = 'HHV';
export const ANONYMOUS_CODE_PREFIX = 'HHH';

/** HHV-XXXXX-XXXXX — 10 symbols over a 32-char alphabet ≈ 50 bits. */
export const ENROLLMENT_CODE_PATTERN =
  /^HHV-[0-9ABCDEFGHJKMNPQRSTVWXYZ]{5}-[0-9ABCDEFGHJKMNPQRSTVWXYZ]{5}$/;

/** The existing anonymous format, unchanged. */
export const ANONYMOUS_CODE_PATTERN = /^HHH-[A-Z0-9]{5}$/;

/**
 * Draw `n` symbols uniformly.
 *
 * Rejection sampling, not modulo: 256 is not a multiple of 32 here in general,
 * and biasing a credential's alphabet is exactly the kind of quiet weakness
 * that never shows up in a test. (32 does divide 256, but the guard is kept so
 * the function stays correct if the alphabet is ever changed.)
 */
function randomSymbols(n) {
  const max = Math.floor(256 / ALPHABET.length) * ALPHABET.length;
  const out = [];
  while (out.length < n) {
    for (const byte of randomBytes(n * 2)) {
      if (byte >= max) continue; // reject, do not fold
      out.push(ALPHABET[byte % ALPHABET.length]);
      if (out.length === n) break;
    }
  }
  return out.join('');
}

/** @returns {string} e.g. "HHV-4K7P2-9QX3R" */
export function generateEnrollmentCode() {
  return `${ENROLLMENT_CODE_PREFIX}-${randomSymbols(5)}-${randomSymbols(5)}`;
}

/**
 * Normalise user input before lookup: uppercase, strip whitespace, and repair
 * the two substitutions people actually make when copying from paper.
 *
 * Only applied to characters the alphabet excludes, so it can never corrupt a
 * legitimate code — there is no valid code containing I, L, O or U.
 */
export function normalizeEnrollmentCode(input) {
  if (typeof input !== 'string') return '';
  return input
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '')
    .replace(/[IL]/g, '1')
    .replace(/O/g, '0');
}

export function isEnrollmentCode(input) {
  return ENROLLMENT_CODE_PATTERN.test(normalizeEnrollmentCode(input));
}

export function isAnonymousCode(input) {
  return ANONYMOUS_CODE_PATTERN.test(
    String(input ?? '')
      .trim()
      .toUpperCase()
  );
}

/**
 * Format a subject code from a register prefix and sequence number.
 *
 * Sequence numbers are allocated in screening order, which is itself
 * meaningful clinical data — the order people were recruited.
 *
 * @param {string} prefix e.g. "TUD-DFG01"
 * @param {number} seq 1-based
 */
export function formatSubjectCode(prefix, seq) {
  if (!/^[A-Z0-9][A-Z0-9-]{1,31}$/.test(prefix)) {
    throw new Error(`invalid subject code prefix: ${prefix}`);
  }
  if (!Number.isInteger(seq) || seq < 1) {
    throw new Error(`invalid subject sequence: ${seq}`);
  }
  return `${prefix}-${String(seq).padStart(4, '0')}`;
}

export const CODE_ALPHABET = ALPHABET;
