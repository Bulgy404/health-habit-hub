// app/services/habitConfigService.js
import { ObjectId } from '../models/survey.js';
import { COLLECTION as STUDIES } from '../models/study.js';
import { COLLECTION as ACTIVITY_TYPES } from '../models/activityType.js';
import {
  COLLECTION as APP_SETTINGS,
  DEFAULTS as APP_SETTINGS_DEFAULTS,
} from '../models/appSettings.js';
import { pickAssignedCues } from './cuePoolService.js';
import { getEnrollment } from './enrollmentNeo4j.js';
import { resolveEffectiveReminders } from './reminderConfigService.js';

// Locales with a translated activity-type label column; anything else falls
// back to English.
const ACTIVITY_LABEL_LANGS = ['de', 'ja', 'fr', 'nl'];

/**
 * Resolve activity-type keys into { key, label } pairs, localised to `lang`.
 * Falls back to the English label, then the raw key, for any catalog entry
 * that's missing a translation in that language — this replaces a static
 * client-side label map that only ever covered the 5 original seed keys, so
 * any admin-added catalog entry used to display as a raw snake_case key.
 * @param {object} db
 * @param {string[]} keys
 * @param {string} lang
 * @returns {Promise<Array<{ key: string, label: string }>>}
 */
async function resolveBehaviorLabels(db, keys, lang) {
  if (keys.length === 0) return [];
  const labelField = ACTIVITY_LABEL_LANGS.includes(lang)
    ? `label_${lang}`
    : 'label_en';
  const docs = await db
    .collection(ACTIVITY_TYPES)
    .find(
      { key: { $in: keys } },
      { projection: { _id: 0, key: 1, label_en: 1, [labelField]: 1 } }
    )
    .toArray();
  const byKey = new Map(docs.map((d) => [d.key, d]));
  return keys.map((key) => {
    const doc = byKey.get(key);
    const label = doc?.[labelField] || doc?.label_en || key;
    return { key, label };
  });
}

/**
 * Configuration for users without a study-group cueConfig (public app-store
 * users, or enrolled users whose group has no cue config yet): fully free
 * entry — the user types their own habit and their own cues (self_selected,
 * so no pre-rated cue assignment).
 */
const PUBLIC_FREE_ENTRY = {
  cueCount: 'multi',
  cueSource: 'self_selected',
  cuePoolId: null,
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
 * @param {{ db: object, userId: string, neo4jRun: Function, lang?: string }} deps
 * @returns {Promise<{ cueCount: string, cueSource: string, cuePoolId: string|null, behaviorOptions: Array<{key: string, label: string}>, maxHabits: number|null, assignedCues: Array, recommenderEnabled: boolean, guidedHabitCreationEnabled: boolean, communityShareDefault: boolean, habitReminder: { mode: string, time: string|null } }>}
 */
export async function resolveHabitConfig({
  db,
  userId,
  neo4jRun,
  lang = 'en',
}) {
  // Get enrollment from Neo4j
  const enrollment = neo4jRun ? await getEnrollment(neo4jRun, userId) : null;

  // Study-level feature flag and live cueConfig from the study group.
  let recommenderEnabled = true;
  let cueConfig = null;
  // §7.1 Habit Stacking / §7.2 Reminder mode / §7.3 Information Overload —
  // same nullable study→group override pattern as recommenderEnabled. Defaults
  // preserve today's behaviour for public/unenrolled users: stacking available,
  // generic reminders, overload guard off.
  let habitStackingEnabled = true;
  let reminderContentMode = 'generic';
  let informationOverloadGuard = { enabled: false, userOptOutAllowed: false };
  // Habit entry mode — one unified setting for BOTH the New Habit wizard and
  // the donation screen: 'freeText' (type it), 'structured' (pick from the
  // activity_types catalog — see behaviorKeys below), or 'voice' (donation
  // only; the New Habit wizard has no voice UI and just renders free-text
  // for this value, same as it always has for anything that isn't
  // 'structured'). Same nullable study→group override pattern as the flags
  // above. Plus an optional post-donation questionnaire. Defaults preserve
  // today's behaviour: typed-only, no follow-up questionnaire.
  let donationInputMode = 'freeText';
  let donationQuestionnaireSlug = null;
  // Which optional self-report questions the donation form shows. Same
  // nullable study→group override pattern as the flags above. Defaults
  // preserve today's behaviour: all three questions shown.
  let donationAskFrequency = true;
  let donationAskHealthBenefit = true;
  let donationAskWellbeing = true;
  // Onboarding + self-habit-creation flags. Default enabled for everyone
  // (public/free-entry users). Study level sets the baseline; a non-null
  // group-level value overrides it.
  let onboardingEnabled = true;
  let selfHabitCreationEnabled = true;
  // Structured-activity keys are a study-wide setting (applies to every
  // group in the study), not a per-group one — unlike cueConfig, which is
  // still resolved per group below. Empty means free-text habit entry.
  let behaviorKeys = [];
  // Resolved lazily below; undefined study/group falls back to
  // resolveEffectiveReminders' own defaults (matches today's fully
  // participant-chosen behavior for public/unenrolled users).
  let study = null;
  let group = null;

  if (enrollment?.studyId) {
    let studyOid;
    try {
      studyOid = new ObjectId(enrollment.studyId);
    } catch {
      studyOid = null;
    }

    if (studyOid) {
      study = await db.collection(STUDIES).findOne({ _id: studyOid });

      if (study) {
        recommenderEnabled = study.recommenderEnabled !== false;
        onboardingEnabled = study.onboardingEnabled !== false;
        selfHabitCreationEnabled = study.selfHabitCreationEnabled !== false;
        // §7.1/§7.2/§7.3 study-level baselines (null/absent → default).
        if (study.habitStackingEnabled != null) {
          habitStackingEnabled = study.habitStackingEnabled !== false;
        }
        if (
          study.reminderContentMode === 'implementation_intention' ||
          study.reminderContentMode === 'generic'
        ) {
          reminderContentMode = study.reminderContentMode;
        }
        if (study.informationOverloadGuard != null) {
          informationOverloadGuard = {
            enabled: study.informationOverloadGuard.enabled === true,
            userOptOutAllowed:
              study.informationOverloadGuard.userOptOutAllowed === true,
          };
        }
        if (
          study.donationInputMode === 'structured' ||
          study.donationInputMode === 'voice' ||
          study.donationInputMode === 'freeText'
        ) {
          donationInputMode = study.donationInputMode;
        } else if (study.habitEntryMode === 'structured') {
          // Backward-compat, no migration: a study written before this field
          // existed still has the old habitEntryMode/'structured' — honour
          // it as the new unified value's baseline rather than silently
          // reverting a study's structured-entry choice to free text.
          donationInputMode = 'structured';
        }
        if (typeof study.donationQuestionnaireSlug === 'string') {
          donationQuestionnaireSlug = study.donationQuestionnaireSlug;
        }
        if (study.donationAskFrequency != null) {
          donationAskFrequency = study.donationAskFrequency !== false;
        }
        if (study.donationAskHealthBenefit != null) {
          donationAskHealthBenefit = study.donationAskHealthBenefit !== false;
        }
        if (study.donationAskWellbeing != null) {
          donationAskWellbeing = study.donationAskWellbeing !== false;
        }

        // Resolve cueConfig and per-group flag overrides live from the group.
        if (enrollment.groupId) {
          group = (study.groups || []).find(
            (g) => g.id?.toString() === enrollment.groupId
          );
          cueConfig = group?.cueConfig ?? null;
          if (group?.onboardingEnabled != null) {
            onboardingEnabled = group.onboardingEnabled;
          }
          if (group?.selfHabitCreationEnabled != null) {
            selfHabitCreationEnabled = group.selfHabitCreationEnabled;
          }
          if (group?.recommenderEnabled != null) {
            recommenderEnabled = group.recommenderEnabled;
          }
          // A non-null group value overrides the study-level baseline.
          if (group?.habitStackingEnabled != null) {
            habitStackingEnabled = group.habitStackingEnabled !== false;
          }
          if (
            group?.reminderContentMode === 'implementation_intention' ||
            group?.reminderContentMode === 'generic'
          ) {
            reminderContentMode = group.reminderContentMode;
          }
          if (group?.informationOverloadGuard != null) {
            informationOverloadGuard = {
              enabled: group.informationOverloadGuard.enabled === true,
              userOptOutAllowed:
                group.informationOverloadGuard.userOptOutAllowed === true,
            };
          }
          if (
            group?.donationInputMode === 'structured' ||
            group?.donationInputMode === 'voice' ||
            group?.donationInputMode === 'freeText'
          ) {
            donationInputMode = group.donationInputMode;
          } else if (group?.habitEntryMode === 'structured') {
            // Same backward-compat fallback as the study-level baseline
            // above, applied at group level too.
            donationInputMode = 'structured';
          }
          // null/absent = inherit the study-level value untouched (same
          // convention as every other override in this function). Since
          // this field's own "off" state also needs representing at the
          // group level, and null is already taken by "inherit", an empty
          // string is the sentinel for "this group explicitly has no
          // questionnaire" — overriding a non-null study baseline. A
          // non-empty string is a real slug override.
          if (group?.donationQuestionnaireSlug === '') {
            donationQuestionnaireSlug = null;
          } else if (typeof group?.donationQuestionnaireSlug === 'string') {
            donationQuestionnaireSlug = group.donationQuestionnaireSlug;
          }
          if (group?.donationAskFrequency != null) {
            donationAskFrequency = group.donationAskFrequency !== false;
          }
          if (group?.donationAskHealthBenefit != null) {
            donationAskHealthBenefit = group.donationAskHealthBenefit !== false;
          }
          if (group?.donationAskWellbeing != null) {
            donationAskWellbeing = group.donationAskWellbeing !== false;
          }
        }

        // Driven by the unified donationInputMode resolved above (which
        // itself already falls back to the legacy habitEntryMode when
        // neither the new field nor group override is set) — 'structured'
        // means the New Habit wizard shows the activity-catalog picker
        // (its own logic already just checks whether behaviorOptions is
        // non-empty, so this is the only place that needs to know about
        // the rename). structuredActivityKeys stays a plain study→group
        // override, now shared by both flows rather than New-Habit-only.
        const effectiveStructuredActivityKeys =
          group?.structuredActivityKeys ?? study.structuredActivityKeys;
        if (donationInputMode === 'structured') {
          behaviorKeys = effectiveStructuredActivityKeys ?? [];
        }
      }
    }
  }

  const habitReminder = resolveEffectiveReminders({ study, group }).habit;

  let cueCount, cueSource, cuePoolId, maxHabits;

  if (cueConfig) {
    cueCount = cueConfig.cueCount;
    cueSource = cueConfig.cueSource;
    cuePoolId = cueConfig.cuePoolId ?? null;
    maxHabits = cueConfig.maxHabits ?? null;
  } else {
    ({ cueCount, cueSource, cuePoolId, maxHabits } = PUBLIC_FREE_ENTRY);
  }

  const assignedCues = await pickAssignedCues({
    db,
    cueSource,
    cueCount,
    cuePoolId,
    lang,
  });

  const appSettings = await readAppSettings(db);
  const resolvedBehaviorOptions = await resolveBehaviorLabels(
    db,
    behaviorKeys,
    lang
  );
  // §7.3 — the reminder-frequency tier an existing habit must reach before
  // another of the same type unlocks. Admin-tunable global setting, same
  // spirit as the reminder_* keys.
  const informationOverloadUnlockTier =
    await readInformationOverloadUnlockTier(db);

  return {
    cueCount,
    cueSource,
    cuePoolId,
    behaviorOptions: resolvedBehaviorOptions,
    maxHabits,
    assignedCues,
    recommenderEnabled,
    onboardingEnabled,
    selfHabitCreationEnabled,
    habitReminder,
    // §7.1/§7.2/§7.3 resolved feature config.
    habitStackingEnabled,
    reminderContentMode,
    informationOverloadGuard,
    informationOverloadUnlockTier,
    // Donation input mode + post-donation questionnaire.
    donationInputMode,
    donationQuestionnaireSlug,
    // Which optional self-report questions the donation form shows.
    donationAskFrequency,
    donationAskHealthBenefit,
    donationAskWellbeing,
    ...appSettings,
  };
}

/** Valid reminder-frequency tiers for the overload unlock threshold. */
const OVERLOAD_TIERS = [
  'daily',
  'every_2_days',
  'twice_weekly',
  'weekly',
  'off',
];

/**
 * Read the admin-tunable §7.3 unlock tier from admin_settings
 * (key: information_overload_unlock_tier). Defaults to 'weekly'.
 * @param {object} db
 * @returns {Promise<string>}
 */
async function readInformationOverloadUnlockTier(db) {
  try {
    const doc = await db
      .collection('admin_settings')
      .findOne({ key: 'information_overload_unlock_tier' });
    const value = doc?.value;
    return OVERLOAD_TIERS.includes(value) ? value : 'weekly';
  } catch {
    return 'weekly';
  }
}
