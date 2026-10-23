// app/tests/unit/studyAnalyticsService.test.js
import { test } from 'node:test';
import assert from 'node:assert';
import {
  getWeeklyActiveRate,
  getMeanSrhiTrajectory,
  getDropoutCurve,
  getCueContextShare,
} from '../../services/studyAnalyticsService.js';
import { ObjectId } from 'mongodb';

const studyId = new ObjectId();
const groupA = new ObjectId();
const groupB = new ObjectId();

function makeNeo4jRun(enrollments) {
  return async (cypher, params) => {
    if (cypher.includes('u.userID AS userId')) {
      return enrollments
        .filter((e) => e.studyId?.toString() === params.studyId)
        .map((e) => ({
          userId: e.userId,
          groupId: e.groupId?.toString() ?? null,
          enrolledAt: e.enrolledAt ?? null,
          studyCodeUsed: null,
        }));
    }
    if (cypher.includes('droppedOutAt')) {
      return enrollments
        .filter(
          (e) =>
            e.studyId?.toString() === params.studyId && e.droppedOutAt != null
        )
        .map((e) => ({
          groupId: e.groupId?.toString() ?? null,
          droppedOutAt: e.droppedOutAt,
        }));
    }
    return [];
  };
}

function makeDb({ logs = [], srhi = [] } = {}) {
  return {
    collection(name) {
      if (name === 'daily_behavior_logs')
        return {
          aggregate: (pipeline) => {
            const match = pipeline.find((s) => s.$match)?.$match ?? {};
            const userIds = match.userId?.$in ?? [];
            const cutoff = match.date?.$gte;
            const filtered = logs.filter(
              (l) => userIds.includes(l.userId) && (!cutoff || l.date >= cutoff)
            );
            const byUser = {};
            for (const l of filtered) {
              byUser[l.userId] = (byUser[l.userId] ?? 0) + 1;
            }
            return {
              toArray: async () =>
                Object.entries(byUser).map(([userId]) => ({ _id: userId })),
            };
          },
        };
      if (name === 'srhi_responses')
        return {
          aggregate: (pipeline) => {
            const match = pipeline.find((s) => s.$match)?.$match ?? {};
            const filtered = srhi.filter(
              (s) =>
                (!match.studyId ||
                  s.studyId?.toString() === match.studyId?.toString()) &&
                s.submittedAt != null &&
                s.score != null
            );
            const groups = {};
            for (const s of filtered) {
              const key = `${s.groupId}_${s.weekNumber}`;
              groups[key] = groups[key] ?? {
                groupId: s.groupId,
                weekNumber: s.weekNumber,
                scores: [],
              };
              groups[key].scores.push(s.score);
            }
            return {
              toArray: async () =>
                Object.values(groups).map((g) => ({
                  _id: { groupId: g.groupId, weekNumber: g.weekNumber },
                  meanScore:
                    g.scores.reduce((a, b) => a + b, 0) / g.scores.length,
                  count: g.scores.length,
                })),
            };
          },
        };
      throw new Error(`unexpected: ${name}`);
    },
  };
}

test('getWeeklyActiveRate: returns per-group active rate', async () => {
  const today = new Date().toISOString().split('T')[0];
  const db = makeDb({
    logs: [{ userId: 'u1', date: today, enacted: true }],
  });
  const neo4jRun = makeNeo4jRun([
    { userId: 'u1', studyId, groupId: groupA },
    { userId: 'u2', studyId, groupId: groupA },
    { userId: 'u3', studyId, groupId: groupB },
  ]);
  const result = await getWeeklyActiveRate({
    db,
    studyId: studyId.toString(),
    neo4jRun,
  });
  const a = result.find((r) => r.groupId === groupA.toString());
  const b = result.find((r) => r.groupId === groupB.toString());
  assert.ok(a, 'groupA result exists');
  assert.equal(a.enrolled, 2);
  assert.equal(a.active, 1);
  assert.equal(a.rate, 0.5);
  assert.equal(b.active, 0);
  assert.equal(b.rate, 0);
});

test('getMeanSrhiTrajectory: returns mean score per group per week', async () => {
  const db = makeDb({
    srhi: [
      {
        studyId,
        groupId: groupA,
        weekNumber: 1,
        score: 4,
        submittedAt: new Date(),
      },
      {
        studyId,
        groupId: groupA,
        weekNumber: 1,
        score: 6,
        submittedAt: new Date(),
      },
      {
        studyId,
        groupId: groupB,
        weekNumber: 1,
        score: 3,
        submittedAt: new Date(),
      },
    ],
  });
  const result = await getMeanSrhiTrajectory({
    db,
    studyId: studyId.toString(),
  });
  const aW1 = result.find(
    (r) => r.groupId === groupA.toString() && r.weekNumber === 1
  );
  const bW1 = result.find(
    (r) => r.groupId === groupB.toString() && r.weekNumber === 1
  );
  assert.ok(aW1);
  assert.equal(aW1.meanScore, 5);
  assert.equal(bW1.meanScore, 3);
});

test('getDropoutCurve: returns cumulative dropouts per group by date', async () => {
  const neo4jRun = makeNeo4jRun([
    {
      userId: 'u1',
      studyId,
      groupId: groupA,
      droppedOutAt: new Date('2026-01-10'),
    },
    {
      userId: 'u2',
      studyId,
      groupId: groupA,
      droppedOutAt: new Date('2026-01-15'),
    },
    { userId: 'u3', studyId, groupId: groupB, droppedOutAt: null },
  ]);
  const result = await getDropoutCurve({
    db: makeDb(),
    studyId: studyId.toString(),
    neo4jRun,
  });
  const aDropouts = result.filter((r) => r.groupId === groupA.toString());
  assert.equal(aDropouts.length, 2);
  assert.ok(aDropouts.every((r) => r.date && r.cumulative > 0));
  // Verify cumulative ordering
  assert.equal(aDropouts[0].cumulative, 1);
  assert.equal(aDropouts[1].cumulative, 2);
});

test('getCueContextShare: share of answered enacted logs in the planned situation, per group and habit week (#64)', async () => {
  const habitA = new ObjectId();
  const habitB = new ObjectId();
  const otherStudyHabit = new ObjectId();
  const intentions = [
    {
      _id: habitA,
      studyId,
      groupId: groupA,
      createdAt: new Date('2026-06-01T15:30:00Z'),
    },
    {
      _id: habitB,
      studyId,
      groupId: groupB,
      createdAt: new Date('2026-06-01T08:00:00Z'),
    },
    { _id: otherStudyHabit, studyId: new ObjectId(), groupId: groupA },
  ];
  const log = (intentionId, date, inCueContext, enacted = true) => ({
    intentionId,
    date,
    enacted,
    inCueContext,
  });
  const logs = [
    // habit A, week 1 (creation day is day 0, even though it was afternoon)
    log(habitA, '2026-06-01', 'yes'),
    log(habitA, '2026-06-03', 'no'),
    log(habitA, '2026-06-07', 'yes'),
    // habit A, week 2
    log(habitA, '2026-06-08', 'unsure'),
    // left out: unanswered, a miss, another study
    log(habitA, '2026-06-02', null),
    log(habitA, '2026-06-04', 'yes', false),
    log(otherStudyHabit, '2026-06-02', 'yes'),
    // habit B, week 1
    log(habitB, '2026-06-02', 'yes'),
  ];
  const db = {
    collection(name) {
      if (name === 'implementation_intentions')
        return {
          find: (q) => ({
            toArray: async () =>
              intentions.filter(
                (i) => i.studyId.toString() === q.studyId.toString()
              ),
          }),
        };
      if (name === 'daily_behavior_logs')
        return {
          find: (q) => ({
            toArray: async () => {
              const ids = q.intentionId.$in.map(String);
              return logs.filter(
                (l) =>
                  ids.includes(String(l.intentionId)) &&
                  l.enacted === q.enacted &&
                  q.inCueContext.$in.includes(l.inCueContext)
              );
            },
          }),
        };
      throw new Error(`unexpected collection ${name}`);
    },
  };

  const rows = await getCueContextShare({ db, studyId: studyId.toString() });
  const byKey = Object.fromEntries(
    rows.map((r) => [`${r.groupId}|${r.weekNumber}`, r])
  );
  assert.deepStrictEqual(byKey[`${groupA}|1`], {
    groupId: groupA.toString(),
    weekNumber: 1,
    yes: 2,
    no: 1,
    unsure: 0,
    answered: 3,
    share: 0.67,
  });
  assert.strictEqual(byKey[`${groupA}|2`].share, 0);
  assert.strictEqual(byKey[`${groupA}|2`].answered, 1);
  assert.strictEqual(byKey[`${groupB}|1`].share, 1);
  assert.strictEqual(rows.length, 3);
});

test('getCueContextShare: an invalid study id returns no rows', async () => {
  assert.deepStrictEqual(
    await getCueContextShare({ db: {}, studyId: 'not-an-id' }),
    []
  );
});
