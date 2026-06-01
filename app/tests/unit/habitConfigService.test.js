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

function makeDb({ enrollment = null, study = null, adminSettings = [] } = {}) {
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
