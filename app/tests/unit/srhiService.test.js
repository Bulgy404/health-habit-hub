import { test } from 'node:test';
import assert from 'node:assert';
import { ObjectId } from 'mongodb';
import {
  generateWindows,
  getDueWindows,
  submitSrhi,
  topUpSrhiWindows,
  getUpcomingSrhiQuestionnaireItems,
  daysSinceLastEnactedLog,
  getTrajectory,
} from '../../services/srhiService.js';
import { SRHI_ITEM_IDS } from '../../utils/srhi.js';
import { BADGES } from '../../services/gamificationService.js';

function makeDb(responses = [], intentions = [], logsByIntention = {}) {
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
            if (!doc) return null;
            if (filter.userId && doc.userId !== filter.userId) return null;
            return { ...doc };
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
          async updateOne(filter, update) {
            const doc = intentionStore.find(
              (i) => i._id.toString() === filter._id.toString()
            );
            if (doc) {
              Object.assign(doc, update.$set);
              if (update.$push?.earnedBadges) {
                doc.earnedBadges = [
                  ...(doc.earnedBadges ?? []),
                  update.$push.earnedBadges,
                ];
              }
            }
            return { matchedCount: doc ? 1 : 0 };
          },
        };
      if (name === 'daily_behavior_logs')
        return {
          find(filter = {}) {
            const arr = logsByIntention[String(filter.intentionId)] ?? [];
            return { toArray: async () => arr.map((x) => ({ ...x })) };
          },
        };
      if (name === 'admin_settings')
        return { find: () => ({ toArray: async () => [] }) };
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
  const db = makeDb(
    [openWindow],
    [{ _id: intentionId, userId: 'u1', status: 'active' }]
  );
  const due = await getDueWindows({ db, userId: 'u1' });
  assert.equal(due.length, 1);
  assert.equal(due[0].weekNumber, 1);
});

test('getDueWindows: excludes a window whose habit is no longer active', async () => {
  const activeId = new ObjectId();
  const abandonedId = new ObjectId();
  const now = new Date();
  const windowFor = (intentionId, weekNumber) => ({
    _id: new ObjectId(),
    intentionId,
    userId: 'u1',
    weekNumber,
    scheduledFor: new Date(now - 1 * 24 * 60 * 60 * 1000), // 1 day ago
    submittedAt: null,
    score: null,
    createdAt: now,
  });
  const db = makeDb(
    [windowFor(activeId, 1), windowFor(abandonedId, 3)],
    [
      { _id: activeId, userId: 'u1', status: 'active' },
      // Already had windows generated before it was abandoned — those
      // shouldn't keep showing as due once the habit is no longer active.
      { _id: abandonedId, userId: 'u1', status: 'abandoned' },
    ]
  );
  const due = await getDueWindows({ db, userId: 'u1' });
  assert.equal(due.length, 1);
  assert.equal(due[0].intentionId, activeId.toString());
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

// ── Automaticity-graduation flow ────────────────────────────────────────────

function itemsForScore(score) {
  return Object.fromEntries(SRHI_ITEM_IDS.map((id) => [id, score]));
}

function daysAgoIso(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

test('daysSinceLastEnactedLog: Infinity when there are no enacted logs', () => {
  assert.equal(daysSinceLastEnactedLog([], new Date()), Infinity);
  assert.equal(
    daysSinceLastEnactedLog(
      [{ date: '2026-01-01', enacted: false }],
      new Date()
    ),
    Infinity
  );
});

test('daysSinceLastEnactedLog: counts from the most recent enacted date', () => {
  const now = new Date('2026-06-10T12:00:00Z');
  const logs = [
    { date: '2026-06-01', enacted: true },
    { date: '2026-06-03', enacted: true },
    { date: '2026-06-02', enacted: false },
  ];
  assert.equal(daysSinceLastEnactedLog(logs, now), 7);
});

test('getTrajectory: replays autonomyScore per submitted week, null for unsubmitted', async () => {
  const intentionId = new ObjectId();
  const week1SubmittedAt = new Date(daysAgoIso(20));
  const week2SubmittedAt = new Date(daysAgoIso(5));
  const windows = [
    {
      _id: new ObjectId(),
      intentionId,
      userId: 'u1',
      weekNumber: 1,
      scheduledFor: week1SubmittedAt,
      submittedAt: week1SubmittedAt,
      score: 3, // weak habit strength early on
      createdAt: week1SubmittedAt,
    },
    {
      _id: new ObjectId(),
      intentionId,
      userId: 'u1',
      weekNumber: 2,
      scheduledFor: week2SubmittedAt,
      submittedAt: week2SubmittedAt,
      score: 7, // strong habit strength later
      createdAt: week2SubmittedAt,
    },
    {
      _id: new ObjectId(),
      intentionId,
      userId: 'u1',
      weekNumber: 3,
      scheduledFor: new Date(),
      submittedAt: null,
      score: null,
      createdAt: new Date(),
    },
  ];
  // A solid run of enacted logs leading up to week 2 (but not week 1), so
  // adherence/streak — and therefore autonomyScore — should be higher by
  // week 2 than week 1.
  const logs = [10, 9, 8, 7, 6, 5, 4, 3, 2, 1].map((n) => ({
    date: daysAgoIso(n),
    enacted: true,
  }));
  const db = makeDb(windows, [], { [intentionId.toString()]: logs });

  const trajectory = await getTrajectory({
    db,
    intentionId: intentionId.toString(),
    userId: 'u1',
  });

  assert.equal(trajectory.length, 3);
  assert.deepEqual(
    trajectory.map((t) => t.weekNumber),
    [1, 2, 3]
  );
  assert.equal(trajectory[2].autonomyScore, null); // not yet submitted

  const [w1, w2] = trajectory;
  assert.equal(typeof w1.autonomyScore, 'number');
  assert.equal(typeof w2.autonomyScore, 'number');
  assert.ok(w1.autonomyScore >= 0 && w1.autonomyScore <= 1);
  assert.ok(w2.autonomyScore >= 0 && w2.autonomyScore <= 1);
  // Higher SRHI score and far more adherence/streak by week 2 → strictly
  // higher automaticity index.
  assert.ok(w2.autonomyScore > w1.autonomyScore);
});

test('submitSrhi: not a graduation candidate when automaticity was never reached', async () => {
  const intentionId = new ObjectId();
  const window = {
    _id: new ObjectId(),
    intentionId,
    userId: 'u1',
    weekNumber: 1,
    scheduledFor: new Date(),
    submittedAt: null,
    score: null,
    createdAt: new Date(),
  };
  const db = makeDb(
    [window],
    [
      {
        _id: intentionId,
        userId: 'u1',
        status: 'active',
        reachedAutomaticityAt: null, // never reached 'off'
      },
    ]
  );
  const result = await submitSrhi({
    db,
    intentionId: intentionId.toString(),
    userId: 'u1',
    weekNumber: 1,
    items: itemsForScore(6),
  });
  assert.equal(result.graduation, undefined);
});

test('submitSrhi: not a candidate when the silence is too recent', async () => {
  const intentionId = new ObjectId();
  const window = {
    _id: new ObjectId(),
    intentionId,
    userId: 'u1',
    weekNumber: 1,
    scheduledFor: new Date(),
    submittedAt: null,
    score: null,
    createdAt: new Date(),
  };
  const db = makeDb(
    [window],
    [
      {
        _id: intentionId,
        userId: 'u1',
        status: 'active',
        reachedAutomaticityAt: new Date(),
      },
    ],
    { [intentionId.toString()]: [{ date: daysAgoIso(2), enacted: true }] } // only 2 days silent
  );
  const result = await submitSrhi({
    db,
    intentionId: intentionId.toString(),
    userId: 'u1',
    weekNumber: 1,
    items: itemsForScore(6),
  });
  assert.equal(result.graduation, undefined);
});

test('submitSrhi: a strong score after silence graduates the habit', async () => {
  const intentionId = new ObjectId();
  const window = {
    _id: new ObjectId(),
    intentionId,
    userId: 'u1',
    weekNumber: 3,
    scheduledFor: new Date(),
    submittedAt: null,
    score: null,
    createdAt: new Date(),
  };
  const intentionDoc = {
    _id: intentionId,
    userId: 'u1',
    status: 'active',
    habitType: 'build',
    creationMode: 'standalone',
    createdAt: new Date(daysAgoIso(60)),
    reachedAutomaticityAt: new Date(daysAgoIso(20)),
    earnedBadges: [],
  };
  const db = makeDb([window], [intentionDoc], {
    [intentionId.toString()]: [{ date: daysAgoIso(10), enacted: true }], // 10 days silent
  });

  const result = await submitSrhi({
    db,
    intentionId: intentionId.toString(),
    userId: 'u1',
    weekNumber: 3,
    items: itemsForScore(6), // well above the default 5.0 threshold
  });

  assert.ok(result.graduation);
  assert.equal(result.graduation.candidate, true);
  assert.equal(result.graduation.graduated, true);
  assert.equal(result.graduation.badgeKey, BADGES.HABIT_GRADUATE);
  assert.equal(result.graduation.bonusXp, 500);
  assert.ok(result.graduation.bankedXp >= 500);

  // The intention itself was updated: completed, banked XP, badge recorded.
  assert.equal(intentionDoc.status, 'completed');
  assert.equal(intentionDoc.completedReason, 'graduated');
  assert.equal(intentionDoc.bankedXp, result.graduation.bankedXp);
  assert.ok(
    intentionDoc.earnedBadges.some((b) => b.badgeKey === BADGES.HABIT_GRADUATE)
  );
});

test('submitSrhi: a weak score after silence does not graduate the habit', async () => {
  const intentionId = new ObjectId();
  const window = {
    _id: new ObjectId(),
    intentionId,
    userId: 'u1',
    weekNumber: 3,
    scheduledFor: new Date(),
    submittedAt: null,
    score: null,
    createdAt: new Date(),
  };
  const intentionDoc = {
    _id: intentionId,
    userId: 'u1',
    status: 'active',
    reachedAutomaticityAt: new Date(daysAgoIso(20)),
  };
  const db = makeDb([window], [intentionDoc], {
    [intentionId.toString()]: [{ date: daysAgoIso(10), enacted: true }],
  });

  const result = await submitSrhi({
    db,
    intentionId: intentionId.toString(),
    userId: 'u1',
    weekNumber: 3,
    items: itemsForScore(2), // well below the threshold
  });

  assert.deepEqual(result.graduation, { candidate: true, graduated: false });
  // Left untouched — the existing recovery/revocation mechanisms handle this
  // on the next reminder/gamification read, not here.
  assert.equal(intentionDoc.status, 'active');
  assert.equal(intentionDoc.bankedXp, undefined);
});
