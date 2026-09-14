import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildCodeSheet } from '../src/services/codeSheet.js';

describe('code sheet', () => {
  const rows = [
    {
      subjectCode: 'TUD-DFG01-0001',
      givenName: 'Anna',
      familyName: 'Müller',
      dateOfBirth: '1990-01-01',
      code: 'HHV-4K7P2-9QX3R',
    },
    { subjectCode: 'TUD-DFG01-0002', familyName: 'Schmidt', code: null },
  ];

  it('produces a PDF', async () => {
    const pdf = await buildCodeSheet({
      studyName: 'DFG Study',
      subjectCodePrefix: 'TUD-DFG01',
      rows,
    });
    assert.ok(Buffer.isBuffer(pdf));
    assert.equal(
      pdf.subarray(0, 4).toString('latin1'),
      '%PDF',
      'must be a real PDF'
    );
    assert.ok(pdf.length > 1000);
  });

  it('handles a subject with no code issued yet', async () => {
    const pdf = await buildCodeSheet({
      studyName: 'S',
      subjectCodePrefix: 'P',
      rows: [rows[1]],
    });
    assert.ok(pdf.length > 500);
  });

  it('handles an empty register without throwing', async () => {
    const pdf = await buildCodeSheet({
      studyName: 'S',
      subjectCodePrefix: 'P',
      rows: [],
    });
    assert.equal(pdf.subarray(0, 4).toString('latin1'), '%PDF');
  });

  it('paginates a roster larger than one page', async () => {
    const many = Array.from({ length: 40 }, (_, i) => ({
      subjectCode: `TUD-DFG01-${String(i + 1).padStart(4, '0')}`,
      familyName: `Person${i}`,
      code: 'HHV-4K7P2-9QX3R',
    }));
    const pdf = await buildCodeSheet({
      studyName: 'S',
      subjectCodePrefix: 'P',
      rows: many,
    });
    assert.ok(pdf.length > 10000, 'a 40-row roster must span multiple pages');
  });
});
