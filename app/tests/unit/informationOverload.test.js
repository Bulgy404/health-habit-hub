import { test } from 'node:test';
import assert from 'node:assert';
import { ObjectId } from 'mongodb';
import { checkOverloadGuard } from '../../services/intentionService.js';

const NOW = new Date('2026-06-10T12:00:00Z');

/** Enacted logs for the N days before NOW (yesterday backwards). */
function logsForDays(intentionId, userId, days) {
  const logs = [];
  for (let i = 1; i <= days; i++) {
    const d = new Date(NOW);
    d.setDate(d.getDate() - i);
    logs.push({
      intentionId,
      userId,
      date: d.toISOString().slice(0, 10),
      enacted: true,
    });
  }
  return logs;
}

/**
 * Minimal db mock backing checkOverloadGuard: implementation_intentions,
 * srhi_responses, daily_behavior_logs, admin_settings.
 */
function makeDb({ intentions = [], srhi = [], logs = [] }) {
  const filterMatch = (doc, filter) => {
    for (const [k, v] of Object.entries(filter)) {
      if (v instanceof ObjectId || doc[k] instanceof ObjectId) {
        if (String(doc[k]) !== String(v)) return false;
      } else if (doc[k] !== v) {
        return false;
      }
    }
    return true;
  };
  const collection = (store) => ({
    find(filter = {}) {
      let results = store.filter((d) => filterMatch(d, filter));
      return {
        sort() {
          return this;
        },
        async toArray() {
          return results.map((d) => ({ ...d }));
        },
      };
    },
    async findOne() {
      return null;
    },
  });
  return {
    collection(name) {
      switch (name) {
        case 'implementation_intentions':
          return collection(intentions);
        case 'srhi_responses':
          return collection(srhi);
        case 'daily_behavior_logs':
          return collection(logs);
        case 'admin_settings':
          return { find: () => ({ toArray: async () => [] }) };
        default:
          throw new Error(`unexpected collection: ${name}`);
      }
    },
  };
}

test('checkOverloadGuard: allows the first habit of a type', async () => {
  const db = makeDb({ intentions: [] });
  const result = await checkOverloadGuard({
    db,
    userId: 'u1',
    habitType: 'build',
    overload: { unlockTier: 'weekly' },
    now: NOW,
  });
  assert.equal(result.limitReached, false);
});

test('checkOverloadGuard: blocks a second habit while the first is not automatic', async () => {
  const id = new ObjectId();
  const db = makeDb({
    intentions: [
      {
        _id: id,
        userId: 'u1',
        habitType: 'build',
        status: 'active',
        createdAt: NOW,
        reminderTime: '19:00',
        cues: [],
      },
    ],
    // No SRHI, no logs → daily tier, below the 'weekly' unlock threshold.
    srhi: [],
    logs: [],
  });
  const result = await checkOverloadGuard({
    db,
    userId: 'u1',
    habitType: 'build',
    overload: { unlockTier: 'weekly' },
    now: NOW,
  });
  assert.equal(result.limitReached, true);
  assert.equal(result.unlockTier, 'weekly');
  assert.equal(result.currentTier, 'daily');
});

test('checkOverloadGuard: unlocks a second slot once the first reaches the tier', async () => {
  const id = new ObjectId();
  const db = makeDb({
    intentions: [
      {
        _id: id,
        userId: 'u1',
        habitType: 'build',
        status: 'active',
        createdAt: new Date('2026-05-01T00:00:00Z'),
        reminderTime: '19:00',
        cues: [],
      },
    ],
    // Two strong SRHI weeks + 14 days adherence → fades to weekly/off.
    srhi: [
      { intentionId: id, userId: 'u1', weekNumber: 2, score: 6.8 },
      { intentionId: id, userId: 'u1', weekNumber: 1, score: 6.5 },
    ],
    logs: logsForDays(id, 'u1', 14),
  });
  const result = await checkOverloadGuard({
    db,
    userId: 'u1',
    habitType: 'build',
    overload: { unlockTier: 'weekly' },
    now: NOW,
  });
  assert.equal(result.limitReached, false);
});

test('checkOverloadGuard: unlockTier "off" is a hard cap of 1 per type', async () => {
  const id = new ObjectId();
  const db = makeDb({
    intentions: [
      {
        _id: id,
        userId: 'u1',
        habitType: 'quit',
        status: 'active',
        createdAt: new Date('2026-05-01T00:00:00Z'),
        reminderTime: '19:00',
        cues: [],
      },
    ],
    srhi: [
      { intentionId: id, userId: 'u1', weekNumber: 2, score: 7 },
      { intentionId: id, userId: 'u1', weekNumber: 1, score: 7 },
    ],
    logs: logsForDays(id, 'u1', 14),
  });
  const result = await checkOverloadGuard({
    db,
    userId: 'u1',
    habitType: 'quit',
    overload: { unlockTier: 'off' },
    now: NOW,
  });
  // Even a fully automatic habit never opens a new slot when unlockTier='off'.
  assert.equal(result.limitReached, true);
});

test('checkOverloadGuard: build and quit caps are independent', async () => {
  const buildId = new ObjectId();
  const db = makeDb({
    intentions: [
      {
        _id: buildId,
        userId: 'u1',
        habitType: 'build',
        status: 'active',
        createdAt: NOW,
        reminderTime: '19:00',
        cues: [],
      },
    ],
  });
  // A build habit exists, but the quit cap is untouched → first quit allowed.
  const result = await checkOverloadGuard({
    db,
    userId: 'u1',
    habitType: 'quit',
    overload: { unlockTier: 'weekly' },
    now: NOW,
  });
  assert.equal(result.limitReached, false);
});
