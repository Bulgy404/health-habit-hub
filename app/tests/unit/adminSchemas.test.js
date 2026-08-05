import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  createStudySchema,
  updateStudySchema,
  createStudyCodesSchema,
  cueConfigSchema,
  updateGroupConfigSchema,
  createNotificationCampaignSchema,
  createSurveySchema,
  updateSurveyStatusSchema,
  updateSurveyGroupsSchema,
  createQuestionnaireSchema,
  createCueSchema,
  importCuesSchema,
  createProfileFieldSchema,
} from '../../schemas/adminSchemas.js';

function ok(schema, data) {
  const r = schema.safeParse(data);
  assert.ok(
    r.success,
    `expected success but got: ${JSON.stringify(r.error?.errors)}`
  );
  return r.data;
}

function fail(schema, data) {
  const r = schema.safeParse(data);
  assert.ok(
    !r.success,
    `expected failure but schema accepted: ${JSON.stringify(data)}`
  );
}

// ── createStudySchema ─────────────────────────────────────────────────────────

describe('createStudySchema', () => {
  it('accepts valid study', () => {
    ok(createStudySchema, { name: 'Study A', groups: [{ label: 'Control' }] });
  });

  it('rejects missing name', () => {
    fail(createStudySchema, { groups: [{ label: 'G1' }] });
  });

  it('rejects empty groups', () => {
    fail(createStudySchema, { name: 'S', groups: [] });
  });

  it('trims name whitespace', () => {
    const r = ok(createStudySchema, {
      name: '  Study  ',
      groups: [{ label: 'G' }],
    });
    assert.equal(r.name, 'Study');
  });
});

// ── updateStudySchema ─────────────────────────────────────────────────────────

describe('updateStudySchema', () => {
  it('accepts partial update', () => {
    ok(updateStudySchema, { name: 'New Name' });
  });

  it('rejects unknown fields (strict)', () => {
    fail(updateStudySchema, { name: 'ok', rogue: true });
  });

  it('accepts empty object', () => {
    ok(updateStudySchema, {});
  });

  it('accepts a full reminders object across all 4 types and modes', () => {
    ok(updateStudySchema, {
      reminders: {
        habit: { mode: 'participant_choice' },
        questionnaire: { mode: 'admin_fixed', time: '09:30' },
        endOfStudy: { mode: 'admin_fixed', time: '18:00' },
        studyUpdate: { mode: 'off' },
      },
    });
  });

  it('rejects admin_fixed without a time', () => {
    fail(updateStudySchema, { reminders: { habit: { mode: 'admin_fixed' } } });
  });

  it('rejects admin_default entirely (removed mode)', () => {
    fail(updateStudySchema, {
      reminders: { habit: { mode: 'admin_default', time: '09:00' } },
    });
    fail(updateStudySchema, {
      reminders: { questionnaire: { mode: 'admin_default', time: '09:00' } },
    });
  });

  it('rejects off/participant_choice with a time set', () => {
    fail(updateStudySchema, {
      reminders: { habit: { mode: 'off', time: '09:00' } },
    });
    fail(updateStudySchema, {
      reminders: { habit: { mode: 'participant_choice', time: '09:00' } },
    });
  });

  it('rejects malformed HH:MM time', () => {
    fail(updateStudySchema, {
      reminders: { habit: { mode: 'admin_fixed', time: '9:00' } },
    });
    fail(updateStudySchema, {
      reminders: { habit: { mode: 'admin_fixed', time: '25:00' } },
    });
  });

  it('rejects participant_choice for studyUpdate/questionnaire/endOfStudy (habit-only mode)', () => {
    fail(updateStudySchema, {
      reminders: { studyUpdate: { mode: 'participant_choice' } },
    });
    fail(updateStudySchema, {
      reminders: { questionnaire: { mode: 'participant_choice' } },
    });
    fail(updateStudySchema, {
      reminders: { endOfStudy: { mode: 'participant_choice' } },
    });
  });

  it('accepts off/admin_fixed for studyUpdate/questionnaire/endOfStudy', () => {
    ok(updateStudySchema, { reminders: { studyUpdate: { mode: 'off' } } });
    ok(updateStudySchema, {
      reminders: { studyUpdate: { mode: 'admin_fixed', time: '09:00' } },
    });
    ok(updateStudySchema, { reminders: { questionnaire: { mode: 'off' } } });
    ok(updateStudySchema, { reminders: { endOfStudy: { mode: 'off' } } });
  });

  it('endOfStudyNotification is content-only now (enabled is silently stripped, not validated)', () => {
    const r = ok(updateStudySchema, {
      endOfStudyNotification: { enabled: true, title: 'Done', body: 'Thanks' },
    });
    assert.equal(r.endOfStudyNotification.enabled, undefined);
    assert.equal(r.endOfStudyNotification.title, 'Done');
  });
});

// ── updateGroupConfigSchema ───────────────────────────────────────────────────

describe('updateGroupConfigSchema', () => {
  it('accepts null reminders (inherit study-level for all types)', () => {
    ok(updateGroupConfigSchema, { reminders: null });
  });

  it('accepts a per-type mix of overrides and inherit (null)', () => {
    ok(updateGroupConfigSchema, {
      reminders: {
        habit: { mode: 'admin_fixed', time: '07:00' },
        questionnaire: null,
        endOfStudy: null,
        studyUpdate: null,
      },
    });
  });

  it('rejects the old reminderConfig shape (strict schema, unknown field)', () => {
    fail(updateGroupConfigSchema, {
      reminderConfig: { enabled: true, fixedTime: '08:00' },
    });
  });
});

// ── createNotificationCampaignSchema ──────────────────────────────────────────

describe('createNotificationCampaignSchema', () => {
  it('accepts a one-off campaign with no recurrence', () => {
    ok(createNotificationCampaignSchema, {
      title: 'Reminder',
      body: 'Please complete your check-in.',
      targetType: 'all_enrolled',
    });
  });

  it('accepts a recurring campaign', () => {
    ok(createNotificationCampaignSchema, {
      title: 'Weekly update',
      body: 'Check the app for news.',
      targetType: 'all_enrolled',
      recurrence: { intervalDays: 7 },
    });
  });

  it('rejects an invalid intervalDays', () => {
    fail(createNotificationCampaignSchema, {
      title: 'x',
      body: 'y',
      targetType: 'all_enrolled',
      recurrence: { intervalDays: 0 },
    });
  });

  it('rejects a title over 65 chars', () => {
    fail(createNotificationCampaignSchema, {
      title: 'x'.repeat(66),
      body: 'y',
      targetType: 'all_enrolled',
    });
  });
});

// ── createStudyCodesSchema ────────────────────────────────────────────────────

describe('createStudyCodesSchema', () => {
  it('accepts valid codes request', () => {
    ok(createStudyCodesSchema, { count: 10, groupId: 'g1' });
  });

  it('rejects count = 0', () => {
    fail(createStudyCodesSchema, { count: 0, groupId: 'g1' });
  });

  it('rejects count > 100', () => {
    fail(createStudyCodesSchema, { count: 101, groupId: 'g1' });
  });

  it('accepts missing groupId (study-level code)', () => {
    ok(createStudyCodesSchema, { count: 5 });
  });
});

// ── cueConfigSchema ───────────────────────────────────────────────────────────

describe('cueConfigSchema', () => {
  it('accepts valid config', () => {
    ok(cueConfigSchema, { cueCount: 'single', cueSource: 'high_quality' });
  });

  it('rejects invalid cueCount', () => {
    fail(cueConfigSchema, { cueCount: 'triple', cueSource: 'high_quality' });
  });

  it('rejects invalid cueSource', () => {
    fail(cueConfigSchema, { cueCount: 'multi', cueSource: 'medium_quality' });
  });
});

// ── createSurveySchema ────────────────────────────────────────────────────────

describe('createSurveySchema', () => {
  it('accepts valid survey', () => {
    ok(createSurveySchema, { title: 'Baseline', type: 'questionnaire' });
  });

  it('rejects missing title', () => {
    fail(createSurveySchema, { type: 'questionnaire' });
  });

  it('rejects invalid assignedGroups value', () => {
    fail(createSurveySchema, { title: 'T', type: 'q', assignedGroups: ['G5'] });
  });
});

// ── updateSurveyStatusSchema ──────────────────────────────────────────────────

describe('updateSurveyStatusSchema', () => {
  it('accepts draft', () => {
    ok(updateSurveyStatusSchema, { status: 'draft' });
  });
  it('accepts published', () => {
    ok(updateSurveyStatusSchema, { status: 'published' });
  });
  it('accepts archived', () => {
    ok(updateSurveyStatusSchema, { status: 'archived' });
  });
  it('rejects unknown status', () => {
    fail(updateSurveyStatusSchema, { status: 'active' });
  });
});

// ── updateSurveyGroupsSchema ──────────────────────────────────────────────────

describe('updateSurveyGroupsSchema', () => {
  it('accepts G1-G4', () => {
    ok(updateSurveyGroupsSchema, { groups: ['G1', 'G3'] });
  });

  it('rejects G5', () => {
    fail(updateSurveyGroupsSchema, { groups: ['G5'] });
  });
});

// ── createQuestionnaireSchema ─────────────────────────────────────────────────

describe('createQuestionnaireSchema', () => {
  it('accepts minimum fields', () => {
    ok(createQuestionnaireSchema, {
      title: { en: 'Baseline' },
      languages: ['en'],
    });
  });

  it('rejects empty title', () => {
    fail(createQuestionnaireSchema, { title: { en: '' }, languages: ['en'] });
  });

  it('rejects invalid slug', () => {
    fail(createQuestionnaireSchema, {
      title: { en: 'T' },
      languages: ['en'],
      slug: 'Has Spaces',
    });
  });

  it('rejects an unsupported language key in title', () => {
    fail(createQuestionnaireSchema, {
      title: { en: 'T', xx: 'nope' },
      languages: ['en'],
    });
  });
});

// ── createCueSchema ───────────────────────────────────────────────────────────

const validDimensions = { stability: 3, salience: 3, specificity: 3 };

describe('createCueSchema', () => {
  it('accepts valid cue', () => {
    ok(createCueSchema, {
      text: { en: 'Exercise in the morning' },
      languages: ['en'],
      quality: 'high',
      dimensions: validDimensions,
      domain: 'physical activity',
    });
  });

  it('accepts a cue with multiple language variants', () => {
    ok(createCueSchema, {
      text: { en: 'Exercise in the morning', de: 'Morgens Sport treiben' },
      languages: ['en', 'de'],
      quality: 'high',
      dimensions: validDimensions,
      domain: 'physical activity',
    });
  });

  it('rejects a cue with no non-empty text', () => {
    fail(createCueSchema, {
      text: {},
      languages: ['en'],
      quality: 'high',
      dimensions: validDimensions,
      domain: 'physical activity',
    });
  });

  it('rejects invalid quality', () => {
    fail(createCueSchema, {
      text: { en: 'x' },
      languages: ['en'],
      quality: 'medium',
      dimensions: validDimensions,
      domain: 'x',
    });
  });

  it('rejects a dimension value out of the 1-5 range', () => {
    fail(createCueSchema, {
      text: { en: 'x' },
      languages: ['en'],
      quality: 'high',
      dimensions: { stability: 6, salience: 3, specificity: 3 },
      domain: 'x',
    });
  });

  it('rejects an unsupported language in languages', () => {
    fail(createCueSchema, {
      text: { en: 'x' },
      languages: ['xx'],
      quality: 'high',
      dimensions: validDimensions,
      domain: 'x',
    });
  });
});

// ── importCuesSchema ──────────────────────────────────────────────────────────
// CSV rows arrive as flat string-keyed objects (wide format: text_en, text_de,
// ..., quality, stability, salience, specificity, domain) — importCuesSchema
// only checks the outer array shape; importCues() does the real per-field
// validation (see cuePoolService.test.js).

describe('importCuesSchema', () => {
  const validCue = {
    text_en: 'Wake up at 7',
    quality: 'low',
    stability: '3',
    salience: '3',
    specificity: '3',
    domain: 'sleep',
  };

  it('accepts array of valid cues', () => {
    ok(importCuesSchema, { cues: [validCue] });
  });

  it('rejects empty cues array', () => {
    fail(importCuesSchema, { cues: [] });
  });
});

// ── createProfileFieldSchema ──────────────────────────────────────────────────

describe('createProfileFieldSchema', () => {
  it('accepts valid field', () => {
    ok(createProfileFieldSchema, {
      fieldId: 'age',
      label: { en: 'Age' },
      type: 'number',
      languages: ['en'],
    });
  });

  it('rejects invalid fieldId (uppercase)', () => {
    fail(createProfileFieldSchema, {
      fieldId: 'Age',
      label: { en: 'Age' },
      type: 'number',
      languages: ['en'],
    });
  });

  it('rejects invalid type', () => {
    fail(createProfileFieldSchema, {
      fieldId: 'x',
      label: { en: 'X' },
      type: 'boolean',
      languages: ['en'],
    });
  });

  it('rejects a plain-string label (must be a locale-text map)', () => {
    fail(createProfileFieldSchema, {
      fieldId: 'x',
      label: 'X',
      type: 'text',
      languages: ['en'],
    });
  });

  it('accepts select-type options as {value, label} objects', () => {
    ok(createProfileFieldSchema, {
      fieldId: 'gender',
      label: { en: 'Gender' },
      type: 'select',
      languages: ['en', 'de'],
      options: [
        { value: 'male', label: { en: 'Male', de: 'Männlich' } },
        { value: 'female', label: { en: 'Female', de: 'Weiblich' } },
      ],
    });
  });
});
