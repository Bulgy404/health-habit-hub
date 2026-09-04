import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import {
  parseMasterKey,
  deriveKeys,
  deriveKekVersion,
  safeEqual,
} from '../src/crypto/keys.js';
import {
  encryptField,
  decryptField,
  generateDek,
  wrapDek,
  unwrapDek,
  SCHEME,
} from '../src/crypto/envelope.js';
import {
  blindIndex,
  personBlindIndex,
  normalize,
} from '../src/crypto/blindIndex.js';

const MASTER_B64 = randomBytes(32).toString('base64');
const master = parseMasterKey(MASTER_B64);
const keys = deriveKeys({ master, kekVersion: 1, biVersion: 1 });

describe('master key parsing', () => {
  it('accepts a valid 32-byte base64 key', () => {
    assert.equal(parseMasterKey(MASTER_B64).length, 32);
  });

  it('rejects an empty key rather than starting with a weak one', () => {
    assert.throws(() => parseMasterKey(''), /refusing to start/);
    assert.throws(() => parseMasterKey('   '), /refusing to start/);
  });

  it('rejects a key of the wrong length', () => {
    const short = randomBytes(16).toString('base64');
    assert.throws(() => parseMasterKey(short), /exactly 32 bytes, got 16/);
  });
});

describe('key derivation', () => {
  it('is deterministic for the same master and versions', () => {
    const a = deriveKeys({ master, kekVersion: 1, biVersion: 1 });
    const b = deriveKeys({ master, kekVersion: 1, biVersion: 1 });
    assert.ok(safeEqual(a.kek, b.kek));
    assert.ok(safeEqual(a.peppers.email, b.peppers.email));
  });

  it('separates every derived key from every other', () => {
    const all = [keys.kek, ...Object.values(keys.peppers)];
    for (let i = 0; i < all.length; i++) {
      for (let j = i + 1; j < all.length; j++) {
        assert.ok(!safeEqual(all[i], all[j]), `derived keys ${i}/${j} collide`);
      }
    }
  });

  it('KEK and blind-index versions rotate independently', () => {
    // The whole point of separate version counters: bumping the KEK must not
    // invalidate blind indexes, which would force a full plaintext re-pass.
    const rotatedKek = deriveKeys({ master, kekVersion: 2, biVersion: 1 });
    assert.ok(!safeEqual(rotatedKek.kek, keys.kek), 'KEK must change');
    assert.ok(
      safeEqual(rotatedKek.peppers.email, keys.peppers.email),
      'peppers must NOT change when only the KEK rotates'
    );

    const rotatedBi = deriveKeys({ master, kekVersion: 1, biVersion: 2 });
    assert.ok(safeEqual(rotatedBi.kek, keys.kek), 'KEK must not change');
    assert.ok(!safeEqual(rotatedBi.peppers.email, keys.peppers.email));
  });

  it('exposes historical KEKs for rotation', () => {
    assert.ok(safeEqual(deriveKekVersion(master, 1), keys.kek));
  });

  it('rejects non-positive versions', () => {
    assert.throws(() => deriveKeys({ master, kekVersion: 0, biVersion: 1 }));
    assert.throws(() => deriveKeys({ master, kekVersion: 1, biVersion: -1 }));
  });
});

describe('field encryption', () => {
  const key = generateDek();
  const subjectId = 'subject-0001';

  it('round-trips a value', () => {
    const ct = encryptField({
      key,
      subjectId,
      fieldName: 'family_name',
      plaintext: 'Müller-Lüdenscheidt',
    });
    assert.equal(
      decryptField({ key, subjectId, fieldName: 'family_name', ciphertext: ct }),
      'Müller-Lüdenscheidt'
    );
  });

  it('passes null through instead of encrypting an empty string', () => {
    // An encrypted empty string would still leak "this field is set".
    assert.equal(
      encryptField({ key, subjectId, fieldName: 'phone', plaintext: null }),
      null
    );
    assert.equal(
      decryptField({ key, subjectId, fieldName: 'phone', ciphertext: null }),
      null
    );
  });

  it('produces a different ciphertext every time (fresh IV)', () => {
    const a = encryptField({ key, subjectId, fieldName: 'x', plaintext: 'same' });
    const b = encryptField({ key, subjectId, fieldName: 'x', plaintext: 'same' });
    assert.notEqual(a.toString('hex'), b.toString('hex'));
    // ...but both still decrypt.
    assert.equal(
      decryptField({ key, subjectId, fieldName: 'x', ciphertext: a }),
      'same'
    );
    assert.equal(
      decryptField({ key, subjectId, fieldName: 'x', ciphertext: b }),
      'same'
    );
  });

  it('uses the documented layout', () => {
    const ct = encryptField({ key, subjectId, fieldName: 'x', plaintext: 'ab' });
    assert.equal(ct[0], SCHEME.SCHEME_VERSION);
    assert.equal(ct.length, 1 + SCHEME.IV_LEN + 2 + SCHEME.TAG_LEN);
  });

  /* The three tamper cases below are the reason the AAD exists at all. */

  it('REFUSES ciphertext moved to a different row', () => {
    const ct = encryptField({
      key,
      subjectId: 'alice',
      fieldName: 'family_name',
      plaintext: 'Alice',
    });
    assert.throws(
      () =>
        decryptField({
          key,
          subjectId: 'bob',
          fieldName: 'family_name',
          ciphertext: ct,
        }),
      /unable to authenticate|unsupported state/i,
      'moving a row must not decrypt'
    );
  });

  it('REFUSES ciphertext moved to a different column', () => {
    const ct = encryptField({
      key,
      subjectId,
      fieldName: 'email',
      plaintext: 'a@b.invalid',
    });
    assert.throws(
      () =>
        decryptField({ key, subjectId, fieldName: 'notes', ciphertext: ct }),
      /unable to authenticate|unsupported state/i,
      'moving a field must not decrypt'
    );
  });

  it('REFUSES a modified byte', () => {
    const ct = encryptField({ key, subjectId, fieldName: 'x', plaintext: 'hi' });
    ct[ct.length - 1] ^= 0xff; // flip a tag bit
    assert.throws(() =>
      decryptField({ key, subjectId, fieldName: 'x', ciphertext: ct })
    );
  });

  it('refuses the wrong key', () => {
    const ct = encryptField({ key, subjectId, fieldName: 'x', plaintext: 'hi' });
    assert.throws(() =>
      decryptField({
        key: generateDek(),
        subjectId,
        fieldName: 'x',
        ciphertext: ct,
      })
    );
  });

  it('refuses an unknown scheme version', () => {
    const ct = encryptField({ key, subjectId, fieldName: 'x', plaintext: 'hi' });
    ct[0] = 0x99;
    assert.throws(
      () => decryptField({ key, subjectId, fieldName: 'x', ciphertext: ct }),
      /unsupported ciphertext scheme version/
    );
  });

  it('refuses truncated ciphertext', () => {
    assert.throws(
      () =>
        decryptField({
          key,
          subjectId,
          fieldName: 'x',
          ciphertext: Buffer.alloc(4),
        }),
      /too short/
    );
  });

  it('refuses a key of the wrong size', () => {
    assert.throws(
      () =>
        encryptField({
          key: randomBytes(16),
          subjectId,
          fieldName: 'x',
          plaintext: 'hi',
        }),
      /32 raw bytes/
    );
  });

  it('refuses to build an AAD without both parts', () => {
    assert.throws(() =>
      encryptField({ key, subjectId: '', fieldName: 'x', plaintext: 'hi' })
    );
    assert.throws(() =>
      encryptField({ key, subjectId, fieldName: '', plaintext: 'hi' })
    );
  });
});

describe('DEK wrapping', () => {
  const registerId = 'reg-1';

  it('round-trips a DEK', () => {
    const dek = generateDek();
    const wrapped = wrapDek({
      kek: keys.kek,
      registerId,
      kekVersion: 1,
      dek,
    });
    const out = unwrapDek({
      kek: keys.kek,
      registerId,
      kekVersion: 1,
      wrapped,
    });
    assert.ok(safeEqual(dek, out));
  });

  it('refuses a DEK moved to another register', () => {
    const wrapped = wrapDek({
      kek: keys.kek,
      registerId: 'reg-1',
      kekVersion: 1,
      dek: generateDek(),
    });
    assert.throws(() =>
      unwrapDek({
        kek: keys.kek,
        registerId: 'reg-2',
        kekVersion: 1,
        wrapped,
      })
    );
  });

  it('refuses a mismatched KEK version', () => {
    const wrapped = wrapDek({
      kek: keys.kek,
      registerId,
      kekVersion: 1,
      dek: generateDek(),
    });
    assert.throws(() =>
      unwrapDek({ kek: keys.kek, registerId, kekVersion: 2, wrapped })
    );
  });

  it('supports rotation: rewrap under a new KEK without touching plaintext', () => {
    const dek = generateDek();
    const v1 = wrapDek({ kek: keys.kek, registerId, kekVersion: 1, dek });

    const kek2 = deriveKekVersion(master, 2);
    const recovered = unwrapDek({
      kek: keys.kek,
      registerId,
      kekVersion: 1,
      wrapped: v1,
    });
    const v2 = wrapDek({ kek: kek2, registerId, kekVersion: 2, dek: recovered });

    assert.ok(
      safeEqual(
        unwrapDek({ kek: kek2, registerId, kekVersion: 2, wrapped: v2 }),
        dek
      ),
      'the same DEK must survive a KEK rotation'
    );
  });
});

describe('blind indexes', () => {
  const pepper = keys.peppers.email;

  it('is deterministic', () => {
    const a = blindIndex(pepper, 'anna@example.invalid');
    const b = blindIndex(pepper, 'anna@example.invalid');
    assert.ok(safeEqual(a, b));
  });

  it('normalises case and surrounding whitespace', () => {
    assert.ok(
      safeEqual(
        blindIndex(pepper, '  Anna@Example.Invalid '),
        blindIndex(pepper, 'anna@example.invalid')
      )
    );
  });

  it('applies NFKC so composed and decomposed forms match', () => {
    // "ä" as one codepoint vs "a" + combining diaeresis — a roster exported
    // from one system and typed into another must still match.
    const composed = 'Mäller';
    const decomposed = 'Mäller';
    assert.notEqual(composed, decomposed, 'inputs must genuinely differ');
    assert.ok(safeEqual(blindIndex(pepper, composed), blindIndex(pepper, decomposed)));
    assert.equal(normalize(composed), normalize(decomposed));
  });

  it('returns null for absent input so unique indexes do not collide', () => {
    assert.equal(blindIndex(pepper, null), null);
    assert.equal(blindIndex(pepper, undefined), null);
    assert.equal(blindIndex(pepper, '   '), null);
  });

  it('produces different digests under different peppers', () => {
    assert.ok(
      !safeEqual(
        blindIndex(keys.peppers.email, 'x@y.invalid'),
        blindIndex(keys.peppers.externalId, 'x@y.invalid')
      ),
      'cross-field correlation must not be possible'
    );
  });

  it('rejects a malformed pepper', () => {
    assert.throws(() => blindIndex(Buffer.alloc(8), 'x'), /32 raw bytes/);
  });

  it('personBlindIndex matches on name + date of birth', () => {
    const p = keys.peppers.name;
    const a = personBlindIndex(p, {
      familyName: 'Müller',
      givenName: 'Anna',
      dateOfBirth: '1990-01-01',
    });
    const b = personBlindIndex(p, {
      familyName: ' müller ',
      givenName: 'ANNA',
      dateOfBirth: '1990-01-01',
    });
    assert.ok(safeEqual(a, b));

    const different = personBlindIndex(p, {
      familyName: 'Müller',
      givenName: 'Anna',
      dateOfBirth: '1991-01-01',
    });
    assert.ok(!safeEqual(a, different), 'a different DOB must not collide');
  });

  it('personBlindIndex returns null when there is no name at all', () => {
    assert.equal(personBlindIndex(keys.peppers.name, {}), null);
  });
});
