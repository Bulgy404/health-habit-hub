import { test } from 'node:test';
import assert from 'node:assert';
import { ObjectId } from 'mongodb';
import {
  getDueQuestionnaires,
  srhiHabitScopeActive,
  generateHabitCreationWindows,
  scheduleOffsets,
  topUpContinuousWindows,
  HABIT_ANCHOR_DELAY_MS,
} from '../../services/questionnaireScheduleService.js';

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

// ── habit-scope gating (questionnaires.scope === 'habit') ─────────────────────

// Mock supporting resolveEffectiveAssignments (assignments.find(query).toArray),
// resolveHabitScopeAssignments (questionnaires.find(query).toArray), and
// generateHabitCreationWindows (windows.bulkWrite).
function makeAssignmentDb({ assignments = [], questionnaires = [] } = {}) {
  const bulk = [];
  return {
    _bulk: bulk,
    collection(name) {
      if (name === 'questionnaire_assignments') {
        return { find: () => ({ toArray: async () => assignments }) };
      }
      if (name === 'questionnaires') {
        return { find: () => ({ toArray: async () => questionnaires }) };
      }
      if (name === 'questionnaire_windows') {
        return {
          bulkWrite: async (ops) => {
            bulk.push(...ops);
          },
        };
      }
      throw new Error(`unexpected collection: ${name}`);
    },
  };
}

test('srhiHabitScopeActive: true only when an active SRHI assignment is habit-scoped', async () => {
  const studyId = new ObjectId();
  const srhiId = new ObjectId();
  const on = makeAssignmentDb({
    assignments: [
      { questionnaireId: srhiId, questionnaireSlug: 'srhi', groupId: null },
    ],
    questionnaires: [{ _id: srhiId, scope: 'habit' }],
  });
  assert.strictEqual(
    await srhiHabitScopeActive({ db: on, studyId, groupId: null }),
    true
  );

  // SRHI assignment exists but its questionnaire is study-scoped.
  const notHabitScoped = makeAssignmentDb({
    assignments: [
      { questionnaireId: srhiId, questionnaireSlug: 'srhi', groupId: null },
    ],
    questionnaires: [{ _id: srhiId, scope: 'study' }],
  });
  assert.strictEqual(
    await srhiHabitScopeActive({ db: notHabitScoped, studyId, groupId: null }),
    false
  );

  // Only a different, habit-scoped questionnaire is assigned — no SRHI.
  const sliqId = new ObjectId();
  const noSrhi = makeAssignmentDb({
    assignments: [
      { questionnaireId: sliqId, questionnaireSlug: 'sliq', groupId: null },
    ],
    questionnaires: [{ _id: sliqId, scope: 'habit' }],
  });
  assert.strictEqual(
    await srhiHabitScopeActive({ db: noSrhi, studyId, groupId: null }),
    false
  );
});

test('generateHabitCreationWindows: expands the full cadence for habit-scoped non-SRHI questionnaires, anchored at createdAt + HABIT_ANCHOR_DELAY_MS', async () => {
  const studyId = new ObjectId();
  const intentionId = new ObjectId();
  const createdAt = new Date('2026-07-14T10:00:00.000Z');
  const sliqId = new ObjectId();
  const srhiId = new ObjectId();
  const assignmentId = new ObjectId();
  const db = makeAssignmentDb({
    assignments: [
      {
        _id: assignmentId,
        questionnaireId: sliqId,
        questionnaireSlug: 'sliq',
        questionnaireTitle: 'SLIQ',
        cadence: { mode: 'interval', intervalDays: 7, occurrences: 3 },
        groupId: null,
      },
      // SRHI is excluded here (handled by its own pipeline) even though
      // it's habit-scoped too.
      {
        _id: new ObjectId(),
        questionnaireId: srhiId,
        questionnaireSlug: 'srhi',
        cadence: { mode: 'interval', intervalDays: 7, occurrences: 4 },
        groupId: null,
      },
    ],
    questionnaires: [
      { _id: sliqId, scope: 'habit' },
      { _id: srhiId, scope: 'habit' },
    ],
  });
  const created = await generateHabitCreationWindows({
    db,
    userId: 'u1',
    studyId,
    groupId: null,
    intentionId,
    createdAt,
  });
  assert.deepStrictEqual(
    created.map((c) => c.questionnaireSlug),
    ['sliq']
  );
  // 3 occurrences from the cadence, not just occurrence 1.
  assert.strictEqual(db._bulk.length, 3);
  const [op1, op2, op3] = db._bulk.map((o) => o.updateOne);
  assert.strictEqual(op1.filter.userId, 'u1');
  assert.strictEqual(op1.update.$setOnInsert.occurrence, 1);
  assert.deepStrictEqual(
    op1.update.$setOnInsert.scheduledFor,
    new Date(createdAt.getTime() + HABIT_ANCHOR_DELAY_MS)
  );
  assert.strictEqual(op2.update.$setOnInsert.occurrence, 2);
  assert.deepStrictEqual(
    op2.update.$setOnInsert.scheduledFor,
    new Date(
      createdAt.getTime() + HABIT_ANCHOR_DELAY_MS + 7 * 24 * 60 * 60 * 1000
    )
  );
  assert.strictEqual(op3.update.$setOnInsert.occurrence, 3);
});

test('generateHabitCreationWindows: no-op when no habit-scoped assignments', async () => {
  const sliqId = new ObjectId();
  const db = makeAssignmentDb({
    assignments: [
      {
        _id: new ObjectId(),
        questionnaireId: sliqId,
        questionnaireSlug: 'sliq',
        cadence: { mode: 'interval', intervalDays: 7, occurrences: 1 },
        groupId: null,
      },
    ],
    // Study-scoped, not habit-scoped — excluded.
    questionnaires: [{ _id: sliqId, scope: 'study' }],
  });
  const created = await generateHabitCreationWindows({
    db,
    userId: 'u1',
    studyId: new ObjectId(),
    groupId: null,
    intentionId: new ObjectId(),
    createdAt: new Date(),
  });
  assert.deepStrictEqual(created, []);
  assert.strictEqual(db._bulk.length, 0);
});

// ── continuous cadences ─────────────────────────────────────────────────────

test('scheduleOffsets: continuous cadence generates exactly 12 offsets, ignoring occurrences', async () => {
  const offsets = scheduleOffsets({
    mode: 'interval',
    startOffsetDays: 3,
    intervalDays: 7,
    continuous: true,
    occurrences: 999, // should be ignored
  });
  assert.strictEqual(offsets.length, 12);
  assert.strictEqual(offsets[0], 3);
  assert.strictEqual(offsets[1], 10);
  assert.strictEqual(offsets[11], 3 + 11 * 7);
});

test('scheduleOffsets: non-continuous cadence respects occurrences as before', async () => {
  const offsets = scheduleOffsets({
    mode: 'interval',
    intervalDays: 7,
    occurrences: 3,
  });
  assert.deepStrictEqual(offsets, [0, 7, 14]);
});

function makeTopUpDb({ assignment, windows = [] } = {}) {
  const bulk = [];
  return {
    _bulk: bulk,
    collection(name) {
      if (name === 'questionnaire_assignments') {
        return { findOne: async () => assignment };
      }
      if (name === 'questionnaire_windows') {
        return {
          countDocuments: async () =>
            windows.filter((w) => w.submittedAt === null).length,
          find: () => ({
            sort: () => ({
              limit: () => ({
                toArray: async () =>
                  windows.length
                    ? [
                        windows.reduce((a, b) =>
                          a.occurrence > b.occurrence ? a : b
                        ),
                      ]
                    : [],
              }),
            }),
          }),
          bulkWrite: async (ops) => {
            bulk.push(...ops);
          },
        };
      }
      throw new Error(`unexpected collection: ${name}`);
    },
  };
}

test('topUpContinuousWindows: no-op for a non-continuous assignment', async () => {
  const assignmentId = new ObjectId();
  const db = makeTopUpDb({
    assignment: {
      _id: assignmentId,
      active: true,
      cadence: { mode: 'interval', intervalDays: 7, occurrences: 8 },
    },
  });
  const count = await topUpContinuousWindows({
    db,
    userId: 'u1',
    assignmentId,
  });
  assert.strictEqual(count, 0);
  assert.strictEqual(db._bulk.length, 0);
});

test('topUpContinuousWindows: no-op for an inactive assignment', async () => {
  const assignmentId = new ObjectId();
  const db = makeTopUpDb({
    assignment: {
      _id: assignmentId,
      active: false,
      cadence: { mode: 'interval', intervalDays: 7, continuous: true },
    },
  });
  const count = await topUpContinuousWindows({
    db,
    userId: 'u1',
    assignmentId,
  });
  assert.strictEqual(count, 0);
});

test('topUpContinuousWindows: no-op when the buffer is already full', async () => {
  const assignmentId = new ObjectId();
  const windows = Array.from({ length: 12 }, (_, i) => ({
    occurrence: i + 1,
    submittedAt: null,
    scheduledFor: new Date(2026, 0, 1 + i * 7),
    studyId: new ObjectId(),
    groupId: null,
    questionnaireId: new ObjectId(),
    questionnaireSlug: 'sliq',
  }));
  const db = makeTopUpDb({
    assignment: {
      _id: assignmentId,
      active: true,
      cadence: { mode: 'interval', intervalDays: 7, continuous: true },
    },
    windows,
  });
  const count = await topUpContinuousWindows({
    db,
    userId: 'u1',
    assignmentId,
  });
  assert.strictEqual(count, 0);
});

test('topUpContinuousWindows: tops up the buffer to 12 when below', async () => {
  const assignmentId = new ObjectId();
  const windows = Array.from({ length: 5 }, (_, i) => ({
    occurrence: i + 1,
    submittedAt: null,
    scheduledFor: new Date(Date.UTC(2026, 0, 1 + i * 7)),
    studyId: new ObjectId(),
    groupId: null,
    questionnaireId: new ObjectId(),
    questionnaireSlug: 'sliq',
  }));
  const db = makeTopUpDb({
    assignment: {
      _id: assignmentId,
      active: true,
      cadence: { mode: 'interval', intervalDays: 7, continuous: true },
    },
    windows,
  });
  const count = await topUpContinuousWindows({
    db,
    userId: 'u1',
    assignmentId,
  });
  assert.strictEqual(count, 7);
  assert.strictEqual(db._bulk.length, 7);
  const first = db._bulk[0].updateOne;
  assert.strictEqual(first.filter.occurrence, 6);
  assert.deepStrictEqual(
    first.update.$setOnInsert.scheduledFor,
    new Date(Date.UTC(2026, 0, 1 + 4 * 7) + 7 * 24 * 60 * 60 * 1000)
  );
});
