// app/tests/unit/studyAnalyticsService.test.js
import { test } from 'node:test';
import assert from 'node:assert';
import { getWeeklyActiveRate, getMeanSrhiTrajectory, getDropoutCurve } from '../../services/studyAnalyticsService.js';
import { ObjectId } from 'mongodb';

const studyId = new ObjectId();
const groupA = new ObjectId();
const groupB = new ObjectId();

function makeDb({ enrollments = [], logs = [], srhi = [] } = {}) {
  return {
    collection(name) {
      if (name === 'enrollments') return {
        find: (q) => ({ toArray: async () => enrollments.filter(e => e.studyId?.toString() === q.studyId?.toString()) }),
      };
      if (name === 'daily_behavior_logs') return {
        aggregate: (pipeline) => {
          const match = pipeline.find(s => s.$match)?.$match ?? {};
          const userIds = match.userId?.$in ?? [];
          const cutoff = match.date?.$gte;
          const filtered = logs.filter(l =>
            userIds.includes(l.userId) && (!cutoff || l.date >= cutoff)
          );
          const byUser = {};
          for (const l of filtered) { byUser[l.userId] = (byUser[l.userId] ?? 0) + 1; }
          return { toArray: async () => Object.entries(byUser).map(([userId]) => ({ _id: userId })) };
        },
      };
      if (name === 'srhi_responses') return {
        aggregate: (pipeline) => {
          const match = pipeline.find(s => s.$match)?.$match ?? {};
          const filtered = srhi.filter(s =>
            (!match.studyId || s.studyId?.toString() === match.studyId?.toString()) &&
            s.submittedAt != null && s.score != null
          );
          const groups = {};
          for (const s of filtered) {
            const key = `${s.groupId}_${s.weekNumber}`;
            groups[key] = groups[key] ?? { groupId: s.groupId, weekNumber: s.weekNumber, scores: [] };
            groups[key].scores.push(s.score);
          }
          return { toArray: async () => Object.values(groups).map(g => ({
            _id: { groupId: g.groupId, weekNumber: g.weekNumber },
            meanScore: g.scores.reduce((a, b) => a + b, 0) / g.scores.length,
            count: g.scores.length,
          })) };
        },
      };
      throw new Error(`unexpected: ${name}`);
    },
  };
}

test('getWeeklyActiveRate: returns per-group active rate', async () => {
  const today = new Date().toISOString().split('T')[0];
  const db = makeDb({
    enrollments: [
      { userId: 'u1', studyId, groupId: groupA },
      { userId: 'u2', studyId, groupId: groupA },
      { userId: 'u3', studyId, groupId: groupB },
    ],
    logs: [{ userId: 'u1', date: today, enacted: true }],
  });
  const result = await getWeeklyActiveRate({ db, studyId: studyId.toString() });
  const a = result.find(r => r.groupId === groupA.toString());
  const b = result.find(r => r.groupId === groupB.toString());
  assert.ok(a, 'groupA result exists');
  assert.equal(a.enrolled, 2);
  assert.equal(a.active, 1);
  assert.equal(a.rate, 0.5);
  assert.equal(b.active, 0);
  assert.equal(b.rate, 0);
});

test('getMeanSrhiTrajectory: returns mean score per group per week', async () => {
  const db = makeDb({
    enrollments: [],
    srhi: [
      { studyId, groupId: groupA, weekNumber: 1, score: 4, submittedAt: new Date() },
      { studyId, groupId: groupA, weekNumber: 1, score: 6, submittedAt: new Date() },
      { studyId, groupId: groupB, weekNumber: 1, score: 3, submittedAt: new Date() },
    ],
  });
  const result = await getMeanSrhiTrajectory({ db, studyId: studyId.toString() });
  const aW1 = result.find(r => r.groupId === groupA.toString() && r.weekNumber === 1);
  const bW1 = result.find(r => r.groupId === groupB.toString() && r.weekNumber === 1);
  assert.ok(aW1);
  assert.equal(aW1.meanScore, 5);
  assert.equal(bW1.meanScore, 3);
});

test('getDropoutCurve: returns cumulative dropouts per group by date', async () => {
  // Note: getDropoutCurve uses find() not aggregate(), so the mock's find() returns filtered enrollments
  const dbWithDropouts = {
    collection(name) {
      if (name === 'enrollments') return {
        find: (q) => ({
          toArray: async () => [
            { userId: 'u1', studyId, groupId: groupA, droppedOutAt: new Date('2026-01-10') },
            { userId: 'u2', studyId, groupId: groupA, droppedOutAt: new Date('2026-01-15') },
            { userId: 'u3', studyId, groupId: groupB, droppedOutAt: null },
          ].filter(e => {
            if (q.studyId && e.studyId?.toString() !== q.studyId?.toString()) return false;
            if (q.droppedOutAt?.$ne !== undefined && e.droppedOutAt === null) return false;
            return true;
          }),
        }),
      };
      throw new Error(`unexpected: ${name}`);
    },
  };
  const result = await getDropoutCurve({ db: dbWithDropouts, studyId: studyId.toString() });
  const aDropouts = result.filter(r => r.groupId === groupA.toString());
  assert.equal(aDropouts.length, 2);
  assert.ok(aDropouts.every(r => r.date && r.cumulative > 0));
  // Verify cumulative ordering
  assert.equal(aDropouts[0].cumulative, 1);
  assert.equal(aDropouts[1].cumulative, 2);
});
