import { COLLECTION as ENROLLMENTS } from '../models/enrollment.js';
import { DEFAULT_BEHAVIOR_KEYS } from '../utils/srhi.js';

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
 * Resolve cue configuration for a user.
 * Priority: enrollment.cueConfig > admin_settings defaults > hardcoded fallback.
 * @param {{ db: object, userId: string }} deps
 */
export async function resolveHabitConfig({ db, userId }) {
  const enrollment = await db.collection(ENROLLMENTS).findOne({ userId });

  if (enrollment?.cueConfig) {
    return {
      cueCount: enrollment.cueConfig.cueCount,
      cueSource: enrollment.cueConfig.cueSource,
      cuePoolId: enrollment.cueConfig.cuePoolId ?? null,
      behaviorOptions:
        enrollment.cueConfig.behaviorOptions ?? DEFAULT_BEHAVIOR_KEYS,
      maxHabits: enrollment.cueConfig.maxHabits ?? null,
    };
  }

  const settings = await readAdminSettings(db);
  return {
    cueCount: settings['default_cue_count'] ?? FALLBACK.cueCount,
    cueSource: settings['default_cue_source'] ?? FALLBACK.cueSource,
    cuePoolId: null,
    behaviorOptions: DEFAULT_BEHAVIOR_KEYS,
    maxHabits: null,
  };
}
