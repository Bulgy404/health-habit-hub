import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ObjectId } from 'mongodb';
import { exportStudyData } from '../../services/studyExportService.js';

const STUDY_ID = new ObjectId();

/**
 * Minimal Mongo stub in the style of the other unit tests (see
 * intentionService.test.js): only the driver methods the service actually
 * calls, backed by plain arrays.
 */
function makeDb({ participants = [] } = {}) {
  const data = {
    studies: [{ _id: STUDY_ID, name: 'Test Study' }],
    enrollments: [{ userId: 'user-1', studyId: STUDY_ID }],
    participants,
  };
  return {
    collection(name) {
      return {
        async findOne() {
          return data.studies[0];
        },
        find() {
          return {
            async toArray() {
              return (data[name] ?? []).map((d) => ({ ...d }));
            },
          };
        },
      };
    },
  };
}

describe('studyExportService — participant sanitisation', () => {
  // A study export bundle is copied, emailed and archived far more freely
  // than the database it came from, so credential material must never be in
  // it. `passwordHash` in particular used to be exported verbatim.
  const CREDENTIAL_FIELDS = ['passwordHash', 'password', 'salt', 'email'];

  it('redacts every credential field from participant records', async () => {
    const db = makeDb({
      participants: [
        {
          userId: 'user-1',
          username: 'p-user-1',
          passwordHash: '$2b$12$realbcrypthashthatmustnotleak',
          password: 'plaintext-should-never-exist-but-redact-anyway',
          salt: 'somesalt',
          email: 'participant@example.invalid',
        },
      ],
    });

    const bundle = await exportStudyData({ db, id: STUDY_ID.toString() });
    const [p] = bundle.collections.participants;

    for (const field of CREDENTIAL_FIELDS) {
      assert.equal(p[field], '[redacted]', `${field} must be redacted`);
    }
  });

  it('does not leak credential values anywhere in the serialised bundle', async () => {
    const secret = '$2b$12$averydistinctivebcrypthashvalue';
    const db = makeDb({
      participants: [{ userId: 'user-1', passwordHash: secret }],
    });

    const bundle = await exportStudyData({ db, id: STUDY_ID.toString() });

    // Serialise the whole thing — catches the value resurfacing through some
    // other collection or a future code path, not just the field we stripped.
    assert.equal(
      JSON.stringify(bundle).includes(secret),
      false,
      'bcrypt hash must not appear anywhere in the export bundle'
    );
  });

  it('still replaces tokenCardPdf with a placeholder', async () => {
    const db = makeDb({
      participants: [{ userId: 'user-1', tokenCardPdf: 'BINARY' }],
    });
    const bundle = await exportStudyData({ db, id: STUDY_ID.toString() });
    assert.equal(
      bundle.collections.participants[0].tokenCardPdf,
      '[binary omitted]'
    );
  });

  it('leaves non-credential fields intact', async () => {
    const db = makeDb({
      participants: [
        { userId: 'user-1', username: 'p-user-1', surveyCompletionPct: 42 },
      ],
    });
    const bundle = await exportStudyData({ db, id: STUDY_ID.toString() });
    const [p] = bundle.collections.participants;
    assert.equal(p.username, 'p-user-1');
    assert.equal(p.surveyCompletionPct, 42);
  });

  it('returns null for an unparseable study id', async () => {
    assert.equal(
      await exportStudyData({ db: makeDb(), id: 'not-an-oid' }),
      null
    );
  });
});
