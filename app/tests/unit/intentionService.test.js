import { test } from 'node:test';
import assert from 'node:assert';
import { ObjectId } from 'mongodb';
import {
  createIntention,
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

test('createIntention: persists and serializes recommendation lineage', async () => {
  const db = makeDb();
  const recommendationId = 'f81d4fae-7dec-4f01-a765-00a0c91e6bf6';
  const result = await createIntention({
    db,
    userId: 'u1',
    behaviorKey: 'walking',
    behaviorLabel: 'Walking',
    durationMinutes: 20,
    cues: [{ text: 'After dinner', cueId: null, source: 'self_selected' }],
    intentionStatement: 'After dinner, I will walk.',
    sourceRecommendationId: recommendationId,
    cueConfig: { maxHabits: null },
  });

  assert.equal(result.sourceRecommendationId, recommendationId);
});

test('createIntention: defaults recommendation lineage to null', async () => {
  const db = makeDb();
  const result = await createIntention({
    db,
    userId: 'u1',
    behaviorKey: 'walking',
    behaviorLabel: 'Walking',
    durationMinutes: 20,
    cues: [{ text: 'After dinner', cueId: null, source: 'self_selected' }],
    intentionStatement: 'After dinner, I will walk.',
    cueConfig: { maxHabits: null },
  });

  assert.equal(result.sourceRecommendationId, null);
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

test('createIntention: persists habitType and defaults creationMode/stackedOn (§7.4/§7.1)', async () => {
  const db = makeDb();
  const result = await createIntention({
    db,
    userId: 'u1',
    behaviorKey: 'smoking',
    behaviorLabel: 'Stop smoking',
    durationMinutes: 5,
    cues: [{ text: 'After lunch', cueId: null, source: 'self_selected' }],
    intentionStatement: 'After lunch, I will chew gum instead of smoking.',
    habitType: 'quit',
    cueConfig: { maxHabits: null },
  });
  assert.equal(result.habitType, 'quit');
  assert.equal(result.creationMode, 'standalone');
  assert.equal(result.stackedOn, null);
  assert.deepEqual(result.earnedBadges, []);
});

test('createIntention: normalises unknown habitType to build', async () => {
  const db = makeDb();
  const result = await createIntention({
    db,
    userId: 'u1',
    behaviorKey: 'walking',
    behaviorLabel: 'Walking',
    durationMinutes: 20,
    cues: [],
    intentionStatement: '',
    habitType: 'nonsense',
    cueConfig: { maxHabits: null },
  });
  assert.equal(result.habitType, 'build');
});

test('createIntention: records stacking metadata (§7.1)', async () => {
  const anchorId = new ObjectId();
  const db = makeDb();
  const result = await createIntention({
    db,
    userId: 'u1',
    behaviorKey: 'flossing',
    behaviorLabel: 'Flossing',
    durationMinutes: 2,
    cues: [{ text: 'After brushing', cueId: null, source: 'self_selected' }],
    intentionStatement: 'After I brush my teeth, I will floss.',
    habitType: 'build',
    stackedOn: anchorId.toString(),
    creationMode: 'stacked',
    cueConfig: { maxHabits: null },
  });
  assert.equal(result.creationMode, 'stacked');
  assert.equal(result.stackedOn, anchorId.toString());
});

test('createIntention: persists anchorLabel and allows empty cues when stacked (§7.1)', async () => {
  const db = makeDb();
  const result = await createIntention({
    db,
    userId: 'u1',
    behaviorKey: 'flossing',
    behaviorLabel: 'Flossing',
    durationMinutes: 2,
    cues: [],
    intentionStatement: 'After I brush my teeth, I will floss.',
    habitType: 'build',
    anchorLabel: 'Brush my teeth',
    creationMode: 'stacked',
    cueConfig: { maxHabits: null },
  });
  assert.equal(result.creationMode, 'stacked');
  assert.equal(result.anchorLabel, 'Brush my teeth');
  assert.deepEqual(result.cues, []);
});

test('createIntention: skips the §7.3 information-overload guard for a stacked habit', async () => {
  const anchorId = new ObjectId();
  // Deliberately the plain implementation_intentions-only mock (see makeDb
  // above) — checkOverloadGuard needs srhi_responses/daily_behavior_logs/
  // admin_settings too, so if the guard were NOT skipped for a stacked
  // creation, this mock's `assert.equal(name, 'implementation_intentions')`
  // would throw the moment checkOverloadGuard asked for another collection,
  // failing this test.
  const db = makeDb();
  const result = await createIntention({
    db,
    userId: 'u1',
    behaviorKey: 'flossing',
    behaviorLabel: 'Flossing',
    durationMinutes: 2,
    cues: [{ text: 'After brushing', cueId: null, source: 'self_selected' }],
    intentionStatement: 'After I brush my teeth, I will floss.',
    habitType: 'build',
    stackedOn: anchorId.toString(),
    creationMode: 'stacked',
    cueConfig: { maxHabits: null },
    overload: { enabled: true, unlockTier: 'weekly' },
  });
  assert.equal(result.limitReached, undefined);
  assert.equal(result.creationMode, 'stacked');
});

test('createIntention: enforces the §7.3 information-overload guard for a standalone habit', async () => {
  // Same mock as above, deliberately missing srhi_responses/etc — a
  // standalone creation *should* reach checkOverloadGuard and hit that
  // gap and throw, proving the guard isn't skipped unconditionally (only
  // for stacked creations, per the test above).
  const db = makeDb();
  await assert.rejects(
    createIntention({
      db,
      userId: 'u1',
      behaviorKey: 'yoga',
      behaviorLabel: 'Yoga',
      durationMinutes: 20,
      cues: [],
      intentionStatement: '',
      creationMode: 'standalone',
      cueConfig: { maxHabits: null },
      overload: { enabled: true, unlockTier: 'weekly' },
    })
  );
});

test('createIntention: anchorLabel defaults to null and trims whitespace', async () => {
  const db = makeDb();
  const withoutAnchor = await createIntention({
    db,
    userId: 'u1',
    behaviorKey: 'walking',
    behaviorLabel: 'Walking',
    durationMinutes: 20,
    cues: [{ text: 'After lunch', cueId: null, source: 'self_selected' }],
    intentionStatement: 'After lunch, I will walk.',
    cueConfig: { maxHabits: null },
  });
  assert.equal(withoutAnchor.anchorLabel, null);

  const withWhitespaceAnchor = await createIntention({
    db,
    userId: 'u1',
    behaviorKey: 'walking2',
    behaviorLabel: 'Walking',
    durationMinutes: 20,
    cues: [],
    intentionStatement: 'After lunch, I will walk.',
    anchorLabel: '  Lunch break  ',
    creationMode: 'stacked',
    cueConfig: { maxHabits: null },
  });
  assert.equal(withWhitespaceAnchor.anchorLabel, 'Lunch break');
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
