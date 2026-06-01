import { test } from 'node:test';
import assert from 'node:assert';
import { ObjectId } from 'mongodb';
import {
  createIntention,
  listIntentions,
  updateIntentionStatus,
} from '../../services/intentionService.js';

function makeDb(intentions = []) {
  const store = intentions.map((d) => ({ ...d }));
  return {
    collection(name) {
      assert.equal(name, 'implementation_intentions');
      return {
        async countDocuments(filter) {
          return store.filter((d) => {
            for (const [k, v] of Object.entries(filter)) {
              if (d[k]?.toString() !== v?.toString()) return false;
            }
            return true;
          }).length;
        },
        find(filter = {}) {
          const results = store.filter((d) => {
            for (const [k, v] of Object.entries(filter)) {
              if (d[k]?.toString() !== v?.toString()) return false;
            }
            return true;
          });
          return {
            async toArray() {
              return results.map((d) => ({ ...d }));
            },
          };
        },
        async insertOne(doc) {
          const saved = { ...doc, _id: new ObjectId() };
          store.push(saved);
          return { insertedId: saved._id };
        },
        async findOneAndUpdate(filter, update, opts) {
          const idx = store.findIndex(
            (d) =>
              d._id?.toString() === filter._id?.toString() &&
              d.userId === filter.userId
          );
          if (idx === -1) return null;
          const before =
            opts?.returnDocument === 'before' ? { ...store[idx] } : null;
          if (update.$set) Object.assign(store[idx], update.$set);
          return opts?.returnDocument === 'before' ? before : { ...store[idx] };
        },
      };
    },
  };
}

test('createIntention: creates with status active', async () => {
  const db = makeDb();
  const result = await createIntention({
    db,
    userId: 'u1',
    behaviorKey: 'walking',
    behaviorLabel: 'Walking',
    durationMinutes: 20,
    cues: [{ text: 'After dinner', cueId: null, source: 'self_selected' }],
    intentionStatement: 'After dinner, I will go for a 20-min walk.',
    cueConfig: { maxHabits: null },
  });
  assert.equal(result.status, 'active');
  assert.equal(result.userId, 'u1');
  assert.ok(result.id);
});

test('createIntention: enforces maxHabits=1', async () => {
  const existing = {
    _id: new ObjectId(),
    userId: 'u1',
    status: 'active',
    behaviorKey: 'walking',
    behaviorLabel: 'Walking',
    durationMinutes: 20,
    cues: [],
    intentionStatement: '',
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  const db = makeDb([existing]);
  const result = await createIntention({
    db,
    userId: 'u1',
    behaviorKey: 'yoga',
    behaviorLabel: 'Yoga',
    durationMinutes: 20,
    cues: [],
    intentionStatement: '',
    cueConfig: { maxHabits: 1 },
  });
  assert.equal(result.limitReached, true);
});

test('createIntention: maxHabits=null allows multiple', async () => {
  const existing = {
    _id: new ObjectId(),
    userId: 'u1',
    status: 'active',
    behaviorKey: 'walking',
    behaviorLabel: 'Walking',
    durationMinutes: 20,
    cues: [],
    intentionStatement: '',
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  const db = makeDb([existing]);
  const result = await createIntention({
    db,
    userId: 'u1',
    behaviorKey: 'yoga',
    behaviorLabel: 'Yoga',
    durationMinutes: 20,
    cues: [],
    intentionStatement: '',
    cueConfig: { maxHabits: null },
  });
  assert.equal(result.status, 'active');
});

test('updateIntentionStatus: sets new status', async () => {
  const id = new ObjectId();
  const db = makeDb([
    {
      _id: id,
      userId: 'u1',
      status: 'active',
      behaviorKey: 'walking',
      behaviorLabel: 'Walking',
      durationMinutes: 20,
      cues: [],
      intentionStatement: '',
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ]);
  const result = await updateIntentionStatus({
    db,
    id: id.toString(),
    userId: 'u1',
    status: 'abandoned',
  });
  assert.equal(result.updated, true);
});
