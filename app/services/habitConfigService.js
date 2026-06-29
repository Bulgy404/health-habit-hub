// app/services/habitConfigService.js
import { COLLECTION as ENROLLMENTS } from '../models/enrollment.js';
import { COLLECTION as STUDIES } from '../models/study.js';
import { DEFAULT_BEHAVIOR_KEYS } from '../utils/srhi.js';
import { pickAssignedCues } from './cuePoolService.js';
import { getDefaultBehaviorKeys } from './activityTypeService.js';

const FALLBACK = {
  cueCount: 'multi',
  cueSource: 'high_quality',
  cuePoolId: null,
  behaviorOptions: DEFAULT_BEHAVIOR_KEYS, // static fallback if DB unreachable
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
 * Look up the group's cueConfig from the study document for a given enrollment.
 * Used as a fallback when the enrollment was created before cueConfig snapshotting.
 * @param {object} db
 * @param {{ studyId: ObjectId, groupId: ObjectId }} enrollment
 * @returns {Promise<object|null>}
 */
async function _resolveGroupCueConfig(db, enrollment) {
  if (!enrollment?.studyId || !enrollment?.groupId) return null;
  const study = await db
    .collection(STUDIES)
    .findOne({ _id: enrollment.studyId });
  const group = study?.groups?.find(
    (g) => g.id.toString() === enrollment.groupId.toString()
  );
  return group?.cueConfig ?? null;
}

/**
 * Resolve cue configuration for a user, including pre-sampled assigned cues.
 * Priority: enrollment.cueConfig (snapshot) > study group cueConfig (live) > admin_settings defaults > hardcoded fallback.
 * @param {{ db: object, userId: string }} deps
 * @returns {Promise<{ cueCount: string, cueSource: string, cuePoolId: string|null, behaviorOptions: Array, maxHabits: number|null, assignedCues: Array, recommenderEnabled: boolean }>}
 */
export async function resolveHabitConfig({ db, userId }) {
  const enrollment = await db
    .collection(ENROLLMENTS)
    .findOne({ userId: String(userId) });

  // Study-level feature flag: when a study disables the recommender, the app
  // hides the recommender screen for its participants. Absent flag (or no
  // enrolment / study) is treated as enabled for backward compatibility.
  let recommenderEnabled = true;
  if (enrollment?.studyId) {
    const study = await db
      .collection(STUDIES)
      .findOne(
        { _id: enrollment.studyId },
        { projection: { recommenderEnabled: 1 } }
      );
    if (study) recommenderEnabled = study.recommenderEnabled !== false;
  }

  let cueCount, cueSource, cuePoolId, behaviorOptions, maxHabits;

  // 1. Snapshotted cueConfig on the enrollment (set at enrollment time for new enrollments)
  // 2. Live cueConfig from the study group (fallback for enrollments before snapshotting was added)
  const resolvedConfig =
    enrollment?.cueConfig ?? (await _resolveGroupCueConfig(db, enrollment));

  if (resolvedConfig) {
    cueCount = resolvedConfig.cueCount;
    cueSource = resolvedConfig.cueSource;
    cuePoolId = resolvedConfig.cuePoolId ?? null;
    behaviorOptions = resolvedConfig.behaviorOptions ?? DEFAULT_BEHAVIOR_KEYS;
    maxHabits = resolvedConfig.maxHabits ?? null;
  } else {
    const settings = await readAdminSettings(db);
    cueCount = settings['default_cue_count'] ?? FALLBACK.cueCount;
    cueSource = settings['default_cue_source'] ?? FALLBACK.cueSource;
    cuePoolId = null;
    // Read platform default behaviors from DB (configurable via admin portal).
    // Falls back to hardcoded constant only when DB read fails.
    try {
      const dbDefaults = await getDefaultBehaviorKeys(db);
      behaviorOptions =
        dbDefaults.length > 0 ? dbDefaults : DEFAULT_BEHAVIOR_KEYS;
    } catch {
      behaviorOptions = DEFAULT_BEHAVIOR_KEYS;
    }
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
    recommenderEnabled,
  };
}
