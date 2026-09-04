import { test } from 'node:test';
import assert from 'node:assert';
import { ObjectId } from 'mongodb';
import {
  buildSrhiCsv,
  buildDropoutCsv,
  buildQuestionnaireResponsesCsv,
} from '../../services/exportService.js';

function makeDb({
  srhi = [],
  logs = [],
  enrollments = [],
  intentions = [],
  formResponses = [],
} = {}) {
  return {
    collection(name) {
      if (name === 'srhi_responses')
        return { find: (_f) => ({ toArray: async () => srhi }) };
      if (name === 'daily_behavior_logs')
        return { find: (_f) => ({ toArray: async () => logs }) };
      if (name === 'enrollments')
        return { find: (_f) => ({ toArray: async () => enrollments }) };
      if (name === 'implementation_intentions')
        return { find: (_f) => ({ toArray: async () => intentions }) };
      if (name === 'form_responses')
        return {
          find: (_f) => ({
            sort: () => ({ toArray: async () => formResponses }),
          }),
        };
      if (name === 'studies') return { findOne: async () => null };
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

test('buildQuestionnaireResponsesCsv: includes header, one row per response, and flattens answers', async () => {
  const db = makeDb({
    enrollments: [
      { userId: 'u1', group: 'G1', studyId: null, cueConfig: null },
      { userId: 'u2', group: 'G2', studyId: null, cueConfig: null },
    ],
    formResponses: [
      {
        userId: 'u1',
        questionnaireSlug: 'baseline',
        submittedAt: new Date('2026-01-01T10:00:00Z'),
        answers: { q1: 3, q2: 'yes' },
      },
      {
        userId: 'u2',
        questionnaireSlug: 'followup',
        submittedAt: new Date('2026-01-02T10:00:00Z'),
        answers: { q1: 5 },
      },
    ],
  });
  const csv = await buildQuestionnaireResponsesCsv({ db, studyId: null });
  const lines = csv.trim().split('\n');
  assert.strictEqual(lines.length, 3, 'header + 2 data rows');
  assert.ok(lines[0].includes('userId'), 'header must include userId');
  assert.ok(
    lines[0].includes('questionnaireSlug'),
    'header must include questionnaireSlug'
  );
  assert.ok(lines[0].includes('answer_q1'), 'header must include answer_q1');
  assert.ok(lines[0].includes('answer_q2'), 'header must include answer_q2');
  assert.ok(csv.includes('u1'), 'missing u1 row');
  assert.ok(csv.includes('u2'), 'missing u2 row');
  assert.ok(csv.includes('baseline'), 'missing questionnaire slug');
});

test('buildQuestionnaireResponsesCsv: returns empty CSV when no responses', async () => {
  const db = makeDb({
    enrollments: [
      { userId: 'u1', group: 'G1', studyId: null, cueConfig: null },
    ],
    formResponses: [],
  });
  const csv = await buildQuestionnaireResponsesCsv({ db, studyId: null });
  assert.ok(typeof csv === 'string', 'should return a string');
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

test('buildQuestionnaireResponsesCsv: emits groupId from the real enrollment field', async () => {
  // Regression: this builder used to read `e.group`, which enrollment
  // documents never carry (the field is `groupId`, an ObjectId ref into
  // studies.groups[].id), so the column rendered 'NA' for every row. The
  // three sibling CSVs derive `groupLabel` from cueConfig; this one now
  // emits both so all four are joinable.
  const groupId = new ObjectId();
  const db = makeDb({
    enrollments: [
      {
        userId: 'u1',
        studyId: null,
        groupId,
        cueConfig: { cueSource: 'high_quality', cueCount: 'single' },
      },
    ],
    formResponses: [
      {
        userId: 'u1',
        questionnaireSlug: 'baseline',
        submittedAt: new Date('2026-01-01T10:00:00Z'),
        answers: { q1: 3 },
      },
    ],
  });

  const csv = await buildQuestionnaireResponsesCsv({ db, studyId: null });
  const [header, row] = csv.trim().split('\n');

  assert.ok(header.includes('groupId'), 'header must include groupId');
  assert.ok(header.includes('groupLabel'), 'header must include groupLabel');
  assert.ok(
    !header.includes(',group,'),
    'the bogus `group` column must be gone'
  );
  assert.ok(row.includes(groupId.toString()), 'groupId value must be present');
  assert.ok(
    row.includes('high_quality/single'),
    'groupLabel must match the sibling CSVs’ derivation'
  );
});

test('buildQuestionnaireResponsesCsv: unenrolled user yields NA group columns', async () => {
  const db = makeDb({
    enrollments: [],
    formResponses: [
      {
        userId: 'ghost',
        questionnaireSlug: 'baseline',
        submittedAt: new Date('2026-01-01T10:00:00Z'),
        answers: { q1: 1 },
      },
    ],
  });
  const csv = await buildQuestionnaireResponsesCsv({ db, studyId: null });
  const row = csv.trim().split('\n')[1];
  assert.ok(row.includes('NA'), 'missing enrollment must degrade to NA');
});

/* ── Verified-identity studies ─────────────────────────────────────────────
 * Researchers must see the study-local subject code, never the raw Keycloak
 * sub — the sub is the join key into every other system, and an export travels
 * far more freely than the database it came from.
 */

const VERIFIED_STUDY_ID = new ObjectId();

function makeVerifiedDb(overrides = {}) {
  const base = makeDb(overrides);
  const study = {
    _id: VERIFIED_STUDY_ID,
    identity: { mode: 'verified', subjectCodePrefix: 'TUD-DFG01' },
  };
  return {
    collection(name) {
      if (name === 'studies')
        return {
          async findOne() {
            return study;
          },
        };
      return base.collection(name);
    },
  };
}

test('verified study: SRHI export uses subjectCode and withholds the raw sub', async () => {
  const intentionId = new ObjectId();
  const db = makeVerifiedDb({
    enrollments: [
      {
        userId: 'kc-sub-1',
        studyId: VERIFIED_STUDY_ID,
        subjectCode: 'TUD-DFG01-0042',
        cueConfig: null,
      },
    ],
    srhi: [
      {
        intentionId,
        userId: 'kc-sub-1',
        studyId: VERIFIED_STUDY_ID,
        weekNumber: 1,
        score: 4.2,
        submittedAt: new Date('2026-01-01T10:00:00Z'),
        scheduledFor: new Date('2026-01-01T00:00:00Z'),
      },
    ],
  });

  const csv = await buildSrhiCsv({ db, studyId: VERIFIED_STUDY_ID.toString() });
  assert.ok(csv.includes('subjectCode'), 'header must carry subjectCode');
  assert.ok(csv.includes('TUD-DFG01-0042'), 'the code must be present');
  assert.ok(!csv.includes('kc-sub-1'), 'the raw Keycloak sub must NOT appear');
  assert.ok(!/(^|,)userId(,|$)/m.test(csv.split('\n')[0]), 'no userId column');
});

test('verified study: dropout export uses subjectCode', async () => {
  const db = makeVerifiedDb({
    enrollments: [
      {
        userId: 'kc-sub-1',
        studyId: VERIFIED_STUDY_ID,
        subjectCode: 'TUD-DFG01-0042',
        enrolledAt: new Date('2026-01-01'),
        droppedOutAt: null,
      },
    ],
  });
  const csv = await buildDropoutCsv({
    db,
    studyId: VERIFIED_STUDY_ID.toString(),
  });
  assert.ok(csv.includes('TUD-DFG01-0042'));
  assert.ok(!csv.includes('kc-sub-1'));
});

test('verified study: an enrolment missing its subject code degrades to NA, not to the sub', async () => {
  // Fail closed. A gap in the register must never fall back to leaking the sub.
  const db = makeVerifiedDb({
    enrollments: [
      { userId: 'kc-sub-1', studyId: VERIFIED_STUDY_ID, droppedOutAt: null },
    ],
  });
  const csv = await buildDropoutCsv({
    db,
    studyId: VERIFIED_STUDY_ID.toString(),
  });
  assert.ok(csv.includes('NA'));
  assert.ok(!csv.includes('kc-sub-1'));
});

test('anonymous study: export shape is unchanged', async () => {
  // No existing export may change shape because this feature exists.
  const db = makeDb({
    enrollments: [
      {
        userId: 'u1',
        studyId: null,
        cueConfig: null,
        droppedOutAt: null,
        enrolledAt: new Date(),
      },
    ],
  });
  const csv = await buildDropoutCsv({ db, studyId: null });
  assert.ok(csv.split('\n')[0].includes('userId'), 'userId column retained');
  assert.ok(csv.includes('u1'));
  assert.ok(!csv.includes('subjectCode'));
});
