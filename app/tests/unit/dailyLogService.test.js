import { test } from 'node:test';
import assert from 'node:assert';
import { ObjectId } from 'mongodb';
import { upsertLog } from '../../services/dailyLogService.js';

function makeDb() {
  const logs = [];
  const enrollments = [];
  return {
    collection(name) {
      if (name === 'daily_behavior_logs')
        return {
          async findOneAndUpdate(filter, update, opts) {
            const key = `${filter.intentionId}|${filter.date}`;
            const idx = logs.findIndex(
              (d) => `${d.intentionId}|${d.date}` === key
            );
            if (idx === -1) {
              if (opts?.upsert) {
                const doc = {
                  ...update.$setOnInsert,
                  ...update.$set,
                  _id: new ObjectId(),
                };
                logs.push(doc);
                return null;
              }
              return null;
            }
            if (update.$set) Object.assign(logs[idx], update.$set);
            return opts?.returnDocument === 'after' ? { ...logs[idx] } : null;
          },
          find(filter = {}) {
            const results = logs.filter(
              (d) =>
                d.intentionId?.toString() === filter.intentionId?.toString()
            );
            return {
              async toArray() {
                return results;
              },
            };
          },
        };
      if (name === 'enrollments')
        return {
          async updateOne(filter, update) {
            const idx = enrollments.findIndex(
              (e) => e.userId === filter.userId
            );
            if (idx >= 0) Object.assign(enrollments[idx], update.$set);
          },
        };
      throw new Error(`unexpected collection: ${name}`);
    },
  };
}

test('upsertLog: inserts on first call', async () => {
  const db = makeDb();
  const intentionId = new ObjectId();
  await upsertLog({
    db,
    intentionId: intentionId.toString(),
    userId: 'u1',
    date: '2026-06-01',
    enacted: true,
  });
  const logs = await db
    .collection('daily_behavior_logs')
    .find({ intentionId })
    .toArray();
  assert.equal(logs.length, 1);
  assert.equal(logs[0].enacted, true);
});

test('upsertLog: updates on duplicate date', async () => {
  const db = makeDb();
  const intentionId = new ObjectId();
  await upsertLog({
    db,
    intentionId: intentionId.toString(),
    userId: 'u1',
    date: '2026-06-01',
    enacted: true,
  });
  await upsertLog({
    db,
    intentionId: intentionId.toString(),
    userId: 'u1',
    date: '2026-06-01',
    enacted: false,
  });
  const logs = await db
    .collection('daily_behavior_logs')
    .find({ intentionId })
    .toArray();
  assert.equal(logs.length, 1);
  assert.equal(logs[0].enacted, false);
});
