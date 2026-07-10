import { test } from 'node:test';
import assert from 'node:assert';
import {
  wrap,
  migrateQuestion,
  migrateQuestionnaireDoc,
} from '../../../scripts/lib/questionnaireLocaleMigration.js';

test('wrap() wraps a plain string as an English-only locale map', () => {
  assert.deepStrictEqual(wrap('Hello'), { en: 'Hello' });
});

test('wrap() treats a non-string as empty', () => {
  assert.deepStrictEqual(wrap(undefined), { en: '' });
  assert.deepStrictEqual(wrap(null), { en: '' });
});

test('migrateQuestion() wraps text and every option label', () => {
  const migrated = migrateQuestion({
    id: 'q1',
    type: 'single_choice',
    text: 'How do you feel?',
    options: [
      { value: '0', label: 'Bad' },
      { value: '1', label: 'Good' },
    ],
  });
  assert.deepStrictEqual(migrated.text, { en: 'How do you feel?' });
  assert.deepStrictEqual(migrated.options[0].label, { en: 'Bad' });
  assert.deepStrictEqual(migrated.options[1].label, { en: 'Good' });
  assert.strictEqual(migrated.id, 'q1');
});

test('migrateQuestion() promotes bare-string options to {value, label} objects', () => {
  // Custom (non-library) questionnaires saved options as bare strings
  // before this migration — no `value`/`label` wrapper at all.
  const migrated = migrateQuestion({
    id: 'q1',
    text: 'Pick one',
    options: ['First', 'Second'],
  });
  assert.deepStrictEqual(migrated.options, [
    { value: '0', label: { en: 'First' } },
    { value: '1', label: { en: 'Second' } },
  ]);
});

test('migrateQuestion() leaves an already-migrated question unchanged', () => {
  const already = {
    id: 'q1',
    text: { en: 'Already migrated', de: 'Schon migriert' },
    options: [{ value: '0', label: { en: 'X' } }],
  };
  assert.deepStrictEqual(migrateQuestion(already), already);
});

test('migrateQuestionnaireDoc() migrates title, description, and every question', () => {
  const doc = {
    title: 'Old Title',
    description: 'Old description',
    questions: [
      { id: 'q1', text: 'Q1?', options: [{ value: '1', label: 'Yes' }] },
    ],
  };
  const migrated = migrateQuestionnaireDoc(doc);
  assert.deepStrictEqual(migrated.title, { en: 'Old Title' });
  assert.deepStrictEqual(migrated.description, { en: 'Old description' });
  assert.deepStrictEqual(migrated.languages, ['en']);
  assert.deepStrictEqual(migrated.questions[0].text, { en: 'Q1?' });
});

test('migrateQuestionnaireDoc() preserves existing languages if already set', () => {
  const migrated = migrateQuestionnaireDoc({
    title: 'T',
    description: 'D',
    languages: ['en', 'de'],
    questions: [],
  });
  assert.deepStrictEqual(migrated.languages, ['en', 'de']);
});

test('migrateQuestionnaireDoc() is idempotent — running it twice is a no-op the second time', () => {
  const doc = {
    title: 'Old Title',
    description: 'Old description',
    questions: [
      { id: 'q1', text: 'Q1?', options: [{ value: '1', label: 'Yes' }] },
    ],
  };
  const once = migrateQuestionnaireDoc(doc);
  const twice = migrateQuestionnaireDoc(once);
  assert.deepStrictEqual(once, twice);
});
