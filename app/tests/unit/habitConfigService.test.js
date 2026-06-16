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
      throw new Error(`unexpected collection: ${name}`);
    },
  };
}

test('resolveHabitConfig: study participant gets group cueConfig', async () => {
  const groupId = 'g1';
  const db = makeDb({
    enrollment: { groupId, studyId: 's1', cueConfig: studyCueConfig },
  });
  const config = await resolveHabitConfig({ db, userId: 'u1' });
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
