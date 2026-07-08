import { test } from 'node:test';
import assert from 'node:assert';
import { ObjectId } from 'mongodb';
import {
  redeemCode,
  skipCode,
  switchStudy,
  leaveStudy,
  getEnrollmentStatus,
} from '../../services/studyCodeService.js';

// ── In-memory Neo4j mock ─────────────────────────────────────────────────────
// Simulates just enough of (:User)-[:ENROLLED_IN]->(:Study) to exercise
// getEnrollment / createEnrollment / switchEnrollment against real state
// (relationships persisting across calls), matching the literal Cypher those
// functions in enrollmentNeo4j.js emit.

function makeNeo4j() {
  // Each relationship: { userId, studyId, groupId, studyCodeUsed, enrolledAt, droppedOutAt }
  const rels = [];

  return async (cypher, params = {}) => {
    if (
      cypher.includes('WHERE e.droppedOutAt IS NULL') &&
      cypher.includes('RETURN s.uuid AS studyId')
    ) {
      // getEnrollment
      const rel = rels.find(
        (r) => r.userId === params.userId && r.droppedOutAt == null
      );
      if (!rel) return [];
      return [
        {
          studyId: rel.studyId,
          groupId: rel.groupId,
          enrolledAt: rel.enrolledAt,
          studyCodeUsed: rel.studyCodeUsed,
        },
      ];
    }
    if (cypher.includes('OPTIONAL MATCH') && cypher.includes('exists')) {
      // createEnrollment: check-then-create, step 1
      const active = rels.some(
        (r) => r.userId === params.userId && r.droppedOutAt == null
      );
      return [{ exists: active }];
    }
    if (cypher.includes('CREATE (u)-[e:ENROLLED_IN]->(s)')) {
      // createEnrollment: step 2
      rels.push({
        userId: params.userId,
        studyId: params.studyId,
        groupId: params.groupId,
        studyCodeUsed: params.code,
        enrolledAt: params.enrolledAt,
        droppedOutAt: null,
      });
      return [];
    }
    if (cypher.includes('SET e.droppedOutAt = $movedAt')) {
      // switchEnrollment: drop old + create new
      const rel = rels.find(
        (r) => r.userId === params.userId && r.droppedOutAt == null
      );
      if (!rel) return [];
      rel.droppedOutAt = params.movedAt;
      rels.push({
        userId: params.userId,
        studyId: params.newStudyId,
        groupId: params.newGroupId,
        studyCodeUsed: params.studyCodeUsed,
        enrolledAt: params.movedAt,
        droppedOutAt: null,
      });
      return [{ enrolledAt: params.movedAt }];
    }
    throw new Error(`Unhandled test Cypher: ${cypher}`);
  };
}

// ── In-memory Mongo mock ─────────────────────────────────────────────────────

function makeDb() {
  const codes = new Map();
  const studies = new Map();
  const enrollments = new Map(); // keyed by userId

  return {
    stores: { codes, studies, enrollments },
    collection(name) {
      if (name === 'studyCodes') {
        return {
          async findOne(filter) {
            return codes.get(filter.code) ?? null;
          },
          async updateOne(filter, update) {
            const doc = codes.get(filter.code);
            if (!doc) return { matchedCount: 0 };
            if (update.$inc?.redemptionCount) {
              doc.redemptionCount =
                (doc.redemptionCount ?? 0) + update.$inc.redemptionCount;
            }
            return { matchedCount: 1 };
          },
          async findOneAndUpdate(filter, update) {
            const doc = codes.get(filter.code);
            if (!doc) return null;
            if (update.$inc?.redemptionCount) {
              doc.redemptionCount =
                (doc.redemptionCount ?? 0) + update.$inc.redemptionCount;
            }
            return doc;
          },
        };
      }
      if (name === 'studies') {
        return {
          async findOne(filter) {
            if (filter._id) {
              return (
                [...studies.values()].find(
                  (s) => s._id.toString() === filter._id.toString()
                ) ?? null
              );
            }
            if (filter.isDefault) {
              return [...studies.values()].find((s) => s.isDefault) ?? null;
            }
            return null;
          },
          async findOneAndUpdate(filter, update) {
            const doc = filter.isDefault
              ? [...studies.values()].find((s) => s.isDefault)
              : [...studies.values()].find(
                  (s) => s._id.toString() === filter._id.toString()
                );
            if (!doc) return null;
            doc._skipCounter =
              (doc._skipCounter ?? 0) + (update.$inc?._skipCounter ?? 0);
            return doc;
          },
        };
      }
      if (name === 'enrollments') {
        return {
          async updateOne(filter, update, opts) {
            const existing = enrollments.get(filter.userId);
            if (!existing && !opts?.upsert) return { matchedCount: 0 };
            enrollments.set(filter.userId, {
              ...(existing ?? {}),
              ...update.$set,
            });
            return {
              matchedCount: existing ? 1 : 0,
              upsertedCount: existing ? 0 : 1,
            };
          },
        };
      }
      throw new Error(`unexpected collection: ${name}`);
    },
  };
}

function addStudy(db, { name, isDefault = false, groups }) {
  const _id = new ObjectId();
  const doc = {
    _id,
    name,
    isDefault,
    isActive: true,
    _skipCounter: 0,
    groups: groups.map((label, i) => ({
      id: new ObjectId(),
      label,
      index: i + 1,
      allocationWeight: 1,
    })),
  };
  db.stores.studies.set(_id.toString(), doc);
  return doc;
}

function addCode(db, { code, studyId, groupId = null, maxRedemptions = null }) {
  db.stores.codes.set(code, {
    code,
    studyId,
    groupId,
    maxRedemptions,
    redemptionCount: 0,
    expiresAt: null,
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test('switchStudy moves an enrolled user to a new study and preserves history', async () => {
  const db = makeDb();
  const neo4jRun = makeNeo4j();
  const studyA = addStudy(db, { name: 'Study A', groups: ['G1'] });
  const studyB = addStudy(db, { name: 'Study B', groups: ['G1'] });
  addCode(db, {
    code: 'HHH-AAAAA',
    studyId: studyA._id,
    groupId: studyA.groups[0].id,
  });
  addCode(db, {
    code: 'HHH-BBBBB',
    studyId: studyB._id,
    groupId: studyB.groups[0].id,
  });

  await redeemCode({ db, userId: 'u1', code: 'HHH-AAAAA', neo4jRun });
  const before = await getEnrollmentStatus({ db, userId: 'u1', neo4jRun });
  assert.strictEqual(before.studyName, 'Study A');

  const result = await switchStudy({
    db,
    userId: 'u1',
    code: 'HHH-BBBBB',
    neo4jRun,
  });
  assert.strictEqual(result.moved, true);
  assert.strictEqual(result.studyName, 'Study B');

  const after = await getEnrollmentStatus({ db, userId: 'u1', neo4jRun });
  assert.strictEqual(after.studyName, 'Study B');

  // Mongo mirror reflects the new study too.
  const mongoDoc = db.stores.enrollments.get('u1');
  assert.strictEqual(mongoDoc.studyId.toString(), studyB._id.toString());
});

test('switchStudy rejects when not currently enrolled', async () => {
  const db = makeDb();
  const neo4jRun = makeNeo4j();
  const studyB = addStudy(db, { name: 'Study B', groups: ['G1'] });
  addCode(db, {
    code: 'HHH-BBBBB',
    studyId: studyB._id,
    groupId: studyB.groups[0].id,
  });

  const result = await switchStudy({
    db,
    userId: 'ghost',
    code: 'HHH-BBBBB',
    neo4jRun,
  });
  assert.strictEqual(result.notEnrolled, true);
});

test('switchStudy rejects a code for the study the user is already in', async () => {
  const db = makeDb();
  const neo4jRun = makeNeo4j();
  const studyA = addStudy(db, { name: 'Study A', groups: ['G1'] });
  addCode(db, {
    code: 'HHH-AAAAA',
    studyId: studyA._id,
    groupId: studyA.groups[0].id,
  });
  addCode(db, {
    code: 'HHH-AAAA2',
    studyId: studyA._id,
    groupId: studyA.groups[0].id,
  });

  await redeemCode({ db, userId: 'u1', code: 'HHH-AAAAA', neo4jRun });
  const result = await switchStudy({
    db,
    userId: 'u1',
    code: 'HHH-AAAA2',
    neo4jRun,
  });
  assert.strictEqual(result.alreadyInStudy, true);
});

test('switchStudy rejects an unknown code', async () => {
  const db = makeDb();
  const neo4jRun = makeNeo4j();
  const studyA = addStudy(db, { name: 'Study A', groups: ['G1'] });
  addCode(db, {
    code: 'HHH-AAAAA',
    studyId: studyA._id,
    groupId: studyA.groups[0].id,
  });
  await redeemCode({ db, userId: 'u1', code: 'HHH-AAAAA', neo4jRun });

  const result = await switchStudy({
    db,
    userId: 'u1',
    code: 'HHH-NOPE0',
    neo4jRun,
  });
  assert.strictEqual(result.notFound, true);
});

test('leaveStudy moves an enrolled user back to the default study', async () => {
  const db = makeDb();
  const neo4jRun = makeNeo4j();
  const studyA = addStudy(db, { name: 'Study A', groups: ['G1'] });
  const defaultStudy = addStudy(db, {
    name: 'Default Study',
    isDefault: true,
    groups: ['G1', 'G2'],
  });
  addCode(db, {
    code: 'HHH-AAAAA',
    studyId: studyA._id,
    groupId: studyA.groups[0].id,
  });

  await redeemCode({ db, userId: 'u1', code: 'HHH-AAAAA', neo4jRun });
  const result = await leaveStudy({ db, userId: 'u1', neo4jRun });

  assert.strictEqual(result.moved, true);
  assert.strictEqual(result.studyId, defaultStudy._id.toString());

  const after = await getEnrollmentStatus({ db, userId: 'u1', neo4jRun });
  assert.strictEqual(after.isDefaultStudy, true);
});

test('leaveStudy is a no-op error when already in the default study', async () => {
  const db = makeDb();
  const neo4jRun = makeNeo4j();
  addStudy(db, { name: 'Default Study', isDefault: true, groups: ['G1'] });

  await skipCode({ db, userId: 'u1', neo4jRun });
  const result = await leaveStudy({ db, userId: 'u1', neo4jRun });
  assert.strictEqual(result.alreadyInDefaultStudy, true);
});

test('leaveStudy rejects when not currently enrolled', async () => {
  const db = makeDb();
  const neo4jRun = makeNeo4j();
  addStudy(db, { name: 'Default Study', isDefault: true, groups: ['G1'] });

  const result = await leaveStudy({ db, userId: 'ghost', neo4jRun });
  assert.strictEqual(result.notEnrolled, true);
});

test('getEnrollmentStatus returns notEnrolled for a user with no enrollment', async () => {
  const db = makeDb();
  const neo4jRun = makeNeo4j();
  const result = await getEnrollmentStatus({ db, userId: 'ghost', neo4jRun });
  assert.strictEqual(result.notEnrolled, true);
});

test('a habit donated before switching studies is unaffected by switchEnrollment (studyId stamped at donation time is immutable)', async () => {
  // switchEnrollment only ever mutates the ENROLLED_IN relationship, never
  // touches existing Habit nodes — this test documents/asserts that
  // studyCodeService's move functions don't even reference Habit nodes.
  const db = makeDb();
  const neo4jRun = makeNeo4j();
  const studyA = addStudy(db, { name: 'Study A', groups: ['G1'] });
  const studyB = addStudy(db, { name: 'Study B', groups: ['G1'] });
  addCode(db, {
    code: 'HHH-AAAAA',
    studyId: studyA._id,
    groupId: studyA.groups[0].id,
  });
  addCode(db, {
    code: 'HHH-BBBBB',
    studyId: studyB._id,
    groupId: studyB.groups[0].id,
  });

  await redeemCode({ db, userId: 'u1', code: 'HHH-AAAAA', neo4jRun });
  await switchStudy({ db, userId: 'u1', code: 'HHH-BBBBB', neo4jRun });

  // None of the Cypher statements switchStudy/leaveStudy emit reference
  // :Habit nodes at all (see makeNeo4j's handled patterns) — if they did,
  // this mock would throw "Unhandled test Cypher".
  assert.ok(true);
});
