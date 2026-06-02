// app/services/habitConfigService.js
import { COLLECTION as ENROLLMENTS } from '../models/enrollment.js';
import { DEFAULT_BEHAVIOR_KEYS } from '../utils/srhi.js';
import { pickAssignedCues } from './cuePoolService.js';

const FALLBACK = {
  cueCount: 'multi',
  cueSource: 'high_quality',
  cuePoolId: null,
  behaviorOptions: DEFAULT_BEHAVIOR_KEYS,
  maxHabits: null,
};

async function readAdminSettings(db) {
  const docs = await db
    .collection('admin_settings')
    .find({
      key: {
        $in: [
          'default_cue_count',
          'default_cue_source',
          'default_reminder_time',
        ],
      },
    })
    .toArray();
  return Object.fromEntries(docs.map((d) => [d.key, d.value]));
}

/**
 * Resolve cue configuration for a user, including pre-sampled assigned cues.
 * Priority: enrollment.cueConfig > admin_settings defaults > hardcoded fallback.
 */
export async function resolveHabitConfig({ db, userId }) {
  const enrollment = await db.collection(ENROLLMENTS).findOne({ userId });

  let cueCount, cueSource, cuePoolId, behaviorOptions, maxHabits;

  if (enrollment?.cueConfig) {
    cueCount = enrollment.cueConfig.cueCount;
    cueSource = enrollment.cueConfig.cueSource;
    cuePoolId = enrollment.cueConfig.cuePoolId ?? null;
    behaviorOptions =
      enrollment.cueConfig.behaviorOptions ?? DEFAULT_BEHAVIOR_KEYS;
    maxHabits = enrollment.cueConfig.maxHabits ?? null;
  } else {
    const settings = await readAdminSettings(db);
    cueCount = settings['default_cue_count'] ?? FALLBACK.cueCount;
    cueSource = settings['default_cue_source'] ?? FALLBACK.cueSource;
    cuePoolId = null;
    behaviorOptions = DEFAULT_BEHAVIOR_KEYS;
    maxHabits = null;
  }

  const assignedCues = await pickAssignedCues({
    db,
    cueSource,
    cueCount,
    cuePoolId,
  });

  return {
    cueCount,
    cueSource,
    cuePoolId,
    behaviorOptions,
    maxHabits,
    assignedCues,
  };
}
