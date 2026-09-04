/**
 * Envelope encryption for identity-register fields.
 *
 * Layout of every encrypted column (one `bytea`):
 *
 *   [1 byte scheme version = 0x01][12 byte random IV][ciphertext][16 byte tag]
 *
 * AES-256-GCM, with the AAD bound to BOTH the row id and the field name:
 *
 *   aad = "<subjectId>:<fieldName>:<schemeVersion>"
 *
 * That binding is the defence against an attacker who has UPDATE on the
 * database but not the key. Without it they could:
 *   - move Alice's name ciphertext onto Bob's row, or
 *   - move the email blob into the notes column and read it back through a
 *     less-audited endpoint.
 * With it, either move makes decryption fail rather than silently succeed.
 *
 * The IV is generated inside `encryptField` and never accepted from a caller —
 * GCM catastrophically loses confidentiality *and* integrity on IV reuse, so
 * that must not be something a call site can get wrong.
 */

import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';

const ALGO = 'aes-256-gcm';
const SCHEME_VERSION = 0x01;
const IV_LEN = 12; // 96 bits — the size GCM is specified for
const TAG_LEN = 16;
const KEY_LEN = 32;

/** @param {string} subjectId @param {string} fieldName */
function buildAad(subjectId, fieldName) {
  if (!subjectId || !fieldName) {
    throw new Error('AAD requires both a subjectId and a fieldName');
  }
  return Buffer.from(`${subjectId}:${fieldName}:${SCHEME_VERSION}`, 'utf8');
}

function assertKey(key) {
  if (!Buffer.isBuffer(key) || key.length !== KEY_LEN) {
    throw new Error(`key must be ${KEY_LEN} raw bytes`);
  }
}

/**
 * Encrypt one field value.
 *
 * @param {{ key: Buffer, subjectId: string, fieldName: string, plaintext: string|null }} opts
 * @returns {Buffer|null} null passes through, so an absent optional field stays
 *   absent rather than becoming an encrypted empty string (which would leak
 *   "this field is set" through ciphertext length).
 */
export function encryptField({ key, subjectId, fieldName, plaintext }) {
  if (plaintext == null) return null;
  assertKey(key);
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, key, iv);
  cipher.setAAD(buildAad(subjectId, fieldName));
  const body = Buffer.concat([
    cipher.update(String(plaintext), 'utf8'),
    cipher.final(),
  ]);
  return Buffer.concat([
    Buffer.from([SCHEME_VERSION]),
    iv,
    body,
    cipher.getAuthTag(),
  ]);
}

/**
 * Decrypt one field value.
 *
 * Throws on any tampering, on a moved ciphertext, or on an unknown scheme
 * version. Callers must not swallow that — a decryption failure means the
 * stored data is not what it claims to be.
 *
 * @param {{ key: Buffer, subjectId: string, fieldName: string, ciphertext: Buffer|null }} opts
 * @returns {string|null}
 */
export function decryptField({ key, subjectId, fieldName, ciphertext }) {
  if (ciphertext == null) return null;
  assertKey(key);
  if (!Buffer.isBuffer(ciphertext) || ciphertext.length < 1 + IV_LEN + TAG_LEN) {
    throw new Error('ciphertext is too short to be well-formed');
  }
  const version = ciphertext[0];
  if (version !== SCHEME_VERSION) {
    throw new Error(`unsupported ciphertext scheme version ${version}`);
  }
  const iv = ciphertext.subarray(1, 1 + IV_LEN);
  const tag = ciphertext.subarray(ciphertext.length - TAG_LEN);
  const body = ciphertext.subarray(1 + IV_LEN, ciphertext.length - TAG_LEN);

  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAAD(buildAad(subjectId, fieldName));
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(body), decipher.final()]).toString(
    'utf8'
  );
}

/* ── Data-encryption keys ────────────────────────────────────────────────── */

/**
 * DEKs are per *register* (per study), not per subject.
 *
 * Per-subject keys would mean one unwrap per row, and nurse name search
 * decrypts the whole roster (there is deliberately no searchable name index —
 * see docs/identity-register.md). Per-register means one unwrap per search.
 * The crypto-shredding a per-subject DEK would buy is not needed: this is
 * Postgres, so `DELETE FROM subjects` is a perfectly good erasure primitive.
 */
export function generateDek() {
  return randomBytes(KEY_LEN);
}

/** @param {{ kek: Buffer, registerId: string, kekVersion: number, dek: Buffer }} o */
export function wrapDek({ kek, registerId, kekVersion, dek }) {
  assertKey(kek);
  assertKey(dek);
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, kek, iv);
  cipher.setAAD(Buffer.from(`${registerId}:dek:${kekVersion}`, 'utf8'));
  const body = Buffer.concat([cipher.update(dek), cipher.final()]);
  return Buffer.concat([
    Buffer.from([SCHEME_VERSION]),
    iv,
    body,
    cipher.getAuthTag(),
  ]);
}

/** @param {{ kek: Buffer, registerId: string, kekVersion: number, wrapped: Buffer }} o */
export function unwrapDek({ kek, registerId, kekVersion, wrapped }) {
  assertKey(kek);
  if (!Buffer.isBuffer(wrapped) || wrapped.length < 1 + IV_LEN + TAG_LEN) {
    throw new Error('wrapped DEK is malformed');
  }
  if (wrapped[0] !== SCHEME_VERSION) {
    throw new Error(`unsupported DEK scheme version ${wrapped[0]}`);
  }
  const iv = wrapped.subarray(1, 1 + IV_LEN);
  const tag = wrapped.subarray(wrapped.length - TAG_LEN);
  const body = wrapped.subarray(1 + IV_LEN, wrapped.length - TAG_LEN);
  const decipher = createDecipheriv(ALGO, kek, iv);
  decipher.setAAD(Buffer.from(`${registerId}:dek:${kekVersion}`, 'utf8'));
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(body), decipher.final()]);
}

export const SCHEME = { SCHEME_VERSION, IV_LEN, TAG_LEN, KEY_LEN };
