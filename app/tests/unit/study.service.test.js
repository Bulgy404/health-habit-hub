import { test } from 'node:test';
import assert from 'node:assert';

import {
  listStudies,
  createStudy,
  getStudy,
  updateStudy,
  softDeleteStudy,
  setDefaultStudy,
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

test('updateStudy appends new groups without removing existing ones', async () => {
  const { ObjectId } = await import('../../models/survey.js');
  const id = new ObjectId();
  const existingGroup = { id: new ObjectId(), label: 'Group 1', index: 1 };
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
    updates: { groups: [{ label: 'Group 2' }] },
  });
  assert.equal(result.updated, true);
  // Verify the store has 2 groups
  const updated = await getStudy({ db, id: id.toString() });
  assert.equal(updated.groups.length, 2);
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
    enrollments: [
      {
        _id: new ObjectId(),
        userId: 'u1',
        studyId: id,
        groupId: new ObjectId(),
        enrolledAt: new Date(),
      },
    ],
  });
  const result = await softDeleteStudy({ db, id: id.toString() });
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

// ── setDefaultStudy ───────────────────────────────────────────────────────────

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
