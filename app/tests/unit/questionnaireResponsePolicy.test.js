import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ObjectId } from 'mongodb';
import { windowAvailability } from '../../services/questionnaireResponsePolicy.js';
import {
  selectQuestionnaireWindow,
  getDueQuestionnaires,
  markWindowSubmitted,
} from '../../services/questionnaireScheduleService.js';
import {
  createQuestionnaireAssignmentSchema,
  updateQuestionnaireAssignmentSchema,
} from '../../schemas/adminSchemas.js';

const scheduled = {
  scheduledFor: new Date('2026-11-05T10:00:00Z'),
  submittedAt: null,
};
test('scheduled day remains open until local midnight; expires at the exact boundary', () => {
  const policy = { lateDays: 0, timeZone: 'Europe/Berlin' };
  assert.equal(
    windowAvailability(scheduled, policy, new Date('2026-11-05T22:59:59Z'))
      .status,
    'open'
  );
  const result = windowAvailability(
    scheduled,
    policy,
    new Date('2026-11-05T23:00:00Z')
  );
  assert.equal(result.status, 'missed');
  assert.equal(result.scheduledDate, '2026-11-05');
  assert.equal(result.closesAt.toISOString(), '2026-11-05T23:00:00.000Z');
});
test('late answers refer to original date and close after additional calendar days', () => {
  const result = windowAvailability(
    scheduled,
    { lateDays: 2, timeZone: 'Europe/Berlin' },
    new Date('2026-11-06T12:00:00Z')
  );
  assert.equal(result.status, 'open');
  assert.equal(result.isLate, true);
  assert.equal(result.scheduledDate, '2026-11-05');
  assert.equal(result.closesAt.toISOString(), '2026-11-07T23:00:00.000Z');
});
test('deadlines follow daylight saving transitions, not fixed 24-hour durations', () => {
  for (const [start, end] of [
    ['2026-03-28T12:00:00Z', '2026-03-29T22:00:00.000Z'],
    ['2026-10-24T12:00:00Z', '2026-10-25T23:00:00.000Z'],
  ]) {
    assert.equal(
      windowAvailability(
        { scheduledFor: new Date(start) },
        { lateDays: 1, timeZone: 'Europe/Berlin' }
      ).closesAt.toISOString(),
      end
    );
  }
});
test('legacy and explicit unlimited policies never expire; completed stays completed', () => {
  for (const policy of [undefined, { lateDays: null, timeZone: 'UTC' }]) {
    assert.equal(
      windowAvailability(scheduled, policy, new Date('2030-01-01')).status,
      'open'
    );
  }
  assert.equal(
    windowAvailability(
      { ...scheduled, submittedAt: new Date() },
      { lateDays: 0, timeZone: 'UTC' },
      new Date('2030-01-01')
    ).status,
    'completed'
  );
});
test('timezone controls scheduled date, including dates different from UTC', () => {
  const w = { scheduledFor: new Date('2026-11-05T23:30:00Z') };
  const r = windowAvailability(
    w,
    { lateDays: 0, timeZone: 'Asia/Tokyo' },
    new Date('2026-11-06T12:00:00Z')
  );
  assert.equal(r.scheduledDate, '2026-11-06');
  assert.equal(r.closesAt.toISOString(), '2026-11-06T15:00:00.000Z');
});
test('admin policy rejects invalid timezone and invalid grace periods', () => {
  const valid = {
    questionnaireId: new ObjectId().toString(),
    cadence: { mode: 'interval', intervalDays: 1, occurrences: 8 },
  };
  assert.equal(
    createQuestionnaireAssignmentSchema.safeParse({
      ...valid,
      responsePolicy: { lateDays: 2, timeZone: 'Europe/Berlin' },
    }).success,
    true
  );
  for (const responsePolicy of [
    { lateDays: -1, timeZone: 'UTC' },
    { lateDays: 1.5, timeZone: 'UTC' },
    { lateDays: 366, timeZone: 'UTC' },
    { lateDays: 1, timeZone: 'invalid' },
  ]) {
    assert.equal(
      updateQuestionnaireAssignmentSchema.safeParse({ responsePolicy }).success,
      false
    );
  }
});

function makeDb(windows, assignments) {
  return {
    collection(name) {
      const rows = name === 'questionnaire_windows' ? windows : assignments;
      return {
        find: () => ({
          sort: () => ({ toArray: async () => rows }),
          toArray: async () => rows,
        }),
      };
    },
  };
}
test('submission selects exact eligible window; rejects expired, future, completed and unknown ids', async () => {
  const a = {
    _id: new ObjectId(),
    responsePolicy: { lateDays: 1, timeZone: 'UTC' },
  };
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const windows = [-4, -1, 0, 1].map((offset) => ({
    _id: new ObjectId(),
    assignmentId: a._id,
    scheduledFor: new Date(+today + offset * 86400000),
    submittedAt: null,
  }));
  const db = makeDb(windows, [a]);
  assert.equal(
    (
      await selectQuestionnaireWindow({
        db,
        userId: 'u',
        questionnaireSlug: 'sliq',
        windowId: windows[2]._id,
      })
    ).window._id,
    windows[2]._id
  );
  for (const id of [windows[0]._id, windows[3]._id, new ObjectId()]) {
    assert.equal(
      (
        await selectQuestionnaireWindow({
          db,
          userId: 'u',
          questionnaireSlug: 'sliq',
          windowId: id,
        })
      ).window,
      null
    );
  }
  windows[2].submittedAt = new Date();
  assert.equal(
    (
      await selectQuestionnaireWindow({
        db,
        userId: 'u',
        questionnaireSlug: 'sliq',
        windowId: windows[2]._id,
      })
    ).window,
    null
  );
});
test('completion updates only selected occurrence, retaining ownership and open-state guard', async () => {
  const id = new ObjectId();
  let filter;
  const db = {
    collection: () => ({
      findOneAndUpdate: async (f) => {
        filter = f;
        return null;
      },
    }),
  };
  assert.equal(
    await markWindowSubmitted({
      db,
      userId: 'owner',
      questionnaireSlug: 'sliq',
      windowId: id,
    }),
    null
  );
  assert.equal(String(filter._id), String(id));
  assert.equal(filter.userId, 'owner');
  assert.equal(filter.questionnaireSlug, 'sliq');
  assert.equal(filter.submittedAt, null);
});

test('due API hides expired check-ins, preserves answerable dates and separates today completion', async () => {
  const now = new Date();
  now.setUTCHours(0, 0, 0, 0);
  const studyId = new ObjectId();
  const assignment = {
    _id: new ObjectId(),
    cadence: { mode: 'fixed' },
    responsePolicy: { lateDays: 1, timeZone: 'UTC' },
  };
  const windows = [-3, -1, 0, 1].map((day, i) => ({
    _id: new ObjectId(),
    userId: 'u',
    assignmentId: assignment._id,
    questionnaireSlug: 'sliq',
    occurrence: i + 1,
    submittedAt: null,
    scheduledFor: new Date(+now + day * 86400000),
  }));
  const done = {
    ...windows[2],
    _id: new ObjectId(),
    questionnaireSlug: 'wellbeing',
    submittedAt: new Date(),
  };
  const db = {
    collection(name) {
      if (name === 'enrollments') return { findOne: async () => ({ studyId }) };
      if (name === 'studies')
        return { findOne: async () => ({ _id: studyId, groups: [] }) };
      if (name === 'questionnaire_assignments')
        return {
          findOne: async () => assignment,
          find: () => ({ toArray: async () => [assignment] }),
        };
      if (name === 'questionnaires')
        return {
          find: () => ({
            toArray: async () => [
              { slug: 'sliq', title: 'SLIQ' },
              { slug: 'wellbeing', title: 'Wellbeing' },
            ],
          }),
        };
      return {
        find: (query) => ({
          sort: () => ({
            toArray: async () =>
              query.submittedAt === null ? windows : [done],
          }),
        }),
      };
    },
  };
  const result = await getDueQuestionnaires({ db, userId: 'u' });
  assert.deepEqual(
    result.questionnaires.map((q) => q.occurrence),
    [2, 3, 4]
  );
  assert.equal(result.questionnaires[0].isLate, true);
  assert.equal(result.questionnaires[1].isLate, false);
  assert.equal(result.questionnaires[2].isDue, false);
  assert.equal(result.completedQuestionnaires[0].isCompleted, true);
  assert.equal(
    result.completedQuestionnaires[0].questionnaireSlug,
    'wellbeing'
  );
});
