import { test } from 'node:test';
import assert from 'node:assert';
import { ObjectId } from 'mongodb';
import {
  generateWindows,
  getDueWindows,
  submitSrhi,
  topUpSrhiWindows,
  getUpcomingSrhiQuestionnaireItems,
} from '../../services/srhiService.js';
import { SRHI_ITEM_IDS } from '../../utils/srhi.js';

function makeDb(responses = [], intentions = []) {
  const store = [...responses];
  const intentionStore = [...intentions];
  return {
    collection(name) {
      if (name === 'srhi_responses')
        return {
          find(filter = {}) {
            let results = store.filter((d) => {
              if (filter.userId && d.userId !== filter.userId) return false;
              if (filter.submittedAt === null && d.submittedAt !== null)
                return false;
              if (
                filter.scheduledFor?.$lte &&
                d.scheduledFor > filter.scheduledFor.$lte
              )
                return false;
              if (
                filter.intentionId &&
                d.intentionId?.toString() !== filter.intentionId?.toString()
              )
                return false;
              return true;
            });
            const api = {
              sort(spec) {
                const [[key, dir]] = Object.entries(spec);
                results = [...results].sort((a, b) => (a[key] - b[key]) * dir);
                return api;
              },
              limit(n) {
                results = results.slice(0, n);
                return api;
              },
              async toArray() {
                return results.map((x) => ({ ...x }));
              },
            };
            return api;
          },
          async insertMany(docs) {
            store.push(...docs);
          },
          async countDocuments(filter = {}) {
            return store.filter((d) => {
              if (filter.userId && d.userId !== filter.userId) return false;
              if (
                filter.intentionId &&
                d.intentionId?.toString() !== filter.intentionId?.toString()
              )
                return false;
              if (filter.submittedAt === null && d.submittedAt !== null)
                return false;
              return true;
            }).length;
          },
          async findOneAndUpdate(filter, update, _opts) {
            const idx = store.findIndex(
              (d) =>
                d.intentionId?.toString() === filter.intentionId?.toString() &&
                d.weekNumber === filter.weekNumber &&
                d.submittedAt === null
            );
            if (idx === -1) return null;
            Object.assign(store[idx], update.$set);
            return { ...store[idx] };
          },
        };
      if (name === 'implementation_intentions')
        return {
          async findOne(filter) {
            const doc = intentionStore.find(
              (i) => i._id.toString() === filter._id.toString()
            );
            return doc ? { ...doc } : null;
          },
          find(filter = {}) {
            const ids = (filter._id?.$in ?? []).map((id) => id.toString());
            const results = intentionStore.filter(
              (i) =>
                ids.includes(i._id.toString()) &&
                (!filter.status || i.status === filter.status)
            );
            return { toArray: async () => results.map((x) => ({ ...x })) };
          },
        };
      if (name === 'enrollments')
        return {
          async updateOne() {},
        };
      throw new Error(`unexpected: ${name}`);
    },
  };
}

test('generateWindows: creates 4 upcoming windows from createdAt', async () => {
  const db = makeDb();
  const intentionId = new ObjectId();
  const createdAt = new Date('2026-01-01T10:00:00Z');
  const windows = await generateWindows({
    db,
    intentionId: intentionId.toString(),
    userId: 'u1',
    createdAt,
    studyId: null,
    groupId: null,
  });
  assert.equal(windows.length, 4);
  assert.equal(windows[0].weekNumber, 1);
  assert.equal(windows[3].weekNumber, 4);
  assert.equal(windows[0].submittedAt, null);
  assert.equal(windows[0].score, null);
});

test('getDueWindows: returns open windows within 3-day window', async () => {
  const intentionId = new ObjectId();
  const now = new Date();
  const openWindow = {
    _id: new ObjectId(),
    intentionId,
    userId: 'u1',
    weekNumber: 1,
    scheduledFor: new Date(now - 1 * 24 * 60 * 60 * 1000), // 1 day ago
    submittedAt: null,
    score: null,
    createdAt: now,
  };
  const db = makeDb([openWindow]);
  const due = await getDueWindows({ db, userId: 'u1' });
  assert.equal(due.length, 1);
  assert.equal(due[0].weekNumber, 1);
});

test('submitSrhi: computes mean score from 12 items', async () => {
  const intentionId = new ObjectId();
  const now = new Date();
  const window = {
    _id: new ObjectId(),
    intentionId,
    userId: 'u1',
    weekNumber: 1,
    scheduledFor: now,
    submittedAt: null,
    score: null,
    studyId: null,
    groupId: null,
    items: null,
    createdAt: now,
  };
  const db = makeDb([window]);
  const items = Object.fromEntries(SRHI_ITEM_IDS.map((id) => [id, 4]));
  const result = await submitSrhi({
    db,
    intentionId: intentionId.toString(),
    userId: 'u1',
    weekNumber: 1,
    items,
  });
  assert.equal(result.score, 4);
  assert.ok(result.submittedAt);
});

test('topUpSrhiWindows: extends the buffer when the intention is still active', async () => {
  const intentionId = new ObjectId();
  const now = new Date();
  // Only 1 open window left (weeks 2-4 already submitted).
  const windows = [1, 2, 3, 4].map((weekNumber) => ({
    _id: new ObjectId(),
    intentionId,
    userId: 'u1',
    weekNumber,
    scheduledFor: new Date(
      now.getTime() + weekNumber * 7 * 24 * 60 * 60 * 1000
    ),
    submittedAt: weekNumber === 4 ? null : now,
    score: weekNumber === 4 ? null : 4,
    studyId: null,
    groupId: null,
    createdAt: now,
  }));
  const db = makeDb(windows, [
    {
      _id: intentionId,
      userId: 'u1',
      status: 'active',
      behaviorLabel: 'Walking',
    },
  ]);

  const created = await topUpSrhiWindows({
    db,
    intentionId: intentionId.toString(),
    userId: 'u1',
  });

  assert.equal(created, 3); // topped up from 1 open window to SRHI_TOPUP_CAP (4)
  const openCount = await db
    .collection('srhi_responses')
    .countDocuments({ intentionId: intentionId.toString(), submittedAt: null });
  assert.equal(openCount, 4);
});

test('topUpSrhiWindows: no-ops once the habit is no longer active', async () => {
  const intentionId = new ObjectId();
  const now = new Date();
  const windows = [
    {
      _id: new ObjectId(),
      intentionId,
      userId: 'u1',
      weekNumber: 4,
      scheduledFor: now,
      submittedAt: null,
      score: null,
      studyId: null,
      groupId: null,
      createdAt: now,
    },
  ];
  const db = makeDb(windows, [
    {
      _id: intentionId,
      userId: 'u1',
      status: 'abandoned',
      behaviorLabel: 'Walking',
    },
  ]);

  const created = await topUpSrhiWindows({
    db,
    intentionId: intentionId.toString(),
    userId: 'u1',
  });

  assert.equal(created, 0);
});

test('getUpcomingSrhiQuestionnaireItems: shapes windows like generic due questionnaires and tops up the buffer', async () => {
  const intentionId = new ObjectId();
  const now = new Date();
  const windows = [1, 2, 3, 4].map((weekNumber) => ({
    _id: new ObjectId(),
    intentionId,
    userId: 'u1',
    weekNumber,
    scheduledFor: new Date(
      now.getTime() + (weekNumber - 4) * 7 * 24 * 60 * 60 * 1000
    ),
    submittedAt: weekNumber < 4 ? now : null,
    score: weekNumber < 4 ? 4 : null,
    studyId: null,
    groupId: null,
    createdAt: now,
  }));
  const db = makeDb(windows, [
    {
      _id: intentionId,
      userId: 'u1',
      status: 'active',
      behaviorLabel: 'Walking',
    },
  ]);

  const horizon = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const items = await getUpcomingSrhiQuestionnaireItems({
    db,
    userId: 'u1',
    horizon,
  });

  assert.equal(items.length, 1);
  assert.equal(items[0].questionnaireSlug, 'srhi');
  assert.equal(items[0].intentionId, intentionId.toString());
  assert.match(items[0].questionnaireTitle, /Walking/);

  // Buffer was topped back up from 1 open window to the cap (4).
  const openCount = await db
    .collection('srhi_responses')
    .countDocuments({ intentionId: intentionId.toString(), submittedAt: null });
  assert.equal(openCount, 4);
});
