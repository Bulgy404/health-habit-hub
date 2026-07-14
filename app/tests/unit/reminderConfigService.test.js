import { test } from 'node:test';
import assert from 'node:assert';

import {
  defaultReminders,
  normalizeReminders,
  resolveEffectiveReminders,
} from '../../services/reminderConfigService.js';

// ── defaultReminders ─────────────────────────────────────────────────────────

test('defaultReminders: preserves pre-feature behavior for each type', () => {
  const d = defaultReminders();
  // Habit reminders used to be fully participant-chosen.
  assert.deepStrictEqual(d.habit, { mode: 'participant_choice', time: null });
  // Questionnaire/end-of-study reminders always fired at a fixed 9am.
  assert.deepStrictEqual(d.questionnaire, { mode: 'admin_fixed', time: '09:00' });
  assert.deepStrictEqual(d.endOfStudy, { mode: 'admin_fixed', time: '09:00' });
  // Study-update reminders didn't exist.
  assert.deepStrictEqual(d.studyUpdate, { mode: 'off', time: null });
});

// ── normalizeReminders ───────────────────────────────────────────────────────

test('normalizeReminders: returns defaults when study has no reminders field', () => {
  const result = normalizeReminders({});
  assert.deepStrictEqual(result, defaultReminders());
});

test('normalizeReminders: returns defaults when study is null/undefined', () => {
  assert.deepStrictEqual(normalizeReminders(null), defaultReminders());
  assert.deepStrictEqual(normalizeReminders(undefined), defaultReminders());
});

test('normalizeReminders: stored values override defaults per type', () => {
  const study = {
    reminders: {
      habit: { mode: 'admin_fixed', time: '08:00' },
    },
  };
  const result = normalizeReminders(study);
  assert.deepStrictEqual(result.habit, { mode: 'admin_fixed', time: '08:00' });
  // Untouched types still fall back to defaults.
  assert.deepStrictEqual(result.questionnaire, defaultReminders().questionnaire);
  assert.deepStrictEqual(result.endOfStudy, defaultReminders().endOfStudy);
  assert.deepStrictEqual(result.studyUpdate, defaultReminders().studyUpdate);
});

test('normalizeReminders: all 4 types can be fully overridden', () => {
  const study = {
    reminders: {
      habit: { mode: 'off', time: null },
      questionnaire: { mode: 'admin_fixed', time: '09:30' },
      endOfStudy: { mode: 'admin_fixed', time: '10:30' },
      studyUpdate: { mode: 'admin_fixed', time: '12:00' },
    },
  };
  assert.deepStrictEqual(normalizeReminders(study), study.reminders);
});

// ── resolveEffectiveReminders ────────────────────────────────────────────────

test('resolveEffectiveReminders: falls back to study-level when group has no reminders', () => {
  const study = { reminders: { habit: { mode: 'admin_fixed', time: '07:00' } } };
  const result = resolveEffectiveReminders({ study, group: null });
  assert.deepStrictEqual(result.habit, { mode: 'admin_fixed', time: '07:00' });
});

test('resolveEffectiveReminders: falls back to study-level when group.reminders is undefined', () => {
  const study = { reminders: { habit: { mode: 'admin_fixed', time: '07:00' } } };
  const result = resolveEffectiveReminders({ study, group: {} });
  assert.deepStrictEqual(result.habit, { mode: 'admin_fixed', time: '07:00' });
});

test('resolveEffectiveReminders: group override wins over study-level, per type independently', () => {
  const study = {
    reminders: {
      habit: { mode: 'admin_fixed', time: '07:00' },
      questionnaire: { mode: 'admin_fixed', time: '09:00' },
    },
  };
  const group = {
    reminders: {
      // Only overrides habit; questionnaire is explicitly null = inherit.
      habit: { mode: 'participant_choice', time: null },
      questionnaire: null,
    },
  };
  const result = resolveEffectiveReminders({ study, group });
  assert.deepStrictEqual(result.habit, { mode: 'participant_choice', time: null });
  // Inherited from study-level since the group's questionnaire override is null.
  assert.deepStrictEqual(result.questionnaire, { mode: 'admin_fixed', time: '09:00' });
});

test('resolveEffectiveReminders: group can override all 4 types simultaneously', () => {
  const study = { reminders: {} };
  const group = {
    reminders: {
      habit: { mode: 'off', time: null },
      questionnaire: { mode: 'admin_fixed', time: '08:00' },
      endOfStudy: { mode: 'admin_fixed', time: '18:00' },
      studyUpdate: { mode: 'admin_fixed', time: '11:00' },
    },
  };
  assert.deepStrictEqual(resolveEffectiveReminders({ study, group }), group.reminders);
});

test('resolveEffectiveReminders: no group and no study reminders returns full defaults', () => {
  const result = resolveEffectiveReminders({ study: {}, group: undefined });
  assert.deepStrictEqual(result, defaultReminders());
});
