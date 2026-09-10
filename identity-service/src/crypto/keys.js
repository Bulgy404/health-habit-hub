/**
 * Key derivation for the identity register.
 *
 * One 32-byte master key is the only secret the service holds. Everything else
 * is derived from it with HKDF-SHA256, so a single file mount (0400, never an
 * env var — env leaks via `docker inspect`, /proc/<pid>/environ and crash
 * dumps) is the whole key-management surface.
 *
 *   master
 *     ├─ info "kek-v{n}"        → KEK_n         wraps per-register DEKs
 *     ├─ info "bi-email-v{m}"   → pepper_email  blind index
 *     ├─ info "bi-extid-v{m}"   → pepper_extid
 *     ├─ info "bi-sub-v{m}"     → pepper_sub
 *     ├─ info "bi-name-v{m}"    → pepper_name
 *     ├─ info "bi-code-v{m}"    → pepper_code
 *     └─ info "ip-hash-v{m}"    → pepper_ip     audit-log IP hashing
 *
 * KEK version (n) and blind-index version (m) are deliberately INDEPENDENT.
 * Rotating the KEK only rewraps DEKs — cheap, no plaintext touched. Rotating a
 * pepper invalidates every blind index and requires decrypting and re-indexing
 * every subject, so the two must never be coupled.
 */

import { hkdfSync, timingSafeEqual } from 'node:crypto';

const HASH = 'sha256';
const KEY_LEN = 32;

/** Fixed, non-secret salt. HKDF's salt need not be secret; it domain-separates
 *  this application's derivations from any other use of the same master key. */
const SALT = Buffer.from('hhh-identity');

/**
 * @param {Buffer} master 32 raw bytes
 * @param {string} info Context string — the label that separates derived keys
 * @returns {Buffer} 32 derived bytes
 */
function derive(master, info) {
  return Buffer.from(
    hkdfSync(HASH, master, SALT, Buffer.from(info, 'utf8'), KEY_LEN)
  );
}

/**
 * Parse and validate the master key.
 *
 * Rejects anything that is not exactly 32 bytes: a short key silently weakens
 * every derived key, and there is no safe way to "stretch" it here — the master
 * key is machine-generated (`openssl rand -base64 32`), never human-chosen, so
 * a KDF over it would add nothing.
 *
 * @param {string} b64 base64-encoded 32-byte key
 * @returns {Buffer}
 */
export function parseMasterKey(b64) {
  if (typeof b64 !== 'string' || b64.trim() === '') {
    throw new Error('IDENTITY_MASTER_KEY is empty — refusing to start');
  }
  let raw;
  try {
    raw = Buffer.from(b64.trim(), 'base64');
  } catch {
    throw new Error('IDENTITY_MASTER_KEY is not valid base64');
  }
  if (raw.length !== KEY_LEN) {
    throw new Error(
      `IDENTITY_MASTER_KEY must decode to exactly ${KEY_LEN} bytes, got ${raw.length}. ` +
        'Generate one with: openssl rand -base64 32'
    );
  }
  return raw;
}

/**
 * Build the derived-key set for the configured versions.
 *
 * @param {{ master: Buffer, kekVersion: number, biVersion: number }} opts
 */
export function deriveKeys({ master, kekVersion, biVersion }) {
  if (!Number.isInteger(kekVersion) || kekVersion < 1) {
    throw new Error('kekVersion must be a positive integer');
  }
  if (!Number.isInteger(biVersion) || biVersion < 1) {
    throw new Error('biVersion must be a positive integer');
  }
  return {
    kekVersion,
    biVersion,
    kek: derive(master, `kek-v${kekVersion}`),
    peppers: {
      email: derive(master, `bi-email-v${biVersion}`),
      externalId: derive(master, `bi-extid-v${biVersion}`),
      keycloakSub: derive(master, `bi-sub-v${biVersion}`),
      name: derive(master, `bi-name-v${biVersion}`),
      code: derive(master, `bi-code-v${biVersion}`),
      ip: derive(master, `ip-hash-v${biVersion}`),
    },
  };
}

/**
 * Derive a specific historical KEK, for unwrapping DEKs written under an older
 * version during rotation.
 */
export function deriveKekVersion(master, version) {
  return derive(master, `kek-v${version}`);
}

/** Constant-time buffer comparison that tolerates length mismatch. */
export function safeEqual(a, b) {
  if (!Buffer.isBuffer(a) || !Buffer.isBuffer(b) || a.length !== b.length) {
    return false;
  }
  return timingSafeEqual(a, b);
}
