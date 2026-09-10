import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ObjectId } from 'mongodb';
import { redeemIdentityCode } from '../../services/studyCodeService.js';

const STUDY_ID = new ObjectId();
const GROUP_ID = new ObjectId();

function makeDb({ study } = {}) {
  const enrollments = [];
  const doc = study ?? {
    _id: STUDY_ID,
    name: 'DFG Study',
    identity: { mode: 'verified', subjectCodePrefix: 'TUD-DFG01' },
    groups: [{ id: GROUP_ID, label: 'G1', index: 1, allocationWeight: 1 }],
    _skipCounter: 0,
  };
  return {
    enrollments,
    collection(name) {
      if (name === 'studies') {
        return {
          async findOne() {
            return doc;
          },
          async findOneAndUpdate() {
            return { _skipCounter: 0, ...doc };
          },
        };
      }
      if (name === 'enrollments') {
        return {
          async updateOne(filter, update) {
            enrollments.push(update.$set);
            return { acknowledged: true };
          },
        };
      }
      return {
        async findOne() {
          return null;
        },
        async updateOne() {
          return {};
        },
        find: () => ({ toArray: async () => [] }),
        async insertOne() {
          return {};
        },
        async countDocuments() {
          return 0;
        },
        async deleteMany() {
          return {};
        },
      };
    },
  };
}

/** Records what the protocol did, so the ordering can be asserted. */
function makeIdentityClient(overrides = {}) {
  const calls = [];
  return {
    calls,
    async reserve(code) {
      calls.push(['reserve', code]);
      if (overrides.reserveError) throw overrides.reserveError;
      return {
        reservationId: 'res-1',
        hhhStudyId: STUDY_ID.toString(),
        subjectCode: 'TUD-DFG01-0042',
        expiresAt: null,
      };
    },
    async confirm(args) {
      calls.push(['confirm', args]);
      if (overrides.confirmError) throw overrides.confirmError;
      return { ok: true, subjectCode: 'TUD-DFG01-0042' };
    },
    async release(id) {
      calls.push(['release', id]);
      return { released: true };
    },
  };
}

const neo4jOk = async () => ({ records: [] });

describe('redeemIdentityCode', () => {
  it('enrols and returns the subject code', async () => {
    const db = makeDb();
    const identityClient = makeIdentityClient();
    const result = await redeemIdentityCode({
      db,
      userId: 'kc-sub-1',
      code: 'HHV-4K7P2-9QX3R',
      neo4jRun: neo4jOk,
      identityClient,
    });

    assert.equal(result.enrolled, true);
    assert.equal(result.subjectCode, 'TUD-DFG01-0042');
    assert.equal(result.studyId, STUDY_ID.toString());
    assert.deepEqual(
      identityClient.calls.map((c) => c[0]),
      ['reserve', 'confirm'],
      'the happy path reserves then confirms, and never releases'
    );
  });

  it('writes subjectCode into the enrolment mirror', async () => {
    const db = makeDb();
    await redeemIdentityCode({
      db,
      userId: 'kc-sub-1',
      code: 'HHV-4K7P2-9QX3R',
      neo4jRun: neo4jOk,
      identityClient: makeIdentityClient(),
    });
    assert.equal(db.enrollments[0].subjectCode, 'TUD-DFG01-0042');
  });

  it('does NOT persist the HHV code in HHH', async () => {
    // The enrolment code is 1:1 with a subject, so storing it would create a
    // correlator between the research database and the identity register.
    const db = makeDb();
    await redeemIdentityCode({
      db,
      userId: 'kc-sub-1',
      code: 'HHV-4K7P2-9QX3R',
      neo4jRun: neo4jOk,
      identityClient: makeIdentityClient(),
    });
    assert.equal(db.enrollments[0].studyCodeUsed, null);
    assert.ok(
      !JSON.stringify(db.enrollments).includes('HHV-'),
      'no HHV code may reach the research database'
    );
  });

  it('passes the Keycloak sub to confirm, and nothing else identifying', async () => {
    const identityClient = makeIdentityClient();
    await redeemIdentityCode({
      db: makeDb(),
      userId: 'kc-sub-1',
      code: 'HHV-4K7P2-9QX3R',
      neo4jRun: neo4jOk,
      identityClient,
    });
    const confirmArgs = identityClient.calls.find((c) => c[0] === 'confirm')[1];
    assert.deepEqual(Object.keys(confirmArgs).sort(), [
      'hhhGroupId',
      'keycloakSub',
      'reservationId',
    ]);
    assert.equal(confirmArgs.keycloakSub, 'kc-sub-1');
  });

  it('surfaces study-specific consent when the study configures one', async () => {
    const db = makeDb({
      study: {
        _id: STUDY_ID,
        name: 'DFG Study',
        identity: {
          mode: 'verified',
          subjectCodePrefix: 'TUD-DFG01',
          consentDocumentSlug: 'dfg-verified',
        },
        groups: [{ id: GROUP_ID, label: 'G1', index: 1, allocationWeight: 1 }],
      },
    });
    const result = await redeemIdentityCode({
      db,
      userId: 'kc-sub-1',
      code: 'HHV-4K7P2-9QX3R',
      neo4jRun: neo4jOk,
      identityClient: makeIdentityClient(),
    });
    assert.equal(result.identityConsentRequired, true);
    assert.equal(result.identityConsentSlug, 'dfg-verified');
  });

  it('reports notFound for a code the register rejects', async () => {
    const err = new Error('nope');
    err.status = 404;
    const result = await redeemIdentityCode({
      db: makeDb(),
      userId: 'u',
      code: 'HHV-ZZZZZ-ZZZZZ',
      neo4jRun: neo4jOk,
      identityClient: makeIdentityClient({ reserveError: err }),
    });
    assert.deepEqual(result, { notFound: true });
  });

  it('reports identityUnavailable rather than failing opaquely', async () => {
    const err = new Error('down');
    err.status = 503;
    const result = await redeemIdentityCode({
      db: makeDb(),
      userId: 'u',
      code: 'HHV-4K7P2-9QX3R',
      neo4jRun: neo4jOk,
      identityClient: makeIdentityClient({ reserveError: err }),
    });
    assert.equal(result.identityUnavailable, true);
  });

  it('RELEASES the code when the participant is already enrolled', async () => {
    // createEnrollment reports an existing active ENROLLED_IN relationship.
    // Without the release, a duplicate tap would permanently burn the code.
    const identityClient = makeIdentityClient();
    const result = await redeemIdentityCode({
      db: makeDb(),
      userId: 'u',
      code: 'HHV-4K7P2-9QX3R',
      neo4jRun: async () => [{ exists: true }],
      identityClient,
    });

    assert.deepEqual(result, { alreadyEnrolled: true });
    assert.deepEqual(
      identityClient.calls.map((c) => c[0]),
      ['reserve', 'release'],
      'an already-enrolled participant must not spend the code'
    );
  });

  it('RELEASES the code when enrolment throws — the participant can retry', async () => {
    // The whole reason for three steps rather than one: a failure after
    // reserving must not burn the code and force a nurse to issue a new one.
    const identityClient = makeIdentityClient();
    const boom = new Error('neo4j exploded');
    await assert.rejects(() =>
      redeemIdentityCode({
        db: makeDb(),
        userId: 'u',
        code: 'HHV-4K7P2-9QX3R',
        neo4jRun: async () => {
          throw boom;
        },
        identityClient,
      })
    );
    assert.deepEqual(
      identityClient.calls.map((c) => c[0]),
      ['reserve', 'release'],
      'a thrown error must release the reservation'
    );
  });

  it('RELEASES the code when the study no longer exists', async () => {
    const identityClient = makeIdentityClient();
    const db = makeDb();
    db.collection = (name) =>
      name === 'studies'
        ? {
            async findOne() {
              return null;
            },
          }
        : {
            async updateOne() {
              return {};
            },
          };

    const result = await redeemIdentityCode({
      db,
      userId: 'u',
      code: 'HHV-4K7P2-9QX3R',
      neo4jRun: neo4jOk,
      identityClient,
    });
    assert.deepEqual(result, { notFound: true });
    assert.ok(identityClient.calls.some((c) => c[0] === 'release'));
  });

  it('RELEASES the code when the register returns an unusable study id', async () => {
    const identityClient = {
      ...makeIdentityClient(),
      calls: [],
      async reserve() {
        this.calls.push(['reserve']);
        return {
          reservationId: 'res-1',
          hhhStudyId: 'not-an-objectid',
          subjectCode: 'X-0001',
        };
      },
      async release(id) {
        this.calls.push(['release', id]);
        return { released: true };
      },
    };
    const result = await redeemIdentityCode({
      db: makeDb(),
      userId: 'u',
      code: 'HHV-4K7P2-9QX3R',
      neo4jRun: neo4jOk,
      identityClient,
    });
    assert.deepEqual(result, { notFound: true });
    assert.ok(identityClient.calls.some((c) => c[0] === 'release'));
  });
});
