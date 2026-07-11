import { test } from 'node:test';
import assert from 'node:assert';

import {
  listStudies,
  createStudy,
  getStudy,
  updateStudy,
  softDeleteStudy,
  setDefaultStudy,
  updateGroupCueConfig,
  listStudyParticipants,
} from '../../services/studyService.js';

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
      } else if (typeof v === 'object' && v !== null && '$exists' in v) {
        // not used here
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
            project() {
              return this;
            },
          };
        },
        findOne(filter = {}) {
          return Promise.resolve(
            s.find((doc) => matchFilter(doc, filter))
              ? { ...s.find((doc) => matchFilter(doc, filter)) }
              : null
          );
        },
        async countDocuments(filter = {}) {
          return s.filter((doc) => matchFilter(doc, filter)).length;
        },
        async insertOne(doc) {
          s.push({ ...doc });
          return { insertedId: doc._id };
        },
        async updateOne(filter, update) {
          const idx = s.findIndex((doc) => matchFilter(doc, filter));
          if (idx === -1) return { matchedCount: 0 };
          if (update.$set) Object.assign(s[idx], update.$set);
          return { matchedCount: 1 };
        },
        async updateMany(filter, update) {
          let count = 0;
          for (const doc of s) {
            if (matchFilter(doc, filter)) {
              if (update.$set) Object.assign(doc, update.$set);
              count++;
            }
          }
          return { matchedCount: count };
        },
        async deleteOne(filter) {
          const idx = s.findIndex((doc) => matchFilter(doc, filter));
          if (idx === -1) return { deletedCount: 0 };
          s.splice(idx, 1);
          return { deletedCount: 1 };
        },
        aggregate(pipeline) {
          // Simple $match + $group support
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

// ── listStudies ───────────────────────────────────────────────────────────────

test('listStudies returns empty result when no studies exist', async () => {
  const db = makeDb();
  const result = await listStudies({ db });
  assert.equal(result.total, 0);
  assert.deepStrictEqual(result.studies, []);
});

test('listStudies includes participantCount', async () => {
  const { ObjectId } = await import('../../models/survey.js');
  const studyId = new ObjectId();
  const db = makeDb({
    studies: [
      {
        _id: studyId,
        name: 'Study A',
        description: null,
        isDefault: true,
        isActive: true,
        groups: [],
        questionnaires: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ],
    enrollments: [
      {
        _id: new ObjectId(),
        userId: 'u1',
        studyId,
        groupId: new ObjectId(),
        enrolledAt: new Date(),
      },
      {
        _id: new ObjectId(),
        userId: 'u2',
        studyId,
        groupId: new ObjectId(),
        enrolledAt: new Date(),
      },
    ],
  });
  const result = await listStudies({ db });
  assert.equal(result.total, 1);
  assert.equal(result.studies[0].participantCount, 2);
});

// ── createStudy ───────────────────────────────────────────────────────────────

test('createStudy inserts a study with correct defaults', async () => {
  const db = makeDb();
  const study = await createStudy({
    db,
    name: 'Test Study',
    groups: [{ label: 'Group A' }, { label: 'Group B' }],
  });
  assert.equal(study.name, 'Test Study');
  assert.equal(study.isDefault, false);
  assert.equal(study.isActive, true);
  assert.equal(study.groups.length, 2);
  assert.equal(study.groups[0].label, 'Group A');
  assert.equal(study.groups[0].index, 1);
  assert.equal(study.groups[1].index, 2);
  // Structured activities default off — new studies start as free-text entry.
  assert.equal(study.habitEntryMode, 'freeText');
  assert.deepEqual(study.structuredActivityKeys, []);
});

test('createStudy persists a structured habitEntryMode and its activity keys', async () => {
  const db = makeDb();
  const study = await createStudy({
    db,
    name: 'Structured Study',
    groups: [{ label: 'Group A' }],
    habitEntryMode: 'structured',
    structuredActivityKeys: ['walking', 'yoga'],
  });
  assert.equal(study.habitEntryMode, 'structured');
  assert.deepEqual(study.structuredActivityKeys, ['walking', 'yoga']);
});

// ── getStudy ──────────────────────────────────────────────────────────────────

test('getStudy returns null for invalid id', async () => {
  const db = makeDb();
  const result = await getStudy({ db, id: 'not-an-objectid' });
  assert.strictEqual(result, null);
});

test('getStudy returns null when study does not exist', async () => {
  const { ObjectId } = await import('../../models/survey.js');
  const db = makeDb();
  const result = await getStudy({ db, id: new ObjectId().toString() });
  assert.strictEqual(result, null);
});

test('getStudy returns study when it exists', async () => {
  const { ObjectId } = await import('../../models/survey.js');
  const id = new ObjectId();
  const db = makeDb({
    studies: [
      {
        _id: id,
        name: 'My Study',
        description: 'desc',
        isDefault: false,
        isActive: true,
        groups: [],
        questionnaires: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ],
  });
  const result = await getStudy({ db, id: id.toString() });
  assert.equal(result.name, 'My Study');
  assert.equal(result.id, id.toString());
});

// ── updateStudy ───────────────────────────────────────────────────────────────

test('updateStudy returns notFound for unknown id', async () => {
  const { ObjectId } = await import('../../models/survey.js');
  const db = makeDb();
  const result = await updateStudy({
    db,
    id: new ObjectId().toString(),
    updates: { name: 'x' },
  });
  assert.equal(result.notFound, true);
});

test('updateStudy: sets habitEntryMode and structuredActivityKeys', async () => {
  const { ObjectId } = await import('../../models/survey.js');
  const id = new ObjectId();
  const db = makeDb({
    studies: [
      {
        _id: id,
        name: 'S',
        description: null,
        isDefault: false,
        isActive: true,
        habitEntryMode: 'freeText',
        structuredActivityKeys: [],
        groups: [],
        questionnaires: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ],
  });
  const result = await updateStudy({
    db,
    id: id.toString(),
    updates: {
      habitEntryMode: 'structured',
      structuredActivityKeys: ['walking', 'meditation'],
    },
  });
  assert.equal(result.updated, true);
  const updated = await getStudy({ db, id: id.toString() });
  assert.equal(updated.habitEntryMode, 'structured');
  assert.deepEqual(updated.structuredActivityKeys, ['walking', 'meditation']);
});

test('updateStudy: groups matched by id are kept (config preserved) and new ones without an id are added', async () => {
  const { ObjectId } = await import('../../models/survey.js');
  const id = new ObjectId();
  const existingGroup = {
    id: new ObjectId(),
    label: 'Group 1',
    index: 1,
    cueConfig: { cueCount: 'single' },
  };
  const db = makeDb({
    studies: [
      {
        _id: id,
        name: 'S',
        description: null,
        isDefault: false,
        isActive: true,
        groups: [existingGroup],
        questionnaires: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ],
  });
  const result = await updateStudy({
    db,
    id: id.toString(),
    updates: {
      groups: [
        { id: existingGroup.id.toString(), label: 'Group 1' },
        { label: 'Group 2' },
      ],
    },
  });
  assert.equal(result.updated, true);
  const updated = await getStudy({ db, id: id.toString() });
  assert.equal(updated.groups.length, 2);
  // The matched group keeps its id and existing config, not just its label.
  assert.equal(updated.groups[0].id, existingGroup.id.toString());
  assert.deepEqual(updated.groups[0].cueConfig, { cueCount: 'single' });
  assert.equal(updated.groups[1].label, 'Group 2');
});

test('updateStudy: dropping a group id reassigns its enrollments and codes to the first remaining group', async () => {
  const { ObjectId } = await import('../../models/survey.js');
  const studyId = new ObjectId();
  const keptGroup = { id: new ObjectId(), label: 'Group 1', index: 1 };
  const removedGroup = { id: new ObjectId(), label: 'Group 2', index: 2 };
  const db = makeDb({
    studies: [
      {
        _id: studyId,
        name: 'S',
        description: null,
        isDefault: true,
        isActive: true,
        groups: [keptGroup, removedGroup],
        questionnaires: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ],
    enrollments: [
      {
        _id: new ObjectId(),
        userId: 'u1',
        studyId,
        groupId: removedGroup.id,
        enrolledAt: new Date(),
      },
      {
        _id: new ObjectId(),
        userId: 'u2',
        studyId,
        groupId: keptGroup.id,
        enrolledAt: new Date(),
      },
    ],
    studyCodes: [
      {
        _id: new ObjectId(),
        code: 'HHH-AAAAA',
        studyId,
        groupId: removedGroup.id,
        redemptionCount: 0,
        createdAt: new Date(),
      },
    ],
  });

  const result = await updateStudy({
    db,
    id: studyId.toString(),
    updates: { groups: [{ id: keptGroup.id.toString(), label: 'Group 1' }] },
  });
  assert.equal(result.updated, true);

  const updated = await getStudy({ db, id: studyId.toString() });
  assert.equal(updated.groups.length, 1);
  assert.equal(updated.groups[0].id, keptGroup.id.toString());

  const enrollments = await db.collection('enrollments').find({}).toArray();
  assert.ok(
    enrollments.every((e) => e.groupId.toString() === keptGroup.id.toString())
  );

  const codes = await db.collection('studyCodes').find({}).toArray();
  assert.equal(codes[0].groupId.toString(), keptGroup.id.toString());
});

test('updateStudy: reassigning a questionnaire assignment onto a group that already has the same questionnaire drops the duplicate instead of colliding', async () => {
  const { ObjectId } = await import('../../models/survey.js');
  const studyId = new ObjectId();
  const keptGroup = { id: new ObjectId(), label: 'Group 1', index: 1 };
  const removedGroup = { id: new ObjectId(), label: 'Group 2', index: 2 };
  const questionnaireId = new ObjectId();
  const db = makeDb({
    studies: [
      {
        _id: studyId,
        name: 'S',
        description: null,
        isDefault: false,
        isActive: true,
        groups: [keptGroup, removedGroup],
        questionnaires: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ],
    questionnaire_assignments: [
      { _id: new ObjectId(), studyId, groupId: keptGroup.id, questionnaireId },
      {
        _id: new ObjectId(),
        studyId,
        groupId: removedGroup.id,
        questionnaireId,
      },
    ],
  });

  await updateStudy({
    db,
    id: studyId.toString(),
    updates: { groups: [{ id: keptGroup.id.toString(), label: 'Group 1' }] },
  });

  const assignments = await db
    .collection('questionnaire_assignments')
    .find({})
    .toArray();
  assert.equal(assignments.length, 1);
  assert.equal(assignments[0].groupId.toString(), keptGroup.id.toString());
});

// ── softDeleteStudy ───────────────────────────────────────────────────────────

test('softDeleteStudy returns conflict when study has enrollments', async () => {
  const { ObjectId } = await import('../../models/survey.js');
  const id = new ObjectId();
  const db = makeDb({
    studies: [
      {
        _id: id,
        name: 'S',
        isDefault: false,
        isActive: true,
        groups: [],
        questionnaires: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ],
  });
  // Enrollment lives in Neo4j now; return count > 0 to trigger the conflict.
  const neo4jRun = async (cypher) => {
    if (cypher.includes('count(*) AS n')) return [{ n: 1 }];
    return [];
  };
  const result = await softDeleteStudy({ db, id: id.toString(), neo4jRun });
  assert.equal(result.conflict, true);
});

test('softDeleteStudy succeeds when no enrollments', async () => {
  const { ObjectId } = await import('../../models/survey.js');
  const id = new ObjectId();
  const db = makeDb({
    studies: [
      {
        _id: id,
        name: 'S',
        isDefault: false,
        isActive: true,
        groups: [],
        questionnaires: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ],
  });
  const result = await softDeleteStudy({ db, id: id.toString() });
  assert.equal(result.deleted, true);
});

test('softDeleteStudy returns isDefault when study is the default', async () => {
  const { ObjectId } = await import('../../models/survey.js');
  const id = new ObjectId();
  const db = makeDb({
    studies: [
      {
        _id: id,
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
  const result = await softDeleteStudy({ db, id: id.toString() });
  assert.equal(result.isDefault, true);
});

// ── setDefaultStudy ───────────────────────────────────────────────────────────

// ── updateGroupCueConfig ──────────────────────────────────────────────────────

test('updateGroupCueConfig: sets cueConfig on a specific group', async () => {
  const { ObjectId } = await import('mongodb');
  const studyId = new ObjectId();
  const groupId = new ObjectId();
  const db = makeDb({
    studies: [
      {
        _id: studyId,
        name: 'CuB Study',
        isDefault: false,
        isActive: true,
        groups: [{ id: groupId, label: 'C3', index: 1, cueConfig: null }],
        questionnaires: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ],
  });
  const cueConfig = {
    cueCount: 'single',
    cueSource: 'high_quality',
    cuePoolId: null,
    maxHabits: 1,
  };
  const result = await updateGroupCueConfig({
    db,
    studyId: studyId.toString(),
    groupId: groupId.toString(),
    cueConfig,
  });
  assert.equal(result.updated, true);
});

test('updateGroupCueConfig: returns notFound for missing study', async () => {
  const { ObjectId } = await import('mongodb');
  const db = makeDb({ studies: [] });
  const result = await updateGroupCueConfig({
    db,
    studyId: new ObjectId().toString(),
    groupId: new ObjectId().toString(),
    cueConfig: {
      cueCount: 'single',
      cueSource: 'high_quality',
      cuePoolId: null,
      maxHabits: null,
    },
  });
  assert.equal(result.notFound, true);
});

test('setDefaultStudy marks a study as default', async () => {
  const { ObjectId } = await import('../../models/survey.js');
  const id1 = new ObjectId();
  const id2 = new ObjectId();
  const db = makeDb({
    studies: [
      {
        _id: id1,
        name: 'S1',
        isDefault: true,
        isActive: true,
        groups: [],
        questionnaires: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        _id: id2,
        name: 'S2',
        isDefault: false,
        isActive: true,
        groups: [],
        questionnaires: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ],
  });
  const result = await setDefaultStudy({ db, id: id2.toString() });
  assert.equal(result.updated, true);
  const s2 = await getStudy({ db, id: id2.toString() });
  assert.equal(s2.isDefault, true);
});

// ── listStudyParticipants ────────────────────────────────────────────────────

test('listStudyParticipants returns notFound for unknown id', async () => {
  const db = makeDb();
  const result = await listStudyParticipants({
    db,
    id: 'not-an-object-id',
    neo4jRun: async () => [],
  });
  assert.equal(result.notFound, true);
});

test('listStudyParticipants returns only participants in the given group', async () => {
  const { ObjectId } = await import('../../models/survey.js');
  const groupAId = new ObjectId().toString();
  const groupBId = new ObjectId().toString();
  const studyId = new ObjectId();
  const db = makeDb({
    studies: [
      {
        _id: studyId,
        name: 'Grouped Study',
        isDefault: false,
        isActive: true,
        groups: [
          { id: groupAId, label: 'Group A', index: 0 },
          { id: groupBId, label: 'Group B', index: 1 },
        ],
        questionnaires: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ],
    participants: [
      { userId: 'u1', username: 'p-u1' },
      { userId: 'u2', username: 'p-u2' },
      { userId: 'u3', username: 'p-u3' },
    ],
  });
  const enrolled = [
    {
      userId: 'u1',
      groupId: groupAId,
      enrolledAt: new Date(),
      studyCodeUsed: null,
    },
    {
      userId: 'u2',
      groupId: groupBId,
      enrolledAt: new Date(),
      studyCodeUsed: null,
    },
    {
      userId: 'u3',
      groupId: groupAId,
      enrolledAt: new Date(),
      studyCodeUsed: null,
    },
  ];
  const neo4jRun = async () => enrolled;

  const all = await listStudyParticipants({
    db,
    id: studyId.toString(),
    neo4jRun,
  });
  assert.equal(all.total, 3);
  assert.equal(all.participants.length, 3);
  // Per-group summary always reflects the whole study, unfiltered.
  assert.equal(
    all.summary.perGroup.find((g) => g.groupId === groupAId).count,
    2
  );

  const groupAOnly = await listStudyParticipants({
    db,
    id: studyId.toString(),
    groupId: groupAId,
    neo4jRun,
  });
  assert.equal(groupAOnly.total, 2);
  assert.deepEqual(groupAOnly.participants.map((p) => p.userId).sort(), [
    'u1',
    'u3',
  ]);
  assert.ok(groupAOnly.participants.every((p) => p.groupId === groupAId));
  assert.deepEqual(groupAOnly.participants.map((p) => p.username).sort(), [
    'p-u1',
    'p-u3',
  ]);

  const groupBOnly = await listStudyParticipants({
    db,
    id: studyId.toString(),
    groupId: groupBId,
    neo4jRun,
  });
  assert.equal(groupBOnly.total, 1);
  assert.equal(groupBOnly.participants[0].userId, 'u2');
});

test('listStudyParticipants groupId filter interacts correctly with pagination', async () => {
  const { ObjectId } = await import('../../models/survey.js');
  const groupAId = new ObjectId().toString();
  const studyId = new ObjectId();
  const db = makeDb({
    studies: [
      {
        _id: studyId,
        name: 'Big Study',
        isDefault: false,
        isActive: true,
        groups: [{ id: groupAId, label: 'Group A', index: 0 }],
        questionnaires: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ],
  });
  const enrolled = [
    {
      userId: 'a',
      groupId: groupAId,
      enrolledAt: new Date(),
      studyCodeUsed: null,
    },
    {
      userId: 'b',
      groupId: 'other-group',
      enrolledAt: new Date(),
      studyCodeUsed: null,
    },
    {
      userId: 'c',
      groupId: groupAId,
      enrolledAt: new Date(),
      studyCodeUsed: null,
    },
  ];
  const result = await listStudyParticipants({
    db,
    id: studyId.toString(),
    groupId: groupAId,
    page: 1,
    limit: 1,
    neo4jRun: async () => enrolled,
  });
  // total reflects the filtered set (2), not the unfiltered study (3), and
  // the page-1/limit-1 slice comes from within that filtered set.
  assert.equal(result.total, 2);
  assert.equal(result.participants.length, 1);
  assert.equal(result.participants[0].userId, 'a');
});
