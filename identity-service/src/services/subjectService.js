/**
 * Subjects — the people on the roster.
 *
 * Two things here deserve their reasoning stated, because both look like
 * omissions rather than decisions:
 *
 * 1. Name search decrypts the register in memory (see `searchSubjects`).
 *    There is deliberately no searchable name index. At clinical-study scale
 *    an n-gram index over German surnames is trivially frequency-analysable —
 *    it would hand an attacker a substitution cipher with a publicly known
 *    plaintext distribution. Decrypting a bounded roster costs one DEK unwrap
 *    plus O(n) short AES-GCM decryptions and leaks nothing at rest.
 *
 * 2. Import responses never echo the submitted PII back. They are keyed by
 *    row number and subject code only, so a validation error cannot spray
 *    patient names into a log, an error tracker or a browser history entry.
 */

import { encryptField, decryptField, unwrapDek } from '../crypto/envelope.js';
import { blindIndex, personBlindIndex } from '../crypto/blindIndex.js';
import { formatSubjectCode } from './codes.js';

/** Encrypted columns, and the field name each is bound to via the AAD. */
export const PII_FIELDS = Object.freeze({
  givenName: 'given_name',
  familyName: 'family_name',
  dateOfBirth: 'dob',
  email: 'email',
  phone: 'phone',
  address: 'address',
  externalId: 'external_id',
  notes: 'notes',
});

export class SubjectError extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

/** Unwrap a register's DEK. One call per operation, not per row. */
export async function registerDek({ db, keys, registerId }) {
  const { rows } = await db.query(
    `SELECT id, dek_wrapped, kek_version FROM study_registers WHERE id = $1`,
    [registerId]
  );
  if (rows.length === 0) {
    throw new SubjectError('register_not_found', 'Register not found', 404);
  }
  return unwrapDek({
    kek: keys.kek,
    registerId: rows[0].id,
    kekVersion: rows[0].kek_version,
    wrapped: rows[0].dek_wrapped,
  });
}

/**
 * Allocate the next subject code under a row lock.
 *
 * Sequence numbers follow screening order, which is itself meaningful clinical
 * data. `FOR UPDATE` rather than a bare read-increment-write, so two
 * concurrent imports cannot mint the same code.
 */
export async function allocateSubjectCode({ db, registerId }) {
  const { rows } = await db.query(
    `UPDATE study_registers
        SET next_subject_seq = next_subject_seq + 1
      WHERE id = $1
      RETURNING subject_code_prefix, next_subject_seq - 1 AS seq`,
    [registerId]
  );
  if (rows.length === 0) {
    throw new SubjectError('register_not_found', 'Register not found', 404);
  }
  return formatSubjectCode(rows[0].subject_code_prefix, Number(rows[0].seq));
}

/**
 * Create one subject.
 *
 * The subject id is generated before encryption because the AAD binds every
 * ciphertext to it — encrypting first and assigning an id afterwards would
 * produce ciphertext bound to the wrong row.
 */
export async function createSubject({
  db,
  keys,
  registerId,
  actorSub,
  person,
  siteId = null,
}) {
  if (!person?.familyName && !person?.givenName && !person?.externalId) {
    throw new SubjectError(
      'insufficient_identity',
      'A subject needs at least a name or an external id'
    );
  }

  const dek = await registerDek({ db, keys, registerId });

  const { rows: idRows } = await db.query('SELECT gen_random_uuid() AS id');
  const subjectId = idRows[0].id;
  const subjectCode = await allocateSubjectCode({ db, registerId });

  const ct = (key) =>
    encryptField({
      key: dek,
      subjectId,
      fieldName: PII_FIELDS[key],
      plaintext: person[key] ?? null,
    });

  await db.query(
    `INSERT INTO subjects
       (id, register_id, subject_code, site_id,
        given_name_ct, family_name_ct, dob_ct, email_ct, phone_ct,
        address_ct, external_id_ct, notes_ct,
        email_bi, external_id_bi, person_bi, bi_version,
        status, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,'registered',$17)`,
    [
      subjectId,
      registerId,
      subjectCode,
      siteId,
      ct('givenName'),
      ct('familyName'),
      ct('dateOfBirth'),
      ct('email'),
      ct('phone'),
      ct('address'),
      ct('externalId'),
      ct('notes'),
      blindIndex(keys.peppers.email, person.email),
      blindIndex(keys.peppers.externalId, person.externalId),
      personBlindIndex(keys.peppers.name, person),
      keys.biVersion,
      actorSub,
    ]
  );

  return { id: subjectId, subjectCode };
}

/**
 * Import a roster.
 *
 * Per-row isolation: one bad row reports an error and the rest still import.
 * A study coordinator uploading 200 subjects should not lose 199 of them to a
 * malformed date on line 87.
 *
 * @returns {Promise<{imported, failed, rows: Array<{row, subjectCode?, error?, duplicateOf?}>}>}
 */
export async function importRoster({ db, keys, registerId, actorSub, people }) {
  const results = [];
  let imported = 0;
  let failed = 0;

  for (let i = 0; i < people.length; i++) {
    const rowNumber = i + 1;
    const person = people[i];
    try {
      const duplicateOf = await findProbableDuplicate({
        db,
        keys,
        registerId,
        person,
      });
      const { subjectCode } = await createSubject({
        db,
        keys,
        registerId,
        actorSub,
        person,
        siteId: person.siteId ?? null,
      });
      imported++;
      // Keyed by row number and subject code — never by name. The response
      // travels back through a browser and possibly a log.
      results.push({ row: rowNumber, subjectCode, duplicateOf });
    } catch (err) {
      failed++;
      results.push({
        row: rowNumber,
        error:
          err instanceof SubjectError
            ? err.code
            : /unique/i.test(err.message)
              ? 'duplicate_identifier'
              : 'import_failed',
      });
    }
  }

  return { imported, failed, rows: results };
}

/**
 * Warn about a probable duplicate. A WARNING, never a rejection: two people
 * can genuinely share a name and a date of birth.
 */
export async function findProbableDuplicate({ db, keys, registerId, person }) {
  const bi = personBlindIndex(keys.peppers.name, person);
  if (!bi) return null;
  const { rows } = await db.query(
    `SELECT subject_code FROM subjects
      WHERE register_id = $1 AND person_bi = $2 LIMIT 1`,
    [registerId, bi]
  );
  return rows[0]?.subject_code ?? null;
}

/** Exact lookup by email — used when sending an invite and to reject re-imports. */
export async function findByEmail({ db, keys, registerId, email }) {
  const bi = blindIndex(keys.peppers.email, email);
  if (!bi) return null;
  const { rows } = await db.query(
    `SELECT id, subject_code, status FROM subjects
      WHERE register_id = $1 AND email_bi = $2`,
    [registerId, bi]
  );
  return rows[0] ?? null;
}

/**
 * Search the roster by name.
 *
 * Decrypt-and-filter, deliberately (see the module docblock). Bounded by
 * `limit` so a caller cannot pull an entire register through this path.
 *
 * @param {{ includePii: boolean }} opts When false — a monitor, say — only
 *   subject codes and status are returned, so a role that may not read names
 *   cannot obtain them here.
 */
export async function searchSubjects({
  db,
  keys,
  registerId,
  query = '',
  siteId = null,
  limit = 200,
  includePii = false,
}) {
  const params = [registerId];
  let sql = `SELECT id, subject_code, site_id, status, verified_at,
                    given_name_ct, family_name_ct, dob_ct, email_ct
               FROM subjects WHERE register_id = $1`;
  if (siteId) {
    params.push(siteId);
    sql += ` AND site_id = $${params.length}`;
  }
  sql += ' ORDER BY subject_code';

  const { rows } = await db.query(sql, params);

  if (!includePii) {
    // No decryption at all on this path — a role without PII access never
    // causes a plaintext name to exist in memory.
    return rows
      .filter(
        (r) =>
          !query || r.subject_code.toLowerCase().includes(query.toLowerCase())
      )
      .slice(0, limit)
      .map((r) => ({
        id: r.id,
        subjectCode: r.subject_code,
        siteId: r.site_id,
        status: r.status,
        verifiedAt: r.verified_at,
      }));
  }

  const dek = await registerDek({ db, keys, registerId });
  const needle = query.trim().toLowerCase();
  const out = [];

  for (const r of rows) {
    // Per-row isolation. A single undecryptable row — corrupted ciphertext, a
    // row written under a rotated key, a partially-migrated register — must
    // not take down the whole roster. A nurse who cannot list ANY subject
    // cannot enrol anyone, which in a clinical setting is a worse failure than
    // one row showing as unreadable.
    let givenName;
    let familyName;
    let dateOfBirth;
    let email;
    let undecryptable = false;

    const dec = (col, field) =>
      decryptField({
        key: dek,
        subjectId: r.id,
        fieldName: field,
        ciphertext: r[col],
      });

    try {
      givenName = dec('given_name_ct', PII_FIELDS.givenName);
      familyName = dec('family_name_ct', PII_FIELDS.familyName);
      dateOfBirth = dec('dob_ct', PII_FIELDS.dateOfBirth);
      email = dec('email_ct', PII_FIELDS.email);
    } catch {
      // Deliberately no detail: the error text can echo ciphertext, and the
      // subject code alone is enough for an operator to investigate.
      undecryptable = true;
    }

    if (undecryptable) {
      out.push({
        id: r.id,
        subjectCode: r.subject_code,
        siteId: r.site_id,
        status: r.status,
        verifiedAt: r.verified_at,
        undecryptable: true,
      });
      if (out.length >= limit) break;
      continue;
    }

    if (needle) {
      const haystack = [givenName, familyName, r.subject_code]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      if (!haystack.includes(needle)) continue;
    }

    out.push({
      id: r.id,
      subjectCode: r.subject_code,
      siteId: r.site_id,
      status: r.status,
      verifiedAt: r.verified_at,
      givenName,
      familyName,
      dateOfBirth,
      email,
    });
    if (out.length >= limit) break;
  }
  return out;
}

/** Record that a human checked an identity document. */
export async function markVerified({ db, subjectId, actorSub, method }) {
  const { rowCount } = await db.query(
    `UPDATE subjects
        SET verified_at = now(), verified_by = $2, verification_method = $3,
            updated_at = now()
      WHERE id = $1`,
    [subjectId, actorSub, method]
  );
  if (rowCount === 0) {
    throw new SubjectError('subject_not_found', 'Subject not found', 404);
  }
  return { ok: true };
}

/**
 * Article 17 erasure.
 *
 * Deletes the register row OUTRIGHT — there is no tombstone in `subjects`,
 * and `ON DELETE CASCADE` takes the account link and any issued codes with it.
 * Nothing of the person is kept, not even an empty shell recording that one
 * existed; that is the stronger answer to Art. 17.
 *
 * What survives is one audit-log entry carrying the subject code and no
 * identity, which is what makes the erasure itself accountable. Subject codes
 * come from a counter on the register rather than a count of rows, so an
 * erased code can never be minted again for someone else.
 *
 * Re-identification is severed; the pseudonymous research data in HHH is
 * untouched and remains analysable. That asymmetry is the correct and
 * defensible outcome, and it belongs verbatim in the consent document.
 */
export async function eraseSubject({ db, subjectId }) {
  // The register id is read from the row rather than taken from the caller.
  // It used to be a request-body field the portal never sent, so every erasure
  // was recorded against register NULL — and the study audit view filters by
  // register, which meant an Art. 17 erasure did not appear in it at all.
  const { rows } = await db.query(
    `SELECT subject_code, register_id FROM subjects WHERE id = $1`,
    [subjectId]
  );
  if (rows.length === 0) {
    throw new SubjectError('subject_not_found', 'Subject not found', 404);
  }
  const { subject_code: subjectCode, register_id: registerId } = rows[0];

  await db.query(`DELETE FROM subjects WHERE id = $1`, [subjectId]);

  // Deliberately does NOT write its own audit row: the route records this
  // through the ordinary auditor, and doing both wrote the same erasure twice.
  // A compliance log that double-counts is worse than one that under-reports,
  // because the second is obvious and the first is not.
  return { erased: true, subjectCode, registerId };
}
