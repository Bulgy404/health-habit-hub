import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  generateEnrollmentCode,
  normalizeEnrollmentCode,
  isEnrollmentCode,
  isAnonymousCode,
  formatSubjectCode,
  CODE_ALPHABET,
  ENROLLMENT_CODE_PATTERN,
} from '../src/services/codes.js';

describe('enrollment codes', () => {
  it('generates codes in the documented shape', () => {
    for (let i = 0; i < 200; i++) {
      assert.match(generateEnrollmentCode(), ENROLLMENT_CODE_PATTERN);
    }
  });

  it('excludes I, L, O and U — the characters misread off paper', () => {
    // A study nurse reads these aloud or a participant copies them from a
    // printed sheet; I/1, L/1 and O/0 are where that goes wrong.
    for (const c of 'ILOU') {
      assert.ok(!CODE_ALPHABET.includes(c), `alphabet must not contain ${c}`);
    }
    const sample = Array.from({ length: 300 }, generateEnrollmentCode).join('');
    assert.ok(!/[ILOU]/.test(sample.replace(/^HHV|-/g, '')));
  });

  it('does not repeat within a large sample', () => {
    const seen = new Set();
    for (let i = 0; i < 5000; i++) seen.add(generateEnrollmentCode());
    assert.equal(seen.size, 5000, 'generated codes must be unique');
  });

  it('uses the whole alphabet (no dead symbols from a biased draw)', () => {
    const used = new Set(
      Array.from({ length: 3000 }, generateEnrollmentCode)
        .join('')
        .replace(/HHV|-/g, '')
        .split('')
    );
    assert.equal(
      used.size,
      CODE_ALPHABET.length,
      'every symbol should appear across a large sample'
    );
  });

  it('normalises the substitutions people actually make', () => {
    // There is no valid code containing I, L, O or U, so repairing them can
    // never corrupt a legitimate code.
    assert.equal(
      normalizeEnrollmentCode(' hhv-4k7p2-9qx3r '),
      'HHV-4K7P2-9QX3R'
    );
    assert.equal(normalizeEnrollmentCode('HHV-4K7PI-9QX3R'), 'HHV-4K7P1-9QX3R');
    assert.equal(normalizeEnrollmentCode('HHV-4K7PL-9QX3R'), 'HHV-4K7P1-9QX3R');
    assert.equal(normalizeEnrollmentCode('HHV-4K7PO-9QX3R'), 'HHV-4K7P0-9QX3R');
  });

  it('strips internal whitespace from a code read aloud', () => {
    assert.equal(normalizeEnrollmentCode('HHV 4K7P2 9QX3R'), 'HHV4K7P29QX3R');
  });

  it('handles non-string input without throwing', () => {
    for (const bad of [null, undefined, 42, {}, []]) {
      assert.equal(normalizeEnrollmentCode(bad), '');
      assert.equal(isEnrollmentCode(bad), false);
    }
  });

  it('recognises its own generated codes', () => {
    for (let i = 0; i < 100; i++) {
      assert.ok(isEnrollmentCode(generateEnrollmentCode()));
    }
  });

  it('distinguishes verified from anonymous codes by prefix', () => {
    // This is what lets the backend route without a study lookup.
    assert.ok(isEnrollmentCode('HHV-4K7P2-9QX3R'));
    assert.ok(!isAnonymousCode('HHV-4K7P2-9QX3R'));

    assert.ok(isAnonymousCode('HHH-ABCDE'));
    assert.ok(!isEnrollmentCode('HHH-ABCDE'));
  });

  it('rejects malformed codes', () => {
    for (const bad of [
      'HHV-4K7P2',
      'HHV-4K7P2-9QX3',
      'HHV-4K7P2-9QX3RR',
      'HHX-4K7P2-9QX3R',
      '4K7P2-9QX3R',
      '',
    ]) {
      assert.equal(isEnrollmentCode(bad), false, `${bad} must be rejected`);
    }
  });
});

describe('subject codes', () => {
  it('formats with a zero-padded sequence', () => {
    assert.equal(formatSubjectCode('TUD-DFG01', 1), 'TUD-DFG01-0001');
    assert.equal(formatSubjectCode('TUD-DFG01', 42), 'TUD-DFG01-0042');
  });

  it('does not truncate beyond four digits', () => {
    assert.equal(formatSubjectCode('TUD-DFG01', 12345), 'TUD-DFG01-12345');
  });

  it('rejects an invalid prefix', () => {
    for (const bad of ['', 'x', 'lower', 'HAS SPACE', '-LEADING']) {
      assert.throws(
        () => formatSubjectCode(bad, 1),
        /invalid subject code prefix/
      );
    }
  });

  it('rejects an invalid sequence', () => {
    for (const bad of [0, -1, 1.5, NaN, '1']) {
      assert.throws(
        () => formatSubjectCode('TUD-DFG01', bad),
        /invalid subject sequence/
      );
    }
  });
});
