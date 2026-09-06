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

describe('studyExportService — verified studies', () => {
  const VERIFIED_ID = new ObjectId();

  function makeVerifiedDb({ enrollments, collections = {} } = {}) {
    const study = {
      _id: VERIFIED_ID,
      name: 'DFG Study',
      identity: { mode: 'verified', subjectCodePrefix: 'TUD-DFG01' },
    };
    return {
      collection(name) {
        return {
          async findOne() {
            return name === 'studies' ? study : null;
          },
          find() {
            return {
              async toArray() {
                if (name === 'studies') return [study];
                if (name === 'enrollments')
                  return enrollments.map((e) => ({ ...e }));
                return (collections[name] ?? []).map((d) => ({ ...d }));
              },
            };
          },
        };
      },
    };
  }

  const enrollments = [
    { userId: 'kc-sub-1', studyId: VERIFIED_ID, subjectCode: 'TUD-DFG01-0042' },
  ];

  it('drops the participants collection entirely', async () => {
    // It describes accounts, and the account is exactly what the subject code
    // stands in for — shipping both hands over the correspondence.
    const db = makeVerifiedDb({
      enrollments,
      collections: {
        participants: [{ userId: 'kc-sub-1', username: 'p-kc-sub-1' }],
      },
    });
    const bundle = await exportStudyData({ db, id: VERIFIED_ID.toString() });
    assert.deepEqual(bundle.collections.participants, []);
  });

  it('rewrites every raw Keycloak sub to the subject code', async () => {
    const db = makeVerifiedDb({
      enrollments,
      collections: {
        daily_behavior_logs: [
          { userId: 'kc-sub-1', date: '2026-01-01', enacted: true },
        ],
        srhi_responses: [{ userId: 'kc-sub-1', weekNumber: 1, score: 4 }],
      },
    });
    const bundle = await exportStudyData({ db, id: VERIFIED_ID.toString() });

    assert.equal(
      bundle.collections.daily_behavior_logs[0].userId,
      'TUD-DFG01-0042'
    );
    assert.equal(bundle.collections.srhi_responses[0].userId, 'TUD-DFG01-0042');
    assert.ok(
      !JSON.stringify(bundle).includes('kc-sub-1'),
      'no raw Keycloak sub may survive anywhere in the bundle'
    );
  });

  it('FAILS CLOSED when an enrolment has no subject code', async () => {
    // A gap in the register must never fall back to leaking the sub.
    const db = makeVerifiedDb({
      enrollments: [{ userId: 'kc-sub-9', studyId: VERIFIED_ID }],
      collections: {
        daily_behavior_logs: [{ userId: 'kc-sub-9', date: '2026-01-01' }],
      },
    });
    const bundle = await exportStudyData({ db, id: VERIFIED_ID.toString() });
    assert.equal(
      bundle.collections.daily_behavior_logs[0].userId,
      '[no-subject-code]'
    );
    assert.ok(!JSON.stringify(bundle).includes('kc-sub-9'));
  });

  it('redacts a sub that belongs to no enrolment at all', async () => {
    const db = makeVerifiedDb({
      enrollments,
      collections: { habit_donations: [{ userId: 'orphan-sub', uuid: 'h1' }] },
    });
    const bundle = await exportStudyData({ db, id: VERIFIED_ID.toString() });
    assert.equal(bundle.collections.habit_donations[0].userId, '[redacted]');
  });

  it('rewrites nested and array-shaped documents too', async () => {
    const db = makeVerifiedDb({
      enrollments,
      collections: {
        form_responses: [
          { userId: 'kc-sub-1', answers: { nested: { userId: 'kc-sub-1' } } },
        ],
      },
    });
    const bundle = await exportStudyData({ db, id: VERIFIED_ID.toString() });
    assert.ok(!JSON.stringify(bundle).includes('kc-sub-1'));
  });

  it('leaves the study configuration untouched', async () => {
    const db = makeVerifiedDb({ enrollments });
    const bundle = await exportStudyData({ db, id: VERIFIED_ID.toString() });
    assert.equal(bundle.collections.studies[0].name, 'DFG Study');
    assert.equal(bundle.collections.studies[0].identity.mode, 'verified');
  });
});
