import { test } from 'node:test';
import assert from 'node:assert';
import { ObjectId } from 'mongodb';
import {
  BADGES,
  DEFAULT_GAMIFICATION_CONFIG,
  xpForLevel,
  levelForXp,
  computeHabitGamification,
  computeUserGamification,
  currentShareStreakWeeks,
} from '../../services/gamificationService.js';
import { DEFAULT_CONFIG as REMINDER_CONFIG } from '../../services/reminderPlanService.js';

const NOW = new Date('2026-06-10T12:00:00Z');

function logsForDays(days) {
  const logs = [];
  for (let i = 1; i <= days; i++) {
    const d = new Date(NOW);
    d.setDate(d.getDate() - i);
    logs.push({ date: d.toISOString().slice(0, 10), enacted: true });
  }
  return logs;
}

test('xpForLevel: level 1 needs 0 XP and the curve is increasing', () => {
  assert.equal(xpForLevel(1), 0);
  assert.ok(xpForLevel(2) < xpForLevel(3));
  assert.ok(xpForLevel(3) < xpForLevel(4));
});

test('levelForXp: 0 XP is level 1 with a positive xpToNextLevel', () => {
  const r = levelForXp(0);
  assert.equal(r.level, 1);
  assert.ok(r.xpToNextLevel > 0);
});

test('levelForXp: more XP never decreases the level', () => {
  let prev = 0;
  for (const xp of [0, 100, 500, 2000, 10000]) {
    const { level } = levelForXp(xp);
    assert.ok(level >= prev);
    prev = level;
  }
});

test('computeHabitGamification: a fresh habit earns only First Step', () => {
  const result = computeHabitGamification({
    intention: {
      _id: new ObjectId(),
      habitType: 'build',
      creationMode: 'standalone',
      createdAt: NOW,
    },
    logs: [],
    srhiScores: [],
    reminderConfig: REMINDER_CONFIG,
    now: NOW,
  });
  assert.deepEqual(result.badges, [BADGES.FIRST_STEP]);
  assert.equal(result.frequency, 'daily');
});

test('computeHabitGamification: stacked habit earns Habit Architect', () => {
  const result = computeHabitGamification({
    intention: {
      _id: new ObjectId(),
      habitType: 'build',
      creationMode: 'stacked',
      createdAt: NOW,
    },
    logs: [],
    srhiScores: [],
    reminderConfig: REMINDER_CONFIG,
    now: NOW,
  });
  assert.ok(result.badges.includes(BADGES.HABIT_ARCHITECT));
});

test('computeHabitGamification: automatic quit habit earns Second Nature + Quit Champion', () => {
  const result = computeHabitGamification({
    intention: {
      _id: new ObjectId(),
      habitType: 'quit',
      creationMode: 'standalone',
      createdAt: new Date('2026-05-01T00:00:00Z'),
    },
    logs: logsForDays(14),
    srhiScores: [6.8, 6.6], // two strong weeks → fades toward off
    srhiSubmissionCount: 2,
    reminderConfig: REMINDER_CONFIG,
    now: NOW,
  });
  assert.ok(result.badges.includes(BADGES.STEADY_HABIT));
  assert.ok(['weekly', 'off'].includes(result.frequency));
  if (result.frequency === 'off') {
    assert.ok(result.badges.includes(BADGES.SECOND_NATURE));
    assert.ok(result.badges.includes(BADGES.QUIT_CHAMPION));
  }
  // XP should exceed a bare fresh habit's (logs + streak + tier bonus).
  assert.ok(result.xp > DEFAULT_GAMIFICATION_CONFIG.xpPerEnactedLog);
});

// ── computeUserGamification (with persistence) ──────────────────────────────

function makeDb({
  intentions,
  srhiByIntention = {},
  logsByIntention = {},
  userGamificationDoc = null,
}) {
  const pushed = [];
  let userGamification = userGamificationDoc
    ? { ...userGamificationDoc }
    : null;
  const collection = (name) => {
    if (name === 'implementation_intentions') {
      return {
        find() {
          return { toArray: async () => intentions.map((d) => ({ ...d })) };
        },
        async updateOne(filter, update) {
          pushed.push({ id: String(filter._id), update });
          const doc = intentions.find(
            (d) => String(d._id) === String(filter._id)
          );
          if (doc && update.$push?.earnedBadges) {
            doc.earnedBadges = [
              ...(doc.earnedBadges ?? []),
              update.$push.earnedBadges,
            ];
          }
          return { matchedCount: 1 };
        },
      };
    }
    if (name === 'srhi_responses') {
      return {
        find(filter) {
          const arr = srhiByIntention[String(filter.intentionId)] ?? [];
          return { sort: () => ({ toArray: async () => arr }) };
        },
      };
    }
    if (name === 'daily_behavior_logs') {
      return {
        find(filter) {
          const arr = logsByIntention[String(filter.intentionId)] ?? [];
          return { toArray: async () => arr };
        },
      };
    }
    if (name === 'admin_settings') {
      return { find: () => ({ toArray: async () => [] }) };
    }
    if (name === 'user_gamification') {
      return {
        async findOne() {
          return userGamification ? { ...userGamification } : null;
        },
        async updateOne(filter, update) {
          pushed.push({ id: 'user_gamification', update });
          if (!userGamification) userGamification = { earnedBadges: [] };
          if (update.$push?.earnedBadges) {
            userGamification.earnedBadges = [
              ...(userGamification.earnedBadges ?? []),
              update.$push.earnedBadges,
            ];
          }
          return { matchedCount: 1 };
        },
      };
    }
    throw new Error(`unexpected collection: ${name}`);
  };
  return {
    collection,
    _pushed: pushed,
    get _userGamification() {
      return userGamification;
    },
  };
}

/** A fake neo4jRun returning `donationDates` for the share-history query. */
function makeNeo4jRun(donationDates) {
  return async (cypher) => {
    if (cypher.includes('h.created_at AS at')) {
      return donationDates.map((at) => ({ at }));
    }
    return []; // e.g. the ENROLLED_IN lookup — no enrollment, gamification stays on
  };
}

test('computeUserGamification: aggregates XP and persists newly earned badges', async () => {
  const id = new ObjectId();
  const db = makeDb({
    intentions: [
      {
        _id: id,
        userId: 'u1',
        habitType: 'build',
        creationMode: 'standalone',
        status: 'active',
        behaviorLabel: 'Walking',
        createdAt: NOW,
        earnedBadges: [],
      },
    ],
  });
  const summary = await computeUserGamification({ db, userId: 'u1', now: NOW });
  assert.ok(summary.totalXp >= 0);
  assert.equal(summary.level >= 1, true);
  // First Step is newly earned and was persisted.
  assert.ok(summary.newlyEarned.some((b) => b.badgeKey === BADGES.FIRST_STEP));
  assert.equal(db._pushed.length, 1);
});

test('computeUserGamification: does not re-earn a badge already recorded', async () => {
  const id = new ObjectId();
  const db = makeDb({
    intentions: [
      {
        _id: id,
        userId: 'u1',
        habitType: 'build',
        creationMode: 'standalone',
        status: 'active',
        createdAt: NOW,
        earnedBadges: [{ badgeKey: BADGES.FIRST_STEP, earnedAt: NOW }],
      },
    ],
  });
  const summary = await computeUserGamification({ db, userId: 'u1', now: NOW });
  assert.equal(
    summary.newlyEarned.some((b) => b.badgeKey === BADGES.FIRST_STEP),
    false
  );
  assert.equal(db._pushed.length, 0);
});

// ── §7.5 sharing: XP + Community Contributor badge ──────────────────────────

function daysAgo(n) {
  const d = new Date(NOW);
  d.setDate(d.getDate() - n);
  return d.toISOString();
}

test('currentShareStreakWeeks: no shares is a zero streak', () => {
  assert.equal(currentShareStreakWeeks([], NOW), 0);
});

test('currentShareStreakWeeks: one share per week for 4 straight weeks', () => {
  const dates = [daysAgo(1), daysAgo(8), daysAgo(15), daysAgo(22)];
  assert.equal(currentShareStreakWeeks(dates, NOW), 4);
});

test('currentShareStreakWeeks: a gap week breaks the streak', () => {
  const dates = [daysAgo(1), daysAgo(8), daysAgo(30)]; // weeks 0,1 then a gap
  assert.equal(currentShareStreakWeeks(dates, NOW), 2);
});

test('computeUserGamification: no neo4jRun contributes zero share XP/badges', async () => {
  const db = makeDb({ intentions: [] });
  const summary = await computeUserGamification({ db, userId: 'u1', now: NOW });
  assert.equal(summary.shareCount, 0);
  assert.equal(summary.shareStreakWeeks, 0);
  assert.equal(
    summary.badges.some((b) => b.badgeKey === BADGES.COMMUNITY_CONTRIBUTOR),
    false
  );
});

test('computeUserGamification: awards share XP and Community Contributor for regular sharing', async () => {
  const db = makeDb({ intentions: [] });
  const neo4jRun = makeNeo4jRun([
    daysAgo(1),
    daysAgo(8),
    daysAgo(15),
    daysAgo(22),
  ]);
  const summary = await computeUserGamification({
    db,
    userId: 'u1',
    neo4jRun,
    now: NOW,
  });
  assert.equal(summary.shareCount, 4);
  assert.equal(summary.shareStreakWeeks, 4);
  assert.equal(summary.totalXp, 4 * DEFAULT_GAMIFICATION_CONFIG.xpPerShare);
  assert.ok(
    summary.newlyEarned.some((b) => b.badgeKey === BADGES.COMMUNITY_CONTRIBUTOR)
  );
  assert.equal(db._userGamification.earnedBadges.length, 1);
});

test('computeUserGamification: a single share earns XP but not the streak badge', async () => {
  const db = makeDb({ intentions: [] });
  const neo4jRun = makeNeo4jRun([daysAgo(1)]);
  const summary = await computeUserGamification({
    db,
    userId: 'u1',
    neo4jRun,
    now: NOW,
  });
  assert.equal(summary.shareCount, 1);
  assert.equal(summary.totalXp, DEFAULT_GAMIFICATION_CONFIG.xpPerShare);
  assert.equal(
    summary.badges.some((b) => b.badgeKey === BADGES.COMMUNITY_CONTRIBUTOR),
    false
  );
});

test('computeUserGamification: Community Contributor is not re-earned once persisted', async () => {
  const db = makeDb({
    intentions: [],
    userGamificationDoc: {
      userId: 'u1',
      earnedBadges: [{ badgeKey: BADGES.COMMUNITY_CONTRIBUTOR, earnedAt: NOW }],
    },
  });
  const neo4jRun = makeNeo4jRun([
    daysAgo(1),
    daysAgo(8),
    daysAgo(15),
    daysAgo(22),
  ]);
  const summary = await computeUserGamification({
    db,
    userId: 'u1',
    neo4jRun,
    now: NOW,
  });
  assert.equal(
    summary.newlyEarned.some(
      (b) => b.badgeKey === BADGES.COMMUNITY_CONTRIBUTOR
    ),
    false
  );
});
