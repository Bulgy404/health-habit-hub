// app/services/habitConfigService.js
import { ObjectId } from '../models/survey.js';
import { COLLECTION as STUDIES } from '../models/study.js';
import {
  COLLECTION as APP_SETTINGS,
  DEFAULTS as APP_SETTINGS_DEFAULTS,
} from '../models/appSettings.js';
import { DEFAULT_BEHAVIOR_KEYS } from '../utils/srhi.js';
import { pickAssignedCues } from './cuePoolService.js';
import { getEnrollment } from './enrollmentNeo4j.js';

/**
 * Configuration for users without a study-group cueConfig (public app-store
 * users, or enrolled users whose group has no cue config yet): fully free
 * entry. The user types their own habit (no activity-type catalog, signalled
 * by empty behaviorOptions) and their own cues (self_selected, so no
 * pre-rated cue assignment).
 */
const PUBLIC_FREE_ENTRY = {
  cueCount: 'multi',
  cueSource: 'self_selected',
  cuePoolId: null,
  behaviorOptions: [],
  maxHabits: null,
};

async function readAppSettings(db) {
  try {
    const doc = await db.collection(APP_SETTINGS).findOne({ key: 'global' });
    return {
      guidedHabitCreationEnabled:
        doc?.guidedHabitCreationEnabled ??
        APP_SETTINGS_DEFAULTS.guidedHabitCreationEnabled,
      communityShareDefault:
        doc?.communityShareDefault ??
        APP_SETTINGS_DEFAULTS.communityShareDefault,
    };
  } catch {
    return { ...APP_SETTINGS_DEFAULTS };
  }
}

/**
 * Resolve cue configuration for a user, including pre-sampled assigned cues.
 * cueConfig is always resolved live from the study group in MongoDB (no snapshot).
 * Priority: study group cueConfig (live) > free-entry public config.
 * Also includes the platform-wide app feature flags (app_settings singleton).
 * @param {{ db: object, userId: string, neo4jRun: Function }} deps
 * @returns {Promise<{ cueCount: string, cueSource: string, cuePoolId: string|null, behaviorOptions: Array, maxHabits: number|null, assignedCues: Array, recommenderEnabled: boolean, guidedHabitCreationEnabled: boolean, communityShareDefault: boolean }>}
 */
export async function resolveHabitConfig({ db, userId, neo4jRun }) {
  // Get enrollment from Neo4j
  const enrollment = neo4jRun ? await getEnrollment(neo4jRun, userId) : null;

  // Study-level feature flag and live cueConfig from the study group.
  let recommenderEnabled = true;
  let cueConfig = null;
  // Onboarding + self-habit-creation flags. Default enabled for everyone
  // (public/free-entry users). Study level sets the baseline; a non-null
  // group-level value overrides it.
  let onboardingEnabled = true;
  let selfHabitCreationEnabled = true;

  if (enrollment?.studyId) {
    let studyOid;
    try {
      studyOid = new ObjectId(enrollment.studyId);
    } catch {
      studyOid = null;
    }

    if (studyOid) {
      const study = await db.collection(STUDIES).findOne({ _id: studyOid });

      if (study) {
        recommenderEnabled = study.recommenderEnabled !== false;
        onboardingEnabled = study.onboardingEnabled !== false;
        selfHabitCreationEnabled = study.selfHabitCreationEnabled !== false;

        // Resolve cueConfig and per-group flag overrides live from the group.
        if (enrollment.groupId) {
          const group = (study.groups || []).find(
            (g) => g.id?.toString() === enrollment.groupId
          );
          cueConfig = group?.cueConfig ?? null;
          if (group?.onboardingEnabled != null) {
            onboardingEnabled = group.onboardingEnabled;
          }
          if (group?.selfHabitCreationEnabled != null) {
            selfHabitCreationEnabled = group.selfHabitCreationEnabled;
          }
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
    ({ cueCount, cueSource, cuePoolId, behaviorOptions, maxHabits } =
      PUBLIC_FREE_ENTRY);
  }

  const assignedCues = await pickAssignedCues({
    db,
    cueSource,
    cueCount,
    cuePoolId,
  });

  const appSettings = await readAppSettings(db);

  return {
    cueCount,
    cueSource,
    cuePoolId,
    behaviorOptions,
    maxHabits,
    assignedCues,
    recommenderEnabled,
    onboardingEnabled,
    selfHabitCreationEnabled,
    ...appSettings,
  };
}
