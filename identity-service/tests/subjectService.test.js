import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { parseMasterKey, deriveKeys } from '../src/crypto/keys.js';
import { generateDek, wrapDek, decryptField } from '../src/crypto/envelope.js';
import {
  createSubject,
  importRoster,
  searchSubjects,
  findByEmail,
  findProbableDuplicate,
  markVerified,
  eraseSubject,
  PII_FIELDS,
  SubjectError,
} from '../src/services/subjectService.js';

const keys = deriveKeys({
  master: parseMasterKey(randomBytes(32).toString('base64')),
  kekVersion: 1,
  biVersion: 1,
});

const REGISTER_ID = randomUUID();
const DEK = generateDek();

/** SQL-shaped fake, same approach as linkService.test.js. */
function makeDb() {
  const state = {
    register: {
      id: REGISTER_ID,
      subject_code_prefix: 'TUD-DFG01',
      next_subject_seq: 1,
      kek_version: 1,
      dek_wrapped: wrapDek({
        kek: keys.kek,
        registerId: REGISTER_ID,
        kekVersion: 1,
        dek: DEK,
      }),
    },
    subjects: [],
    audit: [],
  };

  async function query(sql, params = []) {
    const s = sql.replace(/\s+/g, ' ').trim();

    if (
      s.includes('SELECT id, dek_wrapped, kek_version FROM study_registers')
    ) {
      return params[0] === REGISTER_ID
        ? { rows: [state.register] }
        : { rows: [] };
    }
    if (s.startsWith('SELECT gen_random_uuid()')) {
      return { rows: [{ id: randomUUID() }] };
    }
    if (s.includes('UPDATE study_registers SET next_subject_seq')) {
      if (params[0] !== REGISTER_ID) return { rows: [] };
      const seq = state.register.next_subject_seq;
      state.register.next_subject_seq += 1;
      return {
        rows: [
          { subject_code_prefix: state.register.subject_code_prefix, seq },
        ],
      };
    }
    if (s.startsWith('INSERT INTO subjects')) {
      const [
        id,
        register_id,
        subject_code,
        site_id,
        given_name_ct,
        family_name_ct,
        dob_ct,
        email_ct,
        phone_ct,
        address_ct,
        external_id_ct,
        notes_ct,
        email_bi,
        external_id_bi,
        person_bi,
        bi_version,
        created_by,
      ] = params;
      if (
        email_bi &&
        state.subjects.some((x) => x.email_bi?.equals(email_bi))
      ) {
        throw new Error('duplicate key value violates unique constraint');
      }
      state.subjects.push({
        id,
        register_id,
        subject_code,
        site_id,
        given_name_ct,
        family_name_ct,
        dob_ct,
        email_ct,
        phone_ct,
        address_ct,
        external_id_ct,
        notes_ct,
        email_bi,
        external_id_bi,
        person_bi,
        bi_version,
        created_by,
        status: 'registered',
        verified_at: null,
      });
      return { rows: [], rowCount: 1 };
    }
    if (s.includes('WHERE register_id = $1 AND person_bi = $2')) {
      const hit = state.subjects.find(
        (x) => x.register_id === params[0] && x.person_bi?.equals(params[1])
      );
      return { rows: hit ? [{ subject_code: hit.subject_code }] : [] };
    }
    if (s.includes('WHERE register_id = $1 AND email_bi = $2')) {
      const hit = state.subjects.find(
        (x) => x.register_id === params[0] && x.email_bi?.equals(params[1])
      );
      return {
        rows: hit
          ? [{ id: hit.id, subject_code: hit.subject_code, status: hit.status }]
          : [],
      };
    }
    if (s.startsWith('SELECT id, subject_code, site_id, status, verified_at')) {
      let rows = state.subjects.filter((x) => x.register_id === params[0]);
      if (params[1]) rows = rows.filter((x) => x.site_id === params[1]);
      return {
        rows: rows.sort((a, b) => a.subject_code.localeCompare(b.subject_code)),
      };
    }
    if (s.includes('UPDATE subjects SET verified_at')) {
      const hit = state.subjects.find((x) => x.id === params[0]);
      if (!hit) return { rows: [], rowCount: 0 };
      hit.verified_at = new Date();
      hit.verified_by = params[1];
      hit.verification_method = params[2];
      return { rows: [], rowCount: 1 };
    }
    if (s.startsWith('SELECT subject_code FROM subjects WHERE id')) {
      const hit = state.subjects.find((x) => x.id === params[0]);
      return { rows: hit ? [{ subject_code: hit.subject_code }] : [] };
    }
    if (s.startsWith('DELETE FROM subjects')) {
      const i = state.subjects.findIndex((x) => x.id === params[0]);
      if (i >= 0) state.subjects.splice(i, 1);
      return { rows: [], rowCount: i >= 0 ? 1 : 0 };
    }
    if (s.startsWith('INSERT INTO identity_audit_log')) {
      state.audit.push({
        registerId: params[0],
        actor: params[1],
        subjectCode: params[2],
      });
      return { rows: [], rowCount: 1 };
    }
    throw new Error(`unhandled SQL: ${s.slice(0, 80)}`);
  }

  return { query, state };
}

const anna = {
  givenName: 'Anna',
  familyName: 'Müller',
  dateOfBirth: '1990-01-01',
  email: 'anna@example.invalid',
  phone: '+49 351 000',
};

describe('createSubject', () => {
  it('allocates sequential subject codes in screening order', async () => {
    const db = makeDb();
    const a = await createSubject({
      db,
      keys,
      registerId: REGISTER_ID,
      actorSub: 'nurse',
      person: anna,
    });
    const b = await createSubject({
      db,
      keys,
      registerId: REGISTER_ID,
      actorSub: 'nurse',
      person: { familyName: 'Schmidt' },
    });
    assert.equal(a.subjectCode, 'TUD-DFG01-0001');
    assert.equal(b.subjectCode, 'TUD-DFG01-0002');
  });

  it('encrypts every PII field — none is readable in the stored row', async () => {
    const db = makeDb();
    await createSubject({
      db,
      keys,
      registerId: REGISTER_ID,
      actorSub: 'n',
      person: anna,
    });
    const row = db.state.subjects[0];
    const blob = JSON.stringify(row);
    for (const value of [
      'Anna',
      'Müller',
      'anna@example.invalid',
      '+49 351 000',
    ]) {
      assert.ok(
        !blob.includes(value),
        `${value} must not be stored in the clear`
      );
    }
  });

  it('binds ciphertext to the row and column, so it cannot be moved', async () => {
    const db = makeDb();
    await createSubject({
      db,
      keys,
      registerId: REGISTER_ID,
      actorSub: 'n',
      person: anna,
    });
    const row = db.state.subjects[0];

    assert.equal(
      decryptField({
        key: DEK,
        subjectId: row.id,
        fieldName: PII_FIELDS.familyName,
        ciphertext: row.family_name_ct,
      }),
      'Müller'
    );
    assert.throws(
      () =>
        decryptField({
          key: DEK,
          subjectId: row.id,
          fieldName: PII_FIELDS.givenName,
          ciphertext: row.family_name_ct,
        }),
      'a column swap must not decrypt'
    );
  });

  it('leaves absent optional fields null rather than encrypting an empty string', async () => {
    const db = makeDb();
    await createSubject({
      db,
      keys,
      registerId: REGISTER_ID,
      actorSub: 'n',
      person: { familyName: 'Solo' },
    });
    const row = db.state.subjects[0];
    assert.equal(row.phone_ct, null);
    assert.equal(
      row.email_bi,
      null,
      'a null blind index avoids unique-index collisions'
    );
  });

  it('refuses a subject with nothing identifying at all', async () => {
    await assert.rejects(
      () =>
        createSubject({
          db: makeDb(),
          keys,
          registerId: REGISTER_ID,
          actorSub: 'n',
          person: {},
        }),
      (e) => e instanceof SubjectError && e.code === 'insufficient_identity'
    );
  });

  it('refuses an unknown register', async () => {
    await assert.rejects(
      () =>
        createSubject({
          db: makeDb(),
          keys,
          registerId: randomUUID(),
          actorSub: 'n',
          person: anna,
        }),
      (e) => e.code === 'register_not_found'
    );
  });
});

describe('importRoster', () => {
  it('imports every valid row', async () => {
    const db = makeDb();
    const out = await importRoster({
      db,
      keys,
      registerId: REGISTER_ID,
      actorSub: 'mgr',
      people: [anna, { familyName: 'Schmidt' }, { familyName: 'Weber' }],
    });
    assert.equal(out.imported, 3);
    assert.equal(out.failed, 0);
    assert.deepEqual(
      out.rows.map((r) => r.subjectCode),
      ['TUD-DFG01-0001', 'TUD-DFG01-0002', 'TUD-DFG01-0003']
    );
  });

  it('NEVER echoes submitted PII back in the response', async () => {
    // The response travels through a browser and possibly a log; a validation
    // error must not spray patient names into either.
    const db = makeDb();
    const out = await importRoster({
      db,
      keys,
      registerId: REGISTER_ID,
      actorSub: 'mgr',
      people: [anna, {}],
    });
    const blob = JSON.stringify(out);
    for (const value of ['Anna', 'Müller', 'anna@example.invalid']) {
      assert.ok(
        !blob.includes(value),
        `${value} must not appear in the import report`
      );
    }
  });

  it('isolates a bad row so the rest still import', async () => {
    // 199 good rows must not be lost to a malformed row 87.
    const db = makeDb();
    const out = await importRoster({
      db,
      keys,
      registerId: REGISTER_ID,
      actorSub: 'mgr',
      people: [{ familyName: 'A' }, {}, { familyName: 'C' }],
    });
    assert.equal(out.imported, 2);
    assert.equal(out.failed, 1);
    assert.equal(out.rows[1].error, 'insufficient_identity');
    assert.equal(out.rows[1].row, 2, 'errors are keyed by row number');
  });

  it('WARNS about a probable duplicate without rejecting it', async () => {
    // Two people can genuinely share a name and date of birth.
    const db = makeDb();
    await importRoster({
      db,
      keys,
      registerId: REGISTER_ID,
      actorSub: 'm',
      people: [anna],
    });
    const out = await importRoster({
      db,
      keys,
      registerId: REGISTER_ID,
      actorSub: 'm',
      people: [{ ...anna, email: 'different@example.invalid' }],
    });
    assert.equal(out.imported, 1, 'the duplicate is still imported');
    assert.equal(out.rows[0].duplicateOf, 'TUD-DFG01-0001');
  });

  it('reports a duplicate email as a failure, since that index is unique', async () => {
    const db = makeDb();
    await importRoster({
      db,
      keys,
      registerId: REGISTER_ID,
      actorSub: 'm',
      people: [anna],
    });
    const out = await importRoster({
      db,
      keys,
      registerId: REGISTER_ID,
      actorSub: 'm',
      people: [anna],
    });
    assert.equal(out.failed, 1);
    assert.equal(out.rows[0].error, 'duplicate_identifier');
  });
});

describe('searchSubjects', () => {
  async function seeded() {
    const db = makeDb();
    await importRoster({
      db,
      keys,
      registerId: REGISTER_ID,
      actorSub: 'm',
      people: [
        anna,
        { givenName: 'Bernd', familyName: 'Schmidt' },
        { givenName: 'Clara', familyName: 'Weber', siteId: 'site-b' },
      ],
    });
    return db;
  }

  it('finds by family name', async () => {
    const db = await seeded();
    const out = await searchSubjects({
      db,
      keys,
      registerId: REGISTER_ID,
      query: 'müller',
      includePii: true,
    });
    assert.equal(out.length, 1);
    assert.equal(out[0].familyName, 'Müller');
    assert.equal(out[0].subjectCode, 'TUD-DFG01-0001');
  });

  it('finds by given name and by subject code', async () => {
    const db = await seeded();
    assert.equal(
      (
        await searchSubjects({
          db,
          keys,
          registerId: REGISTER_ID,
          query: 'bernd',
          includePii: true,
        })
      ).length,
      1
    );
    assert.equal(
      (
        await searchSubjects({
          db,
          keys,
          registerId: REGISTER_ID,
          query: '0003',
          includePii: true,
        })
      ).length,
      1
    );
  });

  it('WITHOUT PII access, returns codes only and decrypts nothing', async () => {
    // A monitor may see status, never names — and no plaintext name should
    // even exist in memory on this path.
    const db = await seeded();
    const out = await searchSubjects({
      db,
      keys,
      registerId: REGISTER_ID,
      includePii: false,
    });
    assert.equal(out.length, 3);
    for (const row of out) {
      assert.ok(row.subjectCode);
      assert.equal(row.familyName, undefined);
      assert.equal(row.email, undefined);
    }
  });

  it('scopes to a site when one is given', async () => {
    const db = await seeded();
    const out = await searchSubjects({
      db,
      keys,
      registerId: REGISTER_ID,
      siteId: 'site-b',
      includePii: true,
    });
    assert.equal(out.length, 1);
    assert.equal(out[0].familyName, 'Weber');
  });

  it('bounds the result set so a caller cannot pull the whole register', async () => {
    const db = await seeded();
    assert.equal(
      (
        await searchSubjects({
          db,
          keys,
          registerId: REGISTER_ID,
          includePii: true,
          limit: 2,
        })
      ).length,
      2
    );
  });

  it('returns everyone when no query is given', async () => {
    const db = await seeded();
    assert.equal(
      (
        await searchSubjects({
          db,
          keys,
          registerId: REGISTER_ID,
          includePii: true,
        })
      ).length,
      3
    );
  });
});

describe('lookups and lifecycle', () => {
  it('findByEmail matches regardless of case and whitespace', async () => {
    const db = makeDb();
    await createSubject({
      db,
      keys,
      registerId: REGISTER_ID,
      actorSub: 'n',
      person: anna,
    });
    const hit = await findByEmail({
      db,
      keys,
      registerId: REGISTER_ID,
      email: '  ANNA@Example.Invalid ',
    });
    assert.equal(hit.subject_code, 'TUD-DFG01-0001');
  });

  it('findByEmail returns null for an absent email rather than matching everyone', async () => {
    const db = makeDb();
    await createSubject({
      db,
      keys,
      registerId: REGISTER_ID,
      actorSub: 'n',
      person: { familyName: 'NoMail' },
    });
    assert.equal(
      await findByEmail({ db, keys, registerId: REGISTER_ID, email: null }),
      null
    );
  });

  it('findProbableDuplicate ignores date-of-birth mismatches', async () => {
    const db = makeDb();
    await createSubject({
      db,
      keys,
      registerId: REGISTER_ID,
      actorSub: 'n',
      person: anna,
    });
    assert.equal(
      await findProbableDuplicate({
        db,
        keys,
        registerId: REGISTER_ID,
        person: { ...anna, dateOfBirth: '1991-01-01' },
      }),
      null
    );
  });

  it('markVerified records who checked the document and how', async () => {
    const db = makeDb();
    const { id } = await createSubject({
      db,
      keys,
      registerId: REGISTER_ID,
      actorSub: 'n',
      person: anna,
    });
    await markVerified({
      db,
      subjectId: id,
      actorSub: 'nurse-1',
      method: 'in_person',
    });
    const row = db.state.subjects[0];
    assert.ok(row.verified_at);
    assert.equal(row.verified_by, 'nurse-1');
    assert.equal(row.verification_method, 'in_person');
  });

  it('markVerified 404s an unknown subject', async () => {
    await assert.rejects(
      () =>
        markVerified({
          db: makeDb(),
          subjectId: randomUUID(),
          actorSub: 'n',
          method: 'in_person',
        }),
      (e) => e.status === 404
    );
  });

  it('eraseSubject removes the person and leaves a code-only tombstone', async () => {
    // Art. 17: re-identification is severed, the pseudonymous research data in
    // HHH is untouched.
    const db = makeDb();
    const { id } = await createSubject({
      db,
      keys,
      registerId: REGISTER_ID,
      actorSub: 'n',
      person: anna,
    });
    const out = await eraseSubject({
      db,
      subjectId: id,
      actorSub: 'mgr',
      registerId: REGISTER_ID,
    });

    assert.equal(out.erased, true);
    assert.equal(out.subjectCode, 'TUD-DFG01-0001');
    assert.equal(db.state.subjects.length, 0);
    assert.equal(db.state.audit.length, 1);
    assert.equal(db.state.audit[0].subjectCode, 'TUD-DFG01-0001');
  });

  it('eraseSubject 404s an unknown subject', async () => {
    await assert.rejects(
      () =>
        eraseSubject({
          db: makeDb(),
          subjectId: randomUUID(),
          actorSub: 'm',
          registerId: REGISTER_ID,
        }),
      (e) => e.status === 404
    );
  });
});
