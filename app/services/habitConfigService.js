// app/services/habitConfigService.js
import { ObjectId } from '../models/survey.js';
import { COLLECTION as STUDIES } from '../models/study.js';
import { DEFAULT_BEHAVIOR_KEYS } from '../utils/srhi.js';
import { pickAssignedCues } from './cuePoolService.js';
import { getDefaultBehaviorKeys } from './activityTypeService.js';
import { getEnrollment } from './enrollmentNeo4j.js';

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
 * Resolve cue configuration for a user, including pre-sampled assigned cues.
 * cueConfig is always resolved live from the study group in MongoDB (no snapshot).
 * Priority: study group cueConfig (live) > admin_settings defaults > hardcoded fallback.
 * @param {{ db: object, userId: string, neo4jRun: Function }} deps
 * @returns {Promise<{ cueCount: string, cueSource: string, cuePoolId: string|null, behaviorOptions: Array, maxHabits: number|null, assignedCues: Array, recommenderEnabled: boolean }>}
 */
export async function resolveHabitConfig({ db, userId, neo4jRun }) {
  // Get enrollment from Neo4j
  const enrollment = neo4jRun ? await getEnrollment(neo4jRun, userId) : null;

  // Study-level feature flag and live cueConfig from the study group.
  let recommenderEnabled = true;
  let cueConfig = null;

  if (enrollment?.studyId) {
    let studyOid;
    try {
      studyOid = new ObjectId(enrollment.studyId);
    } catch {
      studyOid = null;
    }

    if (studyOid) {
      const study = await db
        .collection(STUDIES)
        .findOne({ _id: studyOid });

      if (study) {
        recommenderEnabled = study.recommenderEnabled !== false;

        // Resolve cueConfig live from the study group
        if (enrollment.groupId) {
          const group = (study.groups || []).find(
            (g) => g.id?.toString() === enrollment.groupId
          );
          cueConfig = group?.cueConfig ?? null;
        }
      }
    }
  }

  let cueCount, cueSource, cuePoolId, behaviorOptions, maxHabits;

  if (cueConfig) {
    cueCount = cueConfig.cueCount;
    cueSource = cueConfig.cueSource;
    cuePoolId = cueConfig.cuePoolId ?? null;
    behaviorOptions = cueConfig.behaviorOptions ?? DEFAULT_BEHAVIOR_KEYS;
    maxHabits = cueConfig.maxHabits ?? null;
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
