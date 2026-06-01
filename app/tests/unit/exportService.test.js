import { test } from 'node:test';
import assert from 'node:assert';
import { ObjectId } from 'mongodb';
import {
  buildSrhiCsv,
  buildDailyLogsCsv,
  buildDropoutCsv,
} from '../../services/exportService.js';

function makeDb({
  srhi = [],
  logs = [],
  enrollments = [],
  intentions = [],
} = {}) {
  return {
    collection(name) {
      if (name === 'srhi_responses')
        return { find: (f) => ({ toArray: async () => srhi }) };
      if (name === 'daily_behavior_logs')
        return { find: (f) => ({ toArray: async () => logs }) };
      if (name === 'enrollments')
        return { find: (f) => ({ toArray: async () => enrollments }) };
      if (name === 'implementation_intentions')
        return { find: (f) => ({ toArray: async () => intentions }) };
      throw new Error(`unexpected: ${name}`);
    },
  };
}

test('buildSrhiCsv: includes header and a data row', async () => {
  const intentionId = new ObjectId();
  const db = makeDb({
    srhi: [
      {
        intentionId,
        userId: 'u1',
        weekNumber: 1,
        scheduledFor: new Date('2026-01-01'),
        submittedAt: new Date('2026-01-02'),
        score: 4.5,
        studyId: null,
        groupId: null,
      },
    ],
    enrollments: [
      {
        userId: 'u1',
        studyId: null,
        groupId: null,
        cueConfig: { cueSource: 'high_quality', cueCount: 'single' },
      },
    ],
  });
  const csv = await buildSrhiCsv({ db, studyId: null });
  assert.ok(csv.includes('userId'), 'missing header');
  assert.ok(csv.includes('u1'), 'missing data row');
  assert.ok(csv.includes('4.5'), 'missing score');
});

test('buildSrhiCsv: missing windows appear as NA rows', async () => {
  const intentionId = new ObjectId();
  const db = makeDb({
    srhi: [
      {
        intentionId,
        userId: 'u1',
        weekNumber: 1,
        scheduledFor: new Date('2026-01-01'),
        submittedAt: null,
        score: null,
        studyId: null,
        groupId: null,
      },
    ],
    enrollments: [
      { userId: 'u1', studyId: null, groupId: null, cueConfig: null },
    ],
  });
  const csv = await buildSrhiCsv({ db, studyId: null });
  assert.ok(csv.includes('TRUE'), 'missed=TRUE missing');
});

test('buildDropoutCsv: marks dropped participants', async () => {
  const db = makeDb({
    enrollments: [
      {
        userId: 'u1',
        studyId: null,
        groupId: null,
        enrolledAt: new Date('2026-01-01'),
        lastActiveAt: new Date('2026-01-15'),
        droppedOutAt: new Date('2026-01-30'),
        cueConfig: null,
      },
    ],
  });
  const csv = await buildDropoutCsv({ db, studyId: null });
  assert.ok(csv.includes('TRUE'), 'dropped=TRUE missing');
  assert.ok(csv.includes('u1'));
});
