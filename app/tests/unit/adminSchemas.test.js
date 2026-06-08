import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  createStudySchema,
  updateStudySchema,
  createStudyCodesSchema,
  cueConfigSchema,
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
  assert.ok(r.success, `expected success but got: ${JSON.stringify(r.error?.errors)}`);
  return r.data;
}

function fail(schema, data) {
  const r = schema.safeParse(data);
  assert.ok(!r.success, `expected failure but schema accepted: ${JSON.stringify(data)}`);
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
    const r = ok(createStudySchema, { name: '  Study  ', groups: [{ label: 'G' }] });
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

  it('rejects missing groupId', () => {
    fail(createStudyCodesSchema, { count: 5 });
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
  it('accepts draft', () => { ok(updateSurveyStatusSchema, { status: 'draft' }); });
  it('accepts published', () => { ok(updateSurveyStatusSchema, { status: 'published' }); });
  it('accepts archived', () => { ok(updateSurveyStatusSchema, { status: 'archived' }); });
  it('rejects unknown status', () => { fail(updateSurveyStatusSchema, { status: 'active' }); });
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
    ok(createQuestionnaireSchema, { title: 'Baseline' });
  });

  it('rejects empty title', () => {
    fail(createQuestionnaireSchema, { title: '' });
  });

  it('rejects invalid slug', () => {
    fail(createQuestionnaireSchema, { title: 'T', slug: 'Has Spaces' });
  });
});

// ── createCueSchema ───────────────────────────────────────────────────────────

describe('createCueSchema', () => {
  it('accepts valid cue', () => {
    ok(createCueSchema, {
      text: 'Exercise in the morning',
      quality: 'high',
      dimensions: ['time', 'location'],
      domain: 'physical activity',
      language: 'en',
    });
  });

  it('rejects invalid quality', () => {
    fail(createCueSchema, {
      text: 'x', quality: 'medium', dimensions: ['d'], domain: 'x', language: 'en',
    });
  });

  it('rejects empty dimensions', () => {
    fail(createCueSchema, {
      text: 'x', quality: 'high', dimensions: [], domain: 'x', language: 'en',
    });
  });
});

// ── importCuesSchema ──────────────────────────────────────────────────────────

describe('importCuesSchema', () => {
  const validCue = {
    text: 'Wake up at 7',
    quality: 'low',
    dimensions: ['time'],
    domain: 'sleep',
    language: 'en',
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
    ok(createProfileFieldSchema, { fieldId: 'age', label: 'Age', type: 'number' });
  });

  it('rejects invalid fieldId (uppercase)', () => {
    fail(createProfileFieldSchema, { fieldId: 'Age', label: 'Age', type: 'number' });
  });

  it('rejects invalid type', () => {
    fail(createProfileFieldSchema, { fieldId: 'x', label: 'X', type: 'boolean' });
  });
});
