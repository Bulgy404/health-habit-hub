import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseRosterCsv } from '../src/routes/public.js';

describe('roster CSV parsing', () => {
  it('reads an English header', () => {
    const rows = parseRosterCsv(
      Buffer.from(
        'givenName,familyName,dateOfBirth,email\nAnna,Müller,1990-01-01,a@b.invalid\n'
      )
    );
    assert.deepEqual(rows, [
      {
        givenName: 'Anna',
        familyName: 'Müller',
        dateOfBirth: '1990-01-01',
        email: 'a@b.invalid',
      },
    ]);
  });

  it('reads a German header — the sheets a TU study site actually produces', () => {
    const rows = parseRosterCsv(
      Buffer.from(
        'Vorname,Nachname,Geburtsdatum,Telefon\nAnna,Müller,1990-01-01,0351\n'
      )
    );
    assert.equal(rows[0].givenName, 'Anna');
    assert.equal(rows[0].familyName, 'Müller');
    assert.equal(rows[0].dateOfBirth, '1990-01-01');
    assert.equal(rows[0].phone, '0351');
  });

  it('tolerates a UTF-8 BOM, which Excel always writes', () => {
    const rows = parseRosterCsv(Buffer.from('﻿familyName\nMüller\n'));
    assert.equal(rows[0].familyName, 'Müller');
  });

  it('ignores unrecognised columns rather than failing the import', () => {
    const rows = parseRosterCsv(
      Buffer.from('familyName,someInternalCode\nMüller,XYZ\n')
    );
    assert.deepEqual(rows, [{ familyName: 'Müller' }]);
  });

  it('drops empty cells so they do not become empty-string ciphertext', () => {
    const rows = parseRosterCsv(Buffer.from('familyName,email\nMüller,\n'));
    assert.equal('email' in rows[0], false);
  });

  it('skips blank lines', () => {
    const rows = parseRosterCsv(Buffer.from('familyName\nMüller\n\nSchmidt\n'));
    assert.equal(rows.length, 2);
  });
});

describe('module wiring', () => {
  it('every source module loads', async () => {
    for (const m of [
      '../src/config.js',
      '../src/crypto/keys.js',
      '../src/crypto/envelope.js',
      '../src/crypto/blindIndex.js',
      '../src/services/codes.js',
      '../src/services/codeSheet.js',
      '../src/services/linkService.js',
      '../src/services/subjectService.js',
      '../src/services/reidentificationService.js',
      '../src/middleware/roles.js',
      '../src/middleware/audit.js',
      '../src/middleware/auth.js',
      '../src/routes/internal.js',
      '../src/routes/public.js',
    ]) {
      await import(m);
    }
  });
});
