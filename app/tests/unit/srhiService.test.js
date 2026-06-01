import { test } from 'node:test';
import assert from 'node:assert';
import { ObjectId } from 'mongodb';
import {
  generateWindows,
  getDueWindows,
  submitSrhi,
} from '../../services/srhiService.js';
import { SRHI_ITEM_IDS } from '../../utils/srhi.js';

function makeDb(responses = []) {
  const store = [...responses];
  return {
    collection(name) {
      if (name === 'srhi_responses')
        return {
          find(filter = {}) {
            const now = new Date();
            const results = store.filter((d) => {
              if (filter.userId && d.userId !== filter.userId) return false;
              if (filter.submittedAt === null && d.submittedAt !== null)
                return false;
              if (
                filter.scheduledFor?.$lte &&
                d.scheduledFor > filter.scheduledFor.$lte
              )
                return false;
              return true;
            });
            return {
              async toArray() {
                return results.map((x) => ({ ...x }));
              },
            };
          },
          async insertMany(docs) {
            store.push(...docs);
          },
          async findOneAndUpdate(filter, update, opts) {
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
