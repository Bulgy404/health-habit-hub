import { test } from 'node:test';
import assert from 'node:assert';
import { resolveHabitConfig } from '../../services/habitConfigService.js';

const studyCueConfig = {
  cueCount: 'single',
  cueSource: 'high_quality',
  cuePoolId: null,
  maxHabits: 1,
};

const defaultActivityTypes = [
  { key: 'walking', label_en: 'Walking' },
  { key: 'yoga', label_en: 'Yoga' },
];

function makeDb({
  enrollment = null,
  study = null,
  adminSettings = [],
  cuePools = [],
  appSettings = null,
  activityTypes = defaultActivityTypes,
} = {}) {
  return {
    collection(name) {
      if (name === 'enrollments')
        return {
          findOne: async () => enrollment,
        };
      if (name === 'studies')
        return {
          findOne: async () => study,
        };
      if (name === 'admin_settings')
        return {
          find: () => ({ toArray: async () => adminSettings }),
        };
      if (name === 'cue_pools')
        return {
          aggregate: () => ({ toArray: async () => cuePools }),
        };
      if (name === 'app_settings')
        return {
          findOne: async () => appSettings,
        };
      if (name === 'activity_types')
        return {
          find: () => ({ toArray: async () => activityTypes }),
        };
      throw new Error(`unexpected collection: ${name}`);
    },
  };
}

test('resolveHabitConfig: study participant gets group cueConfig', async () => {
  const { ObjectId } = await import('../../models/survey.js');
  const studyId = new ObjectId();
  const groupId = new ObjectId();
  const db = makeDb({
    study: {
      _id: studyId,
      recommenderEnabled: true,
      habitEntryMode: 'structured',
      structuredActivityKeys: ['walking', 'yoga'],
      groups: [
        { id: groupId, label: 'G1', index: 1, cueConfig: studyCueConfig },
      ],
    },
  });
  const neo4jRun = async () => [
    {
      studyId: studyId.toString(),
      groupId: groupId.toString(),
      enrolledAt: null,
      studyCodeUsed: null,
    },
  ];
  const config = await resolveHabitConfig({ db, userId: 'u1', neo4jRun });
  assert.equal(config.cueCount, 'single');
  assert.equal(config.cueSource, 'high_quality');
  assert.equal(config.maxHabits, 1);
  assert.deepEqual(config.behaviorOptions, [
    { key: 'walking', label: 'Walking' },
    { key: 'yoga', label: 'Yoga' },
  ]);
});

test('resolveHabitConfig: behaviorOptions resolve to the requested language, falling back to English then the raw key', async () => {
  const { ObjectId } = await import('../../models/survey.js');
  const studyId = new ObjectId();
  const groupId = new ObjectId();
  const db = makeDb({
    study: {
      _id: studyId,
      recommenderEnabled: true,
      habitEntryMode: 'structured',
      structuredActivityKeys: ['walking', 'yoga', 'swimming'],
      groups: [
        { id: groupId, label: 'G1', index: 1, cueConfig: studyCueConfig },
      ],
    },
    activityTypes: [
      { key: 'walking', label_en: 'Walking', label_de: 'Spazieren gehen' },
      { key: 'yoga', label_en: 'Yoga' }, // no German translation yet
      // 'swimming' isn't in the catalog at all (e.g. deleted after being assigned)
    ],
  });
  const neo4jRun = async () => [
    {
      studyId: studyId.toString(),
      groupId: groupId.toString(),
      enrolledAt: null,
      studyCodeUsed: null,
    },
  ];
  const config = await resolveHabitConfig({
    db,
    userId: 'u1',
    neo4jRun,
    lang: 'de',
  });
  assert.deepEqual(config.behaviorOptions, [
    { key: 'walking', label: 'Spazieren gehen' },
    { key: 'yoga', label: 'Yoga' }, // falls back to English
    { key: 'swimming', label: 'swimming' }, // falls back to the raw key
  ]);
});

test('resolveHabitConfig: structuredActivityKeys are ignored when habitEntryMode is freeText', async () => {
  const { ObjectId } = await import('../../models/survey.js');
  const studyId = new ObjectId();
  const groupId = new ObjectId();
  const db = makeDb({
    study: {
      _id: studyId,
      recommenderEnabled: true,
      habitEntryMode: 'freeText',
      // Present but should be ignored — the toggle, not the list, decides.
      structuredActivityKeys: ['walking', 'yoga'],
      groups: [
        { id: groupId, label: 'G1', index: 1, cueConfig: studyCueConfig },
      ],
    },
  });
  const neo4jRun = async () => [
    {
      studyId: studyId.toString(),
      groupId: groupId.toString(),
      enrolledAt: null,
      studyCodeUsed: null,
    },
  ];
  const config = await resolveHabitConfig({ db, userId: 'u1', neo4jRun });
  assert.deepEqual(config.behaviorOptions, []);
});

test('resolveHabitConfig: public user gets free-entry config', async () => {
  const db = makeDb({
    enrollment: { groupId: 'g0', studyId: 's0', cueConfig: null },
  });
  const config = await resolveHabitConfig({ db, userId: 'u2' });
  assert.equal(config.cueCount, 'multi');
  assert.equal(config.cueSource, 'self_selected');
  assert.equal(config.maxHabits, null);
  // Empty behaviorOptions signals free habit entry (no catalog picker).
  assert.deepEqual(config.behaviorOptions, []);
});

test('resolveHabitConfig: no enrollment returns free-entry config', async () => {
  const db = makeDb({ enrollment: null });
  const config = await resolveHabitConfig({ db, userId: 'u3' });
  assert.equal(config.cueCount, 'multi');
  assert.equal(config.cueSource, 'self_selected');
  assert.equal(config.maxHabits, null);
  assert.deepEqual(config.behaviorOptions, []);
  assert.deepEqual(config.assignedCues, []);
});

test('resolveHabitConfig: recommenderEnabled defaults to true', async () => {
  // No enrolment, and study with the flag absent → enabled.
  const db = makeDb({ enrollment: null, adminSettings: [] });
  const config = await resolveHabitConfig({ db, userId: 'u1' });
  assert.equal(config.recommenderEnabled, true);
});

test('resolveHabitConfig: recommenderEnabled is false when study disables it', async () => {
  const { ObjectId } = await import('../../models/survey.js');
  const studyId = new ObjectId();
  const groupId = new ObjectId();
  const db = makeDb({
    study: { _id: studyId, recommenderEnabled: false, groups: [] },
  });
  const neo4jRun = async () => [
    {
      studyId: studyId.toString(),
      groupId: groupId.toString(),
      enrolledAt: null,
      studyCodeUsed: null,
    },
  ];
  const config = await resolveHabitConfig({ db, userId: 'u1', neo4jRun });
  assert.equal(config.recommenderEnabled, false);
});

test('resolveHabitConfig: app feature flags default to true without app_settings doc', async () => {
  const db = makeDb({ enrollment: null, adminSettings: [], appSettings: null });
  const config = await resolveHabitConfig({ db, userId: 'u1' });
  assert.equal(config.guidedHabitCreationEnabled, true);
  assert.equal(config.communityShareDefault, true);
});

test('resolveHabitConfig: app feature flags reflect the app_settings doc', async () => {
  const db = makeDb({
    enrollment: null,
    adminSettings: [],
    appSettings: {
      key: 'global',
      guidedHabitCreationEnabled: false,
      communityShareDefault: false,
    },
  });
  const config = await resolveHabitConfig({ db, userId: 'u1' });
  assert.equal(config.guidedHabitCreationEnabled, false);
  assert.equal(config.communityShareDefault, false);
});

test('resolveHabitConfig: app feature flags fall back to defaults when the read fails', async () => {
  // makeDb throws for app_settings when the collection is not stubbed —
  // simulate that by overriding collection() for this name.
  const base = makeDb({ enrollment: null, adminSettings: [] });
  const db = {
    collection(name) {
      if (name === 'app_settings') throw new Error('db unreachable');
      return base.collection(name);
    },
  };
  const config = await resolveHabitConfig({ db, userId: 'u1' });
  assert.equal(config.guidedHabitCreationEnabled, true);
  assert.equal(config.communityShareDefault, true);
});

test('resolveHabitConfig: pre-rated study participant gets assignedCues from pool', async () => {
  const { ObjectId } = await import('../../models/survey.js');
  const studyId = new ObjectId();
  const groupId = new ObjectId();
  const db = makeDb({
    study: {
      _id: studyId,
      recommenderEnabled: true,
      groups: [
        { id: groupId, label: 'G1', index: 1, cueConfig: studyCueConfig },
      ],
    },
    cuePools: [
      {
        _id: 'pool-1',
        text: { en: 'After dinner' },
        languages: ['en'],
        quality: 'high',
      },
    ],
  });
  const neo4jRun = async () => [
    {
      studyId: studyId.toString(),
      groupId: groupId.toString(),
      enrolledAt: null,
      studyCodeUsed: null,
    },
  ];
  const config = await resolveHabitConfig({ db, userId: 'u1', neo4jRun });
  assert.equal(config.assignedCues.length, 1);
  assert.equal(config.assignedCues[0].text, 'After dinner');
  assert.equal(config.assignedCues[0].source, 'pre_rated');
});

test('resolveHabitConfig: self_selected participant gets empty assignedCues', async () => {
  const db = {
    collection(name) {
      if (name === 'enrollments')
        return {
          findOne: async () => ({
            groupId: 'g1',
            studyId: 's1',
            cueConfig: {
              cueCount: 'single',
              cueSource: 'self_selected',
              cuePoolId: null,
              behaviorOptions: ['walking'],
              maxHabits: 1,
            },
          }),
        };
      if (name === 'cue_pools')
        return {
          aggregate: () => ({ toArray: async () => [] }),
        };
      if (name === 'admin_settings')
        return { find: () => ({ toArray: async () => [] }) };
      if (name === 'studies')
        return { findOne: async () => ({ recommenderEnabled: true }) };
      throw new Error(`unexpected: ${name}`);
    },
  };
  const config = await resolveHabitConfig({ db, userId: 'u2' });
  assert.deepEqual(config.assignedCues, []);
});

test('resolveHabitConfig: public user gets empty assignedCues', async () => {
  // Extend the existing makeDb pattern with cue_pools support
  const db = {
    collection(name) {
      if (name === 'enrollments')
        return {
          findOne: async () => ({
            groupId: 'g0',
            studyId: 's0',
            cueConfig: null,
          }),
        };
      // _resolveGroupCueConfig falls back to the study when enrollment.cueConfig is null.
      // Return a study whose group has no cueConfig so we fall through to admin_settings.
      if (name === 'studies')
        return {
          findOne: async () => ({
            groups: [{ id: { toString: () => 'g0' }, label: 'G1', index: 1 }],
          }),
        };
      if (name === 'admin_settings')
        return {
          find: () => ({
            toArray: async () => [
              { key: 'default_cue_count', value: 'multi' },
              { key: 'default_cue_source', value: 'high_quality' },
            ],
          }),
        };
      if (name === 'cue_pools')
        return { aggregate: () => ({ toArray: async () => [] }) };
      throw new Error(`unexpected: ${name}`);
    },
  };
  const config = await resolveHabitConfig({ db, userId: 'u3' });
  assert.deepEqual(config.assignedCues, []);
});

// ── habitReminder resolution ─────────────────────────────────────────────────

test('resolveHabitConfig: public/unenrolled user gets fully participant-chosen habitReminder', async () => {
  const db = makeDb({ enrollment: null });
  const config = await resolveHabitConfig({ db, userId: 'public-user' });
  assert.deepEqual(config.habitReminder, {
    mode: 'participant_choice',
    time: null,
  });
});

test('resolveHabitConfig: study-level habitReminder mode applies when the group has no override', async () => {
  const { ObjectId } = await import('../../models/survey.js');
  const studyId = new ObjectId();
  const groupId = new ObjectId();
  const db = makeDb({
    study: {
      _id: studyId,
      recommenderEnabled: true,
      reminders: { habit: { mode: 'admin_fixed', time: '07:30' } },
      groups: [{ id: groupId, label: 'G1', index: 1, reminders: null }],
    },
  });
  const neo4jRun = async () => [
    { studyId: studyId.toString(), groupId: groupId.toString() },
  ];
  const config = await resolveHabitConfig({ db, userId: 'u1', neo4jRun });
  assert.deepEqual(config.habitReminder, {
    mode: 'admin_fixed',
    time: '07:30',
  });
});

test('resolveHabitConfig: group-level habitReminder override wins over the study-level setting', async () => {
  const { ObjectId } = await import('../../models/survey.js');
  const studyId = new ObjectId();
  const groupId = new ObjectId();
  const db = makeDb({
    study: {
      _id: studyId,
      recommenderEnabled: true,
      reminders: { habit: { mode: 'admin_fixed', time: '07:30' } },
      groups: [
        {
          id: groupId,
          label: 'G1',
          index: 1,
          reminders: { habit: { mode: 'off', time: null } },
        },
      ],
    },
  });
  const neo4jRun = async () => [
    { studyId: studyId.toString(), groupId: groupId.toString() },
  ];
  const config = await resolveHabitConfig({ db, userId: 'u1', neo4jRun });
  assert.deepEqual(config.habitReminder, { mode: 'off', time: null });
});

test('resolveHabitConfig: habitReminder supports all 3 modes', async () => {
  const { ObjectId } = await import('../../models/survey.js');
  const modes = [
    { mode: 'off', time: null },
    { mode: 'participant_choice', time: null },
    { mode: 'admin_fixed', time: '20:00' },
  ];
  for (const habit of modes) {
    const studyId = new ObjectId();
    const groupId = new ObjectId();
    const db = makeDb({
      study: {
        _id: studyId,
        recommenderEnabled: true,
        reminders: { habit },
        groups: [{ id: groupId, label: 'G1', index: 1, reminders: null }],
      },
    });
    const neo4jRun = async () => [
      { studyId: studyId.toString(), groupId: groupId.toString() },
    ];
    const config = await resolveHabitConfig({ db, userId: 'u1', neo4jRun });
    assert.deepEqual(config.habitReminder, habit);
  }
});
