import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeAutonomyScore,
  computeReminderPlan,
  currentStreakDays,
  adherenceRate,
  DEFAULT_CONFIG,
  FREQUENCIES,
  DEFAULT_II_REMINDER_TEMPLATES,
  readReminderTemplates,
  markAutomaticityReached,
} from '../../services/reminderPlanService.js';
import { ObjectId } from 'mongodb';

const NOW = new Date('2026-06-10T12:00:00Z');

/** Build enacted logs for the N days before NOW (inclusive of yesterday). */
function logsForDays(days, { enacted = true, endOffset = 1 } = {}) {
  const logs = [];
  for (let i = endOffset; i < days + endOffset; i++) {
    const d = new Date(NOW);
    d.setDate(d.getDate() - i);
    logs.push({ date: d.toISOString().slice(0, 10), enacted });
  }
  return logs;
}

const intention = { id: 'i1', reminderTime: '19:30' };

describe('autonomy score components', () => {
  test('no data at all yields score 0', () => {
    const { autonomyScore } = computeAutonomyScore({
      latestSrhi: null,
      adherence14d: 0,
      streakDays: 0,
    });
    assert.equal(autonomyScore, 0);
  });

  test('perfect inputs yield score 1', () => {
    const { autonomyScore } = computeAutonomyScore({
      latestSrhi: 7,
      adherence14d: 1,
      streakDays: 14,
    });
    assert.equal(Number(autonomyScore.toFixed(3)), 1);
  });

  test('SRHI maps 1–7 onto 0–1', () => {
    const low = computeAutonomyScore({
      latestSrhi: 1,
      adherence14d: 0,
      streakDays: 0,
    });
    const mid = computeAutonomyScore({
      latestSrhi: 4,
      adherence14d: 0,
      streakDays: 0,
    });
    assert.equal(low.components.srhi, 0);
    assert.equal(mid.components.srhi, 0.5);
  });
});

describe('streak and adherence helpers', () => {
  test('streak counts consecutive enacted days ending yesterday', () => {
    assert.equal(currentStreakDays(logsForDays(5), NOW), 5);
  });

  test('streak is broken by a gap', () => {
    const logs = logsForDays(3); // yesterday..3 days ago
    // add older logs separated by a gap
    logs.push({ date: '2026-06-01', enacted: true });
    assert.equal(currentStreakDays(logs, NOW), 3);
  });

  test('adherenceRate is the fraction of trailing days enacted', () => {
    assert.equal(adherenceRate(logsForDays(7), 14, NOW), 0.5);
    assert.equal(adherenceRate(logsForDays(14), 14, NOW), 1);
    assert.equal(adherenceRate([], 14, NOW), 0);
  });
});

describe('reminder plan tiers', () => {
  test('new habit (no SRHI, no logs) gets daily reminders', () => {
    const plan = computeReminderPlan({ intention, now: NOW });
    assert.equal(plan.frequency, 'daily');
    assert.equal(plan.reminderTime, '19:30');
  });

  test('strong habit with two supporting SRHI weeks fades reminders', () => {
    const plan = computeReminderPlan({
      intention,
      srhiScores: [6.8, 6.5], // two strong consecutive weeks
      logs: logsForDays(14),
      now: NOW,
    });
    assert.ok(
      ['weekly', 'off'].includes(plan.frequency),
      `expected weekly/off, got ${plan.frequency}`
    );
    assert.ok(plan.autonomyScore > 0.85);
  });

  test('hysteresis: one strong week alone does not fade below every_2_days', () => {
    const plan = computeReminderPlan({
      intention,
      srhiScores: [6.8, 2.0], // latest strong, previous weak
      logs: logsForDays(14),
      now: NOW,
    });
    assert.ok(
      ['daily', 'every_2_days'].includes(plan.frequency),
      `expected daily/every_2_days, got ${plan.frequency}`
    );
  });

  test('recovery: collapsing 7-day adherence snaps back to daily', () => {
    // Great SRHI history but no logs in the last 7 days
    const oldLogs = logsForDays(7, { endOffset: 8 });
    const plan = computeReminderPlan({
      intention,
      srhiScores: [6.8, 6.7],
      logs: oldLogs,
      now: NOW,
    });
    assert.equal(plan.frequency, 'daily');
    assert.ok(plan.components.adherence7d < DEFAULT_CONFIG.recoveryAdherence);
  });

  test('moderate progress lands in a middle tier', () => {
    const plan = computeReminderPlan({
      intention,
      srhiScores: [4.5, 4.2],
      logs: logsForDays(9),
      now: NOW,
    });
    assert.ok(
      ['every_2_days', 'twice_weekly'].includes(plan.frequency),
      `expected middle tier, got ${plan.frequency}`
    );
  });

  test('exposes score components for researcher transparency', () => {
    const plan = computeReminderPlan({
      intention,
      srhiScores: [5],
      logs: logsForDays(10),
      now: NOW,
    });
    for (const key of ['srhi', 'adherence14d', 'streak', 'adherence7d']) {
      assert.ok(plan.components[key] >= 0 && plan.components[key] <= 1);
    }
    assert.ok(FREQUENCIES.includes(plan.frequency));
  });
});

// ── §7.2 Implementation Intention Reminder ──────────────────────────────────

describe('§7.2 reminder content', () => {
  test('computeReminderPlan surfaces behaviorLabel and cueText', () => {
    const plan = computeReminderPlan({
      intention: {
        id: 'i1',
        reminderTime: '19:00',
        createdAt: new Date('2026-06-01T00:00:00Z'),
        behaviorLabel: 'Walking',
        cueText: 'After dinner',
      },
      now: NOW,
    });
    assert.equal(plan.behaviorLabel, 'Walking');
    assert.equal(plan.cueText, 'After dinner');
  });

  function makeSettingsDb(doc) {
    return {
      collection(name) {
        assert.equal(name, 'admin_settings');
        return { findOne: async () => doc };
      },
    };
  }

  test('readReminderTemplates returns defaults when unset', async () => {
    const templates = await readReminderTemplates(makeSettingsDb(null));
    assert.deepEqual(templates, DEFAULT_II_REMINDER_TEMPLATES);
  });

  test('readReminderTemplates parses a JSON-string array from admin_settings', async () => {
    const custom = ['A: {cue} → {behavior}', 'B: {behavior} after {cue}'];
    const templates = await readReminderTemplates(
      makeSettingsDb({
        key: 'reminder_ii_templates',
        value: JSON.stringify(custom),
      })
    );
    assert.deepEqual(templates, custom);
  });

  test('readReminderTemplates accepts an already-array value', async () => {
    const custom = ['only one {cue} {behavior}'];
    const templates = await readReminderTemplates(
      makeSettingsDb({ key: 'reminder_ii_templates', value: custom })
    );
    assert.deepEqual(templates, custom);
  });

  test('readReminderTemplates falls back to defaults on malformed value', async () => {
    const templates = await readReminderTemplates(
      makeSettingsDb({ key: 'reminder_ii_templates', value: '{not json' })
    );
    assert.deepEqual(templates, DEFAULT_II_REMINDER_TEMPLATES);
  });

  test('readReminderTemplates ignores an empty array', async () => {
    const templates = await readReminderTemplates(
      makeSettingsDb({ key: 'reminder_ii_templates', value: [] })
    );
    assert.deepEqual(templates, DEFAULT_II_REMINDER_TEMPLATES);
  });
});

describe('markAutomaticityReached', () => {
  function makeIntentionsDb(doc) {
    const updates = [];
    return {
      db: {
        collection: (name) => {
          if (name !== 'implementation_intentions') {
            throw new Error(`unexpected: ${name}`);
          }
          return {
            async updateOne(filter, update) {
              updates.push({ filter, update });
              if (String(filter._id) === String(doc._id)) {
                Object.assign(doc, update.$set);
              }
              return { matchedCount: 1 };
            },
          };
        },
      },
      updates,
    };
  }

  test('stamps reachedAutomaticityAt the first time the tier is off', async () => {
    const doc = { _id: new ObjectId() };
    const { db, updates } = makeIntentionsDb(doc);
    await markAutomaticityReached({
      db,
      intentionDoc: doc,
      frequency: 'off',
      now: NOW,
    });
    assert.equal(updates.length, 1);
    assert.equal(doc.reachedAutomaticityAt, NOW);
  });

  test('does nothing when the tier is not off', async () => {
    const doc = { _id: new ObjectId() };
    const { db, updates } = makeIntentionsDb(doc);
    await markAutomaticityReached({
      db,
      intentionDoc: doc,
      frequency: 'weekly',
      now: NOW,
    });
    assert.equal(updates.length, 0);
    assert.equal(doc.reachedAutomaticityAt, undefined);
  });

  test('does nothing when already stamped (sticky, never overwritten)', async () => {
    const already = new Date('2026-01-01T00:00:00Z');
    const doc = { _id: new ObjectId(), reachedAutomaticityAt: already };
    const { db, updates } = makeIntentionsDb(doc);
    await markAutomaticityReached({
      db,
      intentionDoc: doc,
      frequency: 'off',
      now: NOW,
    });
    assert.equal(updates.length, 0);
    assert.equal(doc.reachedAutomaticityAt, already);
  });
});
