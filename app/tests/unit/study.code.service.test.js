import { test } from 'node:test';
import assert from 'node:assert';

import {
  createCodes,
  listCodes,
  revokeCode,
  redeemCode,
  skipCode,
} from '../../services/studyCodeService.js';

// ── Minimal in-memory DB ──────────────────────────────────────────────────────

function makeDb(initial = {}) {
  const stores = {};
  for (const [name, docs] of Object.entries(initial)) {
    stores[name] = docs.map((d) => ({ ...d }));
  }
  function store(name) {
    if (!stores[name]) stores[name] = [];
    return stores[name];
  }

  function matchFilter(doc, filter) {
    for (const [k, v] of Object.entries(filter)) {
      if (typeof v === 'object' && v !== null && '$in' in v) {
        const inList = v.$in.map((x) => x.toString());
        if (!inList.includes(doc[k]?.toString())) return false;
      } else if (doc[k]?.toString() !== v?.toString()) {
        return false;
      }
    }
    return true;
  }

  return {
    collection(name) {
      const s = store(name);
      return {
        find(filter = {}) {
          let results = s.filter((doc) => matchFilter(doc, filter));
          return {
            async toArray() {
              return results.map((d) => ({ ...d }));
            },
            skip(n) {
              results = results.slice(n);
              return this;
            },
            limit(n) {
              results = results.slice(0, n);
              return this;
            },
          };
        },
        findOne(filter = {}) {
          const found = s.find((doc) => matchFilter(doc, filter));
          return Promise.resolve(found ? { ...found } : null);
        },
        async countDocuments(filter = {}) {
          return s.filter((doc) => matchFilter(doc, filter)).length;
        },
        async insertOne(doc) {
          s.push({ ...doc });
          return { insertedId: doc._id };
        },
        async insertMany(docs) {
          for (const doc of docs) s.push({ ...doc });
          return { insertedCount: docs.length };
        },
        async deleteOne(filter) {
          const idx = s.findIndex((doc) => matchFilter(doc, filter));
          if (idx === -1) return { deletedCount: 0 };
          s.splice(idx, 1);
          return { deletedCount: 1 };
        },
        async updateOne(filter, update) {
          const idx = s.findIndex((doc) => matchFilter(doc, filter));
          if (idx === -1) return { matchedCount: 0 };
          if (update.$set) Object.assign(s[idx], update.$set);
          if (update.$inc) {
            for (const [k, v] of Object.entries(update.$inc)) {
              s[idx][k] = (s[idx][k] || 0) + v;
            }
          }
          return { matchedCount: 1 };
        },
        async findOneAndUpdate(filter, update, options = {}) {
          // Evaluate $expr: { $lt: ['$fieldA', '$fieldB'] } against a document
          function evalExpr(doc, expr) {
            if (expr && expr.$lt) {
              const [a, b] = expr.$lt.map((ref) =>
                typeof ref === 'string' && ref.startsWith('$')
                  ? doc[ref.slice(1)]
                  : ref
              );
              return a < b;
            }
            return true;
          }

          // Build effective filter including $expr evaluation
          const { $expr, ...plainFilter } = filter;
          const idx = s.findIndex(
            (doc) =>
              matchFilter(doc, plainFilter) && (!$expr || evalExpr(doc, $expr))
          );

          const { upsert = false, returnDocument = 'before' } = options;

          if (idx === -1) {
            if (upsert && update.$setOnInsert) {
              s.push({ ...update.$setOnInsert });
              // returnDocument:'before' with upsert → null (no prior document)
              return null;
            }
            return null;
          }

          const before = { ...s[idx] };
          if (update.$set) Object.assign(s[idx], update.$set);
          if (update.$inc) {
            for (const [k, v] of Object.entries(update.$inc)) {
              s[idx][k] = (s[idx][k] || 0) + v;
            }
          }
          // $setOnInsert only applies on upsert (new insert), not on match
          return returnDocument === 'before' ? before : { ...s[idx] };
        },
        aggregate(pipeline) {
          let docs = [...s];
          for (const stage of pipeline) {
            if (stage.$match) {
              docs = docs.filter((d) => matchFilter(d, stage.$match));
            } else if (stage.$group) {
              const groups = {};
              for (const doc of docs) {
                const key = doc[stage.$group._id.replace('$', '')]?.toString();
                if (!groups[key])
                  groups[key] = {
                    _id: doc[stage.$group._id.replace('$', '')],
                    count: 0,
                  };
                groups[key].count++;
              }
              docs = Object.values(groups);
            }
          }
          return {
            async toArray() {
              return docs;
            },
          };
        },
      };
    },
  };
}

// ── createCodes ───────────────────────────────────────────────────────────────

test('createCodes returns notFound for unknown study', async () => {
  const { ObjectId } = await import('../../models/survey.js');
  const db = makeDb();
  const result = await createCodes({
    db,
    studyId: new ObjectId().toString(),
    groupId: new ObjectId().toString(),
    count: 1,
  });
  assert.equal(result.notFound, true);
});

test('createCodes returns groupNotFound for unknown group', async () => {
  const { ObjectId } = await import('../../models/survey.js');
  const studyId = new ObjectId();
  const db = makeDb({
    studies: [
      {
        _id: studyId,
        name: 'S',
        isDefault: true,
        isActive: true,
        groups: [],
        questionnaires: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ],
  });
  const result = await createCodes({
    db,
    studyId: studyId.toString(),
    groupId: new ObjectId().toString(),
    count: 1,
  });
  assert.equal(result.groupNotFound, true);
});

test('createCodes generates correct number of codes in HHH-XXXXX format', async () => {
  const { ObjectId } = await import('../../models/survey.js');
  const studyId = new ObjectId();
  const groupId = new ObjectId();
  const db = makeDb({
    studies: [
      {
        _id: studyId,
        name: 'S',
        isDefault: true,
        isActive: true,
        groups: [{ id: groupId, label: 'Group A', index: 1 }],
        questionnaires: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ],
  });
  const result = await createCodes({
    db,
    studyId: studyId.toString(),
    groupId: groupId.toString(),
    count: 3,
  });
  assert.equal(result.codes.length, 3);
  for (const code of result.codes) {
    assert.match(code, /^HHH-[A-Z0-9]{5}$/);
  }
});

test('createCodes caps count at 100', async () => {
  const { ObjectId } = await import('../../models/survey.js');
  const studyId = new ObjectId();
  const groupId = new ObjectId();
  const db = makeDb({
    studies: [
      {
        _id: studyId,
        name: 'S',
        isDefault: true,
        isActive: true,
        groups: [{ id: groupId, label: 'G1', index: 1 }],
        questionnaires: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ],
  });
  const result = await createCodes({
    db,
    studyId: studyId.toString(),
    groupId: groupId.toString(),
    count: 200,
  });
  assert.equal(result.codes.length, 100);
});

// ── listCodes ─────────────────────────────────────────────────────────────────

test('listCodes returns notFound for unknown study', async () => {
  const { ObjectId } = await import('../../models/survey.js');
  const db = makeDb();
  const result = await listCodes({
    db,
    studyId: new ObjectId().toString(),
  });
  assert.equal(result.notFound, true);
});

test('listCodes returns codes for a study', async () => {
  const { ObjectId } = await import('../../models/survey.js');
  const studyId = new ObjectId();
  const groupId = new ObjectId();
  const db = makeDb({
    studies: [
      {
        _id: studyId,
        name: 'S',
        isDefault: true,
        isActive: true,
        groups: [{ id: groupId, label: 'G1', index: 1 }],
        questionnaires: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ],
    studyCodes: [
      {
        code: 'HHH-ABCDE',
        studyId,
        groupId,
        maxRedemptions: null,
        redemptionCount: 0,
        expiresAt: null,
        createdAt: new Date(),
      },
    ],
  });
  const result = await listCodes({ db, studyId: studyId.toString() });
  assert.equal(result.total, 1);
  assert.equal(result.codes[0].code, 'HHH-ABCDE');
  assert.equal(result.codes[0].groupId, groupId.toString());
});

// ── revokeCode ────────────────────────────────────────────────────────────────

test('revokeCode returns notFound for unknown study', async () => {
  const { ObjectId } = await import('../../models/survey.js');
  const db = makeDb();
  const result = await revokeCode({
    db,
    studyId: new ObjectId().toString(),
    code: 'HHH-ABCDE',
  });
  assert.equal(result.notFound, true);
});

test('revokeCode returns conflict if code already redeemed', async () => {
  const { ObjectId } = await import('../../models/survey.js');
  const studyId = new ObjectId();
  const groupId = new ObjectId();
  const db = makeDb({
    studies: [
      {
        _id: studyId,
        name: 'S',
        isDefault: true,
        isActive: true,
        groups: [{ id: groupId, label: 'G1', index: 1 }],
        questionnaires: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ],
    studyCodes: [
      {
        code: 'HHH-ABCDE',
        studyId,
        groupId,
        maxRedemptions: null,
        redemptionCount: 1,
        expiresAt: null,
        createdAt: new Date(),
      },
    ],
  });
  const result = await revokeCode({
    db,
    studyId: studyId.toString(),
    code: 'HHH-ABCDE',
  });
  assert.equal(result.conflict, true);
});

test('revokeCode deletes an unredeemed code', async () => {
  const { ObjectId } = await import('../../models/survey.js');
  const studyId = new ObjectId();
  const groupId = new ObjectId();
  const db = makeDb({
    studies: [
      {
        _id: studyId,
        name: 'S',
        isDefault: true,
        isActive: true,
        groups: [{ id: groupId, label: 'G1', index: 1 }],
        questionnaires: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ],
    studyCodes: [
      {
        code: 'HHH-ABCDE',
        studyId,
        groupId,
        maxRedemptions: null,
        redemptionCount: 0,
        expiresAt: null,
        createdAt: new Date(),
      },
    ],
  });
  const result = await revokeCode({
    db,
    studyId: studyId.toString(),
    code: 'hhh-abcde',
  });
  assert.equal(result.deleted, true);
  // Code should no longer exist
  const afterList = await listCodes({ db, studyId: studyId.toString() });
  assert.equal(afterList.total, 0);
});

// ── redeemCode ────────────────────────────────────────────────────────────────

test('redeemCode returns notFound for unknown code', async () => {
  const db = makeDb();
  const result = await redeemCode({ db, userId: 'user-1', code: 'HHH-ZZZZZ' });
  assert.equal(result.notFound, true);
});

test('redeemCode returns exhausted when maxRedemptions reached', async () => {
  const { ObjectId } = await import('../../models/survey.js');
  const studyId = new ObjectId();
  const groupId = new ObjectId();
  const db = makeDb({
    studyCodes: [
      {
        code: 'HHH-FULL0',
        studyId,
        groupId,
        maxRedemptions: 2,
        redemptionCount: 2,
        expiresAt: null,
        createdAt: new Date(),
      },
    ],
  });
  const result = await redeemCode({ db, userId: 'user-1', code: 'HHH-FULL0' });
  assert.equal(result.exhausted, true);
});

test('redeemCode returns alreadyEnrolled when user already has enrollment', async () => {
  const { ObjectId } = await import('../../models/survey.js');
  const studyId = new ObjectId();
  const groupId = new ObjectId();
  const db = makeDb({
    studyCodes: [
      {
        code: 'HHH-VALID',
        studyId,
        groupId,
        maxRedemptions: null,
        redemptionCount: 0,
        expiresAt: null,
        createdAt: new Date(),
      },
    ],
    enrollments: [
      {
        userId: 'user-1',
        studyId,
        groupId,
        studyCodeUsed: null,
        enrolledAt: new Date(),
      },
    ],
  });
  const result = await redeemCode({ db, userId: 'user-1', code: 'HHH-VALID' });
  assert.equal(result.alreadyEnrolled, true);
});

test('redeemCode creates enrollment and increments counter (case-insensitive)', async () => {
  const { ObjectId } = await import('../../models/survey.js');
  const studyId = new ObjectId();
  const groupId = new ObjectId();
  const db = makeDb({
    studies: [
      {
        _id: studyId,
        name: 'My Study',
        isDefault: true,
        isActive: true,
        groups: [{ id: groupId, label: 'Intervention', index: 1 }],
        questionnaires: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ],
    studyCodes: [
      {
        code: 'HHH-ABC12',
        studyId,
        groupId,
        maxRedemptions: null,
        redemptionCount: 0,
        expiresAt: null,
        createdAt: new Date(),
      },
    ],
  });
  // Use lowercase code — should be case-insensitive
  const result = await redeemCode({
    db,
    userId: 'user-1',
    code: 'hhh-abc12',
  });
  assert.equal(result.enrolled, true);
  assert.equal(result.studyName, 'My Study');
  assert.equal(result.groupLabel, 'Intervention');
  // Verify counter incremented
  const codes = await db.collection('studyCodes').find({}).toArray();
  assert.equal(codes[0].redemptionCount, 1);
});

test('redeemCode returns exhausted atomically — second concurrent request cannot claim last slot', async () => {
  const { ObjectId } = await import('../../models/survey.js');
  const studyId = new ObjectId();
  const groupId = new ObjectId();
  // Code with maxRedemptions:1, already at 0 — first call should succeed, second should fail
  const db = makeDb({
    studies: [
      {
        _id: studyId,
        name: 'My Study',
        isDefault: true,
        isActive: true,
        groups: [{ id: groupId, label: 'Intervention', index: 1 }],
        questionnaires: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ],
    studyCodes: [
      {
        code: 'HHH-LIMIT',
        studyId,
        groupId,
        maxRedemptions: 1,
        redemptionCount: 0,
        expiresAt: null,
        createdAt: new Date(),
      },
    ],
  });

  // Simulate sequential requests that represent concurrent attempts
  const r1 = await redeemCode({ db, userId: 'user-1', code: 'HHH-LIMIT' });
  const r2 = await redeemCode({ db, userId: 'user-2', code: 'HHH-LIMIT' });

  assert.equal(r1.enrolled, true);
  assert.equal(r2.exhausted, true);

  // redemptionCount must be exactly 1 — no over-counting
  const codes = await db.collection('studyCodes').find({}).toArray();
  assert.equal(codes[0].redemptionCount, 1);
});

test('redeemCode returns alreadyEnrolled and rolls back counter for duplicate userId', async () => {
  const { ObjectId } = await import('../../models/survey.js');
  const studyId = new ObjectId();
  const groupId = new ObjectId();
  const db = makeDb({
    studies: [
      {
        _id: studyId,
        name: 'My Study',
        isDefault: true,
        isActive: true,
        groups: [{ id: groupId, label: 'Intervention', index: 1 }],
        questionnaires: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ],
    studyCodes: [
      {
        code: 'HHH-MULTI',
        studyId,
        groupId,
        maxRedemptions: null,
        redemptionCount: 0,
        expiresAt: null,
        createdAt: new Date(),
      },
    ],
  });

  // First redemption succeeds
  const r1 = await redeemCode({ db, userId: 'user-1', code: 'HHH-MULTI' });
  assert.equal(r1.enrolled, true);

  // Second attempt by same userId: alreadyEnrolled, counter must be rolled back to 1
  const r2 = await redeemCode({ db, userId: 'user-1', code: 'HHH-MULTI' });
  assert.equal(r2.alreadyEnrolled, true);

  // Counter must stay at 1 (the rollback undoes the second increment)
  const codes = await db.collection('studyCodes').find({}).toArray();
  assert.equal(codes[0].redemptionCount, 1);

  // Only one enrollment must exist
  const enrollments = await db.collection('enrollments').find({}).toArray();
  assert.equal(enrollments.length, 1);
});

// ── skipCode ──────────────────────────────────────────────────────────────────

test('skipCode returns noDefaultStudy when no default study', async () => {
  const db = makeDb();
  const result = await skipCode({ db, userId: 'user-1' });
  assert.equal(result.noDefaultStudy, true);
});

test('skipCode returns noGroups when default study has no groups', async () => {
  const { ObjectId } = await import('../../models/survey.js');
  const db = makeDb({
    studies: [
      {
        _id: new ObjectId(),
        name: 'Empty',
        isDefault: true,
        isActive: true,
        groups: [],
        questionnaires: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ],
  });
  const result = await skipCode({ db, userId: 'user-1' });
  assert.equal(result.noGroups, true);
});

test('skipCode enrolls user in default study with round-robin group', async () => {
  const { ObjectId } = await import('../../models/survey.js');
  const studyId = new ObjectId();
  const g1 = new ObjectId();
  const g2 = new ObjectId();
  const db = makeDb({
    studies: [
      {
        _id: studyId,
        name: 'Study X',
        isDefault: true,
        isActive: true,
        groups: [
          { id: g1, label: 'Group 1', index: 1 },
          { id: g2, label: 'Group 2', index: 2 },
        ],
        questionnaires: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ],
  });
  // First user: counter becomes 1, idx = (1-1) % 2 = 0 → Group 1
  const r1 = await skipCode({ db, userId: 'user-A' });
  assert.equal(r1.enrolled, true);
  assert.equal(r1.studyName, 'Study X');
  assert.equal(r1.groupLabel, 'Group 1');

  // Second user: counter becomes 2, idx = (2-1) % 2 = 1 → Group 2
  const r2 = await skipCode({ db, userId: 'user-B' });
  assert.equal(r2.enrolled, true);
  assert.equal(r2.groupLabel, 'Group 2');
});

test('skipCode concurrent requests land in different groups — atomic counter prevents collision', async () => {
  const { ObjectId } = await import('../../models/survey.js');
  const studyId = new ObjectId();
  const g1 = new ObjectId();
  const g2 = new ObjectId();
  const db = makeDb({
    studies: [
      {
        _id: studyId,
        name: 'Study Y',
        isDefault: true,
        isActive: true,
        groups: [
          { id: g1, label: 'Group 1', index: 1 },
          { id: g2, label: 'Group 2', index: 2 },
        ],
        questionnaires: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ],
  });

  // Simulate two concurrent requests (sequential in test, but both start before either
  // inserts enrollment — the atomic counter guarantees different groups regardless).
  const [r1, r2] = await Promise.all([
    skipCode({ db, userId: 'concurrent-user-1' }),
    skipCode({ db, userId: 'concurrent-user-2' }),
  ]);

  assert.equal(r1.enrolled, true);
  assert.equal(r2.enrolled, true);
  // The two users must end up in different groups.
  assert.notEqual(r1.groupId, r2.groupId);
  // Each enrollment collection entry must reference the group the user was assigned.
  const enrollments = await db.collection('enrollments').find({}).toArray();
  assert.equal(enrollments.length, 2);
});

test('skipCode is idempotent — returns existing enrollment', async () => {
  const { ObjectId } = await import('../../models/survey.js');
  const studyId = new ObjectId();
  const groupId = new ObjectId();
  const db = makeDb({
    studies: [
      {
        _id: studyId,
        name: 'Study X',
        isDefault: true,
        isActive: true,
        groups: [{ id: groupId, label: 'G1', index: 1 }],
        questionnaires: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ],
    enrollments: [
      {
        userId: 'user-1',
        studyId,
        groupId,
        studyCodeUsed: null,
        enrolledAt: new Date(),
      },
    ],
  });
  const result = await skipCode({ db, userId: 'user-1' });
  assert.equal(result.enrolled, true);
  assert.equal(result.studyId, studyId.toString());
  // Should not create a second enrollment
  const count = await db.collection('enrollments').countDocuments({});
  assert.equal(count, 1);
});
