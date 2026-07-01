import { test } from 'node:test';
import assert from 'node:assert';
import { resolveHabitConfig } from '../../services/habitConfigService.js';
import { DEFAULT_BEHAVIOR_KEYS } from '../../utils/srhi.js';

const studyCueConfig = {
  cueCount: 'single',
  cueSource: 'high_quality',
  cuePoolId: null,
  behaviorOptions: ['walking', 'yoga'],
  maxHabits: 1,
};

function makeDb({
  enrollment = null,
  study = null,
  adminSettings = [],
  cuePools = [],
  appSettings = null,
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
  assert.deepEqual(config.behaviorOptions, ['walking', 'yoga']);
});

test('resolveHabitConfig: public user gets admin default', async () => {
  const db = makeDb({
    enrollment: { groupId: 'g0', studyId: 's0', cueConfig: null },
    adminSettings: [
      { key: 'default_cue_count', value: 'multi' },
      { key: 'default_cue_source', value: 'high_quality' },
    ],
  });
  const config = await resolveHabitConfig({ db, userId: 'u2' });
  assert.equal(config.cueCount, 'multi');
  assert.equal(config.cueSource, 'high_quality');
  assert.equal(config.maxHabits, null);
  assert.deepEqual(config.behaviorOptions, DEFAULT_BEHAVIOR_KEYS);
});

test('resolveHabitConfig: no enrollment returns hardcoded fallback', async () => {
  const db = makeDb({ enrollment: null, adminSettings: [] });
  const config = await resolveHabitConfig({ db, userId: 'u3' });
  assert.equal(config.cueCount, 'multi');
  assert.equal(config.cueSource, 'high_quality');
  assert.equal(config.maxHabits, null);
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
  const db = {
    collection(name) {
      if (name === 'enrollments')
        return {
          findOne: async () => ({
            groupId: 'g1',
            studyId: 's1',
            cueConfig: {
              cueCount: 'single',
              cueSource: 'high_quality',
              cuePoolId: null,
              behaviorOptions: ['walking'],
              maxHabits: 1,
            },
          }),
        };
      if (name === 'cue_pools')
        return {
          aggregate: () => ({
            toArray: async () => [
              { _id: 'pool-1', text: 'After dinner', quality: 'high' },
            ],
          }),
        };
      if (name === 'admin_settings')
        return { find: () => ({ toArray: async () => [] }) };
      if (name === 'studies')
        return { findOne: async () => ({ recommenderEnabled: true }) };
      throw new Error(`unexpected: ${name}`);
    },
  };
  const config = await resolveHabitConfig({ db, userId: 'u1' });
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
