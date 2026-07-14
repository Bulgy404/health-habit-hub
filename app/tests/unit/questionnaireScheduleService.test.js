import { test } from 'node:test';
import assert from 'node:assert';
import { ObjectId } from 'mongodb';
import { getDueQuestionnaires } from '../../services/questionnaireScheduleService.js';

// ── Minimal in-memory DB ──────────────────────────────────────────────────────

function makeDb({ enrollment = null, study = null, windows = [] } = {}) {
  return {
    collection(name) {
      if (name === 'enrollments') {
        return { findOne: async () => enrollment };
      }
      if (name === 'studies') {
        return { findOne: async () => study };
      }
      if (name === 'questionnaire_windows') {
        return {
          find: () => ({
            sort: () => ({ toArray: async () => windows }),
          }),
        };
      }
      if (name === 'questionnaires') {
        return { find: () => ({ toArray: async () => [] }) };
      }
      throw new Error(`unexpected collection: ${name}`);
    },
  };
}

test('getDueQuestionnaires: returns defaults when the user has no enrollment', async () => {
  const db = makeDb({ enrollment: null });
  const result = await getDueQuestionnaires({ db, userId: 'u1' });
  assert.deepEqual(result.reminders, { mode: 'admin_fixed', time: '09:00' });
  assert.strictEqual(result.studyEndDate, null);
});

test('getDueQuestionnaires: study-level questionnaire reminder mode applies when the group has no override', async () => {
  const studyId = new ObjectId();
  const groupId = new ObjectId();
  const db = makeDb({
    enrollment: { studyId, groupId },
    study: {
      _id: studyId,
      reminders: { questionnaire: { mode: 'admin_fixed', time: '10:30' } },
      groups: [{ id: groupId, label: 'G1', index: 1, reminders: null }],
    },
  });
  const result = await getDueQuestionnaires({ db, userId: 'u1' });
  assert.deepEqual(result.reminders, { mode: 'admin_fixed', time: '10:30' });
});

test('getDueQuestionnaires: group-level questionnaire reminder override wins over the study-level setting', async () => {
  const studyId = new ObjectId();
  const groupId = new ObjectId();
  const db = makeDb({
    enrollment: { studyId, groupId },
    study: {
      _id: studyId,
      reminders: { questionnaire: { mode: 'admin_fixed', time: '10:30' } },
      groups: [
        {
          id: groupId,
          label: 'G1',
          index: 1,
          reminders: { questionnaire: { mode: 'off', time: null } },
        },
      ],
    },
  });
  const result = await getDueQuestionnaires({ db, userId: 'u1' });
  assert.deepEqual(result.reminders, { mode: 'off', time: null });
});

test('getDueQuestionnaires: endOfStudyNotification merges effective mode/time with title/body content', async () => {
  const studyId = new ObjectId();
  const groupId = new ObjectId();
  const endDate = new Date('2026-12-01T00:00:00Z');
  const db = makeDb({
    enrollment: { studyId, groupId },
    study: {
      _id: studyId,
      endDate,
      endOfStudyNotification: {
        title: 'All done',
        body: 'Thanks for participating!',
      },
      reminders: { endOfStudy: { mode: 'admin_fixed', time: '18:00' } },
      groups: [{ id: groupId, label: 'G1', index: 1, reminders: null }],
    },
  });
  const result = await getDueQuestionnaires({ db, userId: 'u1' });
  assert.strictEqual(result.studyEndDate, endDate);
  assert.strictEqual(result.endOfStudyNotification.mode, 'admin_fixed');
  assert.strictEqual(result.endOfStudyNotification.time, '18:00');
  assert.strictEqual(result.endOfStudyNotification.title, 'All done');
  assert.strictEqual(
    result.endOfStudyNotification.body,
    'Thanks for participating!'
  );
});

test('getDueQuestionnaires: returns defaults when the study no longer exists', async () => {
  const studyId = new ObjectId();
  const db = makeDb({
    enrollment: { studyId, groupId: new ObjectId() },
    study: null,
  });
  const result = await getDueQuestionnaires({ db, userId: 'u1' });
  assert.deepEqual(result.reminders, { mode: 'admin_fixed', time: '09:00' });
});
