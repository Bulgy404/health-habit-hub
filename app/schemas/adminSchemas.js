import { z } from 'zod';
import { SUPPORTED_LANGS, isLocaleTextEmpty } from '../utils/localeText.js';

// ── Reusable primitives ───────────────────────────────────────────────────────

const shortString = z.string().min(1).max(200).trim();
const longString = z.string().max(2000).trim();
const mongoId = z.string().regex(/^[0-9a-f]{24}$/, 'must be a 24-hex ObjectId');
const slugString = z
  .string()
  .regex(/^[a-z][a-z0-9_-]*$/, 'must be lowercase alphanumeric with _ or -')
  .max(100);

/**
 * Per-language text used by questionnaires and cue pools — a map of
 * language code -> string, e.g. `{ en: 'Hello', de: 'Hallo' }`. Every key
 * must be one of SUPPORTED_LANGS.
 * @param {number} [maxLen] Max length per language entry.
 * @param {{ requireNonEmpty?: boolean }} [opts] Set requireNonEmpty: false for
 *   genuinely optional text (e.g. a description) where `{}` is a valid value —
 *   not to be confused with wrapping the whole schema in `.optional()`, which
 *   only permits omitting the field, not sending an empty object.
 */
function localeText(maxLen = 500, { requireNonEmpty = true } = {}) {
  const shape = {};
  for (const lang of SUPPORTED_LANGS) {
    shape[lang] = z.string().max(maxLen).trim().optional();
  }
  let schema = z.object(shape).strict();
  if (requireNonEmpty) {
    schema = schema.refine((v) => !isLocaleTextEmpty(v), {
      message: 'at least one language must have non-empty text',
    });
  }
  return schema;
}

const languagesSchema = z
  .array(z.enum(SUPPORTED_LANGS))
  .min(1)
  .max(SUPPORTED_LANGS.length);

// ── Studies ───────────────────────────────────────────────────────────────────

const studyGroupSchema = z.object({
  label: shortString,
  id: z.string().optional(),
});

// Content only — whether/when it fires lives in remindersSchema.endOfStudy.
const endOfStudyNotificationSchema = z.object({
  title: z.string().min(1).max(120),
  body: z.string().min(1).max(500),
});

// ── Reminders (habit / questionnaire / end-of-study / study-update) ──────────

const HHMM_REGEX = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;

/**
 * One reminder type's configuration: whether it's on, and — when on — a
 * fixed (locked) time.
 *   off:               no reminder; time must be omitted.
 *   participant_choice: participant picks their own time; time must be omitted.
 *                      Habit reminders only — no participant-facing time
 *                      picker exists for the other 3 types.
 *   admin_fixed:       admin locks `time`; participant has no input at all.
 * @param {{ allowedModes?: string[] }} [opts] Restrict which modes are valid —
 *   e.g. questionnaire/end-of-study/study-update only ever offer off/admin_fixed
 *   ("set a time or don't") since there's no participant-facing override for
 *   them.
 */
function reminderModeSchema({ allowedModes = ['off', 'admin_fixed'] } = {}) {
  return z
    .object({
      mode: z.enum(allowedModes),
      time: z.string().regex(HHMM_REGEX, 'must be HH:MM').optional().nullable(),
    })
    .strict()
    .refine((v) => (v.mode === 'admin_fixed' ? !!v.time : true), {
      message: 'time is required for admin_fixed mode',
    })
    .refine(
      (v) =>
        v.mode === 'off' || v.mode === 'participant_choice'
          ? v.time == null
          : true,
      { message: 'time must be omitted for off and participant_choice modes' }
    );
}

const remindersSchema = z
  .object({
    habit: reminderModeSchema({
      allowedModes: ['off', 'participant_choice', 'admin_fixed'],
    }).optional(),
    questionnaire: reminderModeSchema().optional(),
    endOfStudy: reminderModeSchema().optional(),
    studyUpdate: reminderModeSchema().optional(),
  })
  .strict();

// Group-level: each type is independently nullable — null means "inherit the
// study-level setting for this type", matching the existing convention used
// by onboardingEnabled/selfHabitCreationEnabled.
const groupRemindersSchema = z
  .object({
    habit: reminderModeSchema({
      allowedModes: ['off', 'participant_choice', 'admin_fixed'],
    })
      .nullable()
      .optional(),
    questionnaire: reminderModeSchema().nullable().optional(),
    endOfStudy: reminderModeSchema().nullable().optional(),
    studyUpdate: reminderModeSchema().nullable().optional(),
  })
  .strict();

/** §7.3 Information Overload guard config (study- and group-level). */
export const informationOverloadGuardSchema = z.object({
  enabled: z.boolean(),
  userOptOutAllowed: z.boolean().optional(),
});

/** Donation input mode — text-only, speech-only, or participant's choice. */
const donationInputModeSchema = z.enum(['text', 'speech', 'both']);
/**
 * Which optional self-report questions are shown after a habit donation.
 * Each defaults to `true` (shown) when absent; a group-level `null` inherits
 * the study-level value (same override pattern as the flags above).
 */
const donationQuestionFlagSchema = z.boolean();
/** Slug of a `questionnaires` pool document to offer after every donation, or null for none. */
const donationQuestionnaireSlugSchema = z.string().min(1).max(200).nullable();
/**
 * Group-level variant: null/absent = inherit the study-level value; '' = this
 * group explicitly has no questionnaire (overriding a non-null study value);
 * a non-empty string = a real slug override. See habitConfigService.js.
 */
const groupDonationQuestionnaireSlugSchema = z.string().max(200).nullable();

export const createStudySchema = z.object({
  name: shortString,
  description: longString.optional(),
  groups: z.array(studyGroupSchema).min(1).max(8),
  questionnaires: z.array(mongoId).max(20).optional(),
  recommenderEnabled: z.boolean().optional(),
  onboardingEnabled: z.boolean().optional(),
  selfHabitCreationEnabled: z.boolean().optional(),
  habitEntryMode: z.enum(['freeText', 'structured']).optional(),
  structuredActivityKeys: z.array(z.string().max(200)).max(20).optional(),
  // §7.1/§7.2/§7.3 study-level feature config.
  habitStackingEnabled: z.boolean().optional(),
  reminderContentMode: z
    .enum(['generic', 'implementation_intention'])
    .optional(),
  informationOverloadGuard: informationOverloadGuardSchema.optional(),
  // §7.5 Gamification — study-wide on/off toggle.
  gamificationEnabled: z.boolean().optional(),
  // Habit-donation input mode + optional post-donation questionnaire.
  donationInputMode: donationInputModeSchema.optional(),
  donationQuestionnaireSlug: donationQuestionnaireSlugSchema.optional(),
  // Which optional self-report questions the donation form shows.
  donationAskFrequency: donationQuestionFlagSchema.optional(),
  donationAskHealthBenefit: donationQuestionFlagSchema.optional(),
  donationAskWellbeing: donationQuestionFlagSchema.optional(),
  endDate: z.string().datetime({ offset: true }).optional().nullable(),
  endOfStudyNotification: endOfStudyNotificationSchema.optional(),
  reminders: remindersSchema.optional(),
});

export const updateStudySchema = z
  .object({
    name: shortString.optional(),
    description: longString.optional(),
    groups: z.array(studyGroupSchema).min(1).max(8).optional(),
    recommenderEnabled: z.boolean().optional(),
    onboardingEnabled: z.boolean().optional(),
    selfHabitCreationEnabled: z.boolean().optional(),
    habitEntryMode: z.enum(['freeText', 'structured']).optional(),
    structuredActivityKeys: z.array(z.string().max(200)).max(20).optional(),
    // §7.1/§7.2/§7.3 study-level feature config.
    habitStackingEnabled: z.boolean().optional(),
    reminderContentMode: z
      .enum(['generic', 'implementation_intention'])
      .optional(),
    informationOverloadGuard: informationOverloadGuardSchema.optional(),
    // §7.5 Gamification — study-wide on/off toggle.
    gamificationEnabled: z.boolean().optional(),
    // Habit-donation input mode + optional post-donation questionnaire.
    donationInputMode: donationInputModeSchema.optional(),
    donationQuestionnaireSlug: donationQuestionnaireSlugSchema.optional(),
    // Which optional self-report questions the donation form shows.
    donationAskFrequency: donationQuestionFlagSchema.optional(),
    donationAskHealthBenefit: donationQuestionFlagSchema.optional(),
    donationAskWellbeing: donationQuestionFlagSchema.optional(),
    endDate: z.string().datetime({ offset: true }).optional().nullable(),
    endOfStudyNotification: endOfStudyNotificationSchema.optional(),
    reminders: remindersSchema.optional(),
  })
  .strict();

export const createStudyCodesSchema = z.object({
  count: z.number().int().min(1).max(100),
  // groupId is optional: omit for study-level codes (group assigned at redemption
  // via weighted round-robin); supply for targeted group-specific codes.
  groupId: z.string().min(1).optional().nullable(),
  maxRedemptions: z.number().int().min(1).max(1000).optional().nullable(),
  expiresAt: z.string().datetime({ offset: true }).optional().nullable(),
});

export const updateAllocationSchema = z.object({
  weights: z
    .array(
      z.object({
        groupId: mongoId,
        weight: z.number().int().min(1).max(100),
      })
    )
    .min(1)
    .max(8),
});

export const cueConfigSchema = z.object({
  restricted: z.boolean().optional(),
  cueCount: z.enum(['single', 'multi']),
  cueSource: z.enum(['high_quality', 'low_quality', 'self_selected']),
  cuePoolId: mongoId.optional().nullable(),
  maxHabits: z.number().int().min(1).max(20).optional().nullable(),
});

const activityTypeConfigSchema = z.object({
  restricted: z.boolean(),
  allowedActivityTypeIds: z.array(mongoId).max(50).optional(),
});

export const updateGroupConfigSchema = z
  .object({
    cueConfig: cueConfigSchema.optional().nullable(),
    activityTypeConfig: activityTypeConfigSchema.optional().nullable(),
    reminders: groupRemindersSchema.optional().nullable(),
    autoDonate: z.boolean().optional(),
    // null = inherit the study-level flag; a boolean overrides it per group.
    onboardingEnabled: z.boolean().optional().nullable(),
    selfHabitCreationEnabled: z.boolean().optional().nullable(),
    recommenderEnabled: z.boolean().optional().nullable(),
    // §7.1/§7.2/§7.3 group-level overrides (null = inherit study-level).
    habitStackingEnabled: z.boolean().optional().nullable(),
    reminderContentMode: z
      .enum(['generic', 'implementation_intention'])
      .optional()
      .nullable(),
    informationOverloadGuard: informationOverloadGuardSchema
      .optional()
      .nullable(),
    // §7.5 group-level gamification override (null = inherit study-level).
    gamificationEnabled: z.boolean().optional().nullable(),
    // Group-level donation input mode / questionnaire override (null = inherit study-level).
    donationInputMode: donationInputModeSchema.optional().nullable(),
    // null = inherit; '' = explicit no-questionnaire; non-empty = a slug override.
    donationQuestionnaireSlug: groupDonationQuestionnaireSlugSchema.optional(),
    // Group-level donation-question overrides (null = inherit study-level).
    donationAskFrequency: donationQuestionFlagSchema.optional().nullable(),
    donationAskHealthBenefit: donationQuestionFlagSchema.optional().nullable(),
    donationAskWellbeing: donationQuestionFlagSchema.optional().nullable(),
    // null = inherit the study-level habit-entry-mode setting for this group.
    habitEntryMode: z.enum(['freeText', 'structured']).optional().nullable(),
    structuredActivityKeys: z
      .array(z.string().max(200))
      .max(20)
      .optional()
      .nullable(),
  })
  .strict();

// ── Questionnaire scheduling ───────────────────────────────────────────────────

const cadenceSchema = z
  .object({
    mode: z.enum(['interval', 'fixed']),
    startOffsetDays: z.number().int().min(0).max(365).optional(),
    intervalDays: z.number().int().min(1).max(365).optional(),
    occurrences: z.number().int().min(1).max(200).optional(),
    // When true (interval mode only), occurrences is ignored and windows are
    // generated on a rolling basis indefinitely instead of a fixed count.
    continuous: z.boolean().optional(),
    // Fixed timepoints: whole weeks and/or exact days after enrollment.
    weeks: z.array(z.number().int().min(0).max(104)).max(52).optional(),
    days: z.array(z.number().int().min(0).max(730)).max(120).optional(),
  })
  .refine(
    (c) =>
      c.mode === 'fixed'
        ? (Array.isArray(c.weeks) && c.weeks.length > 0) ||
          (Array.isArray(c.days) && c.days.length > 0)
        : c.intervalDays != null &&
          (c.continuous === true || c.occurrences != null),
    {
      message:
        'interval mode requires intervalDays (+ occurrences unless continuous); fixed mode requires weeks and/or days',
    }
  );

export const createQuestionnaireAssignmentSchema = z.object({
  questionnaireId: mongoId,
  // null / omitted = study-wide (all groups); otherwise a specific group id.
  groupId: mongoId.nullable().optional(),
  cadence: cadenceSchema,
});

export const updateQuestionnaireAssignmentSchema = z
  .object({
    cadence: cadenceSchema.optional(),
    active: z.boolean().optional(),
  })
  .strict();

// ── Questionnaires ────────────────────────────────────────────────────────────

const questionOptionSchema = z.object({
  value: z.string().min(1).max(200),
  label: localeText(500),
});

const questionSchema = z.object({
  id: z.string().min(1).max(200),
  type: z.enum(['single_choice', 'multi_choice', 'scale', 'text']),
  text: localeText(2000),
  required: z.boolean().optional(),
  options: z.array(questionOptionSchema).max(50).optional(),
});

export const createQuestionnaireSchema = z.object({
  slug: slugString.optional(),
  title: localeText(200),
  description: localeText(2000, { requireNonEmpty: false }).optional(),
  version: z.string().max(20).optional(),
  languages: languagesSchema,
  questions: z.array(questionSchema).max(200).optional(),
  // 'study' (default): anchored to enrollment, applies once per participant.
  // 'habit': anchored to each habit's creation, applies once per habit.
  // 'donation': never auto-assigned/windowed — purely descriptive, for
  // questionnaires meant to be offered ad-hoc right after a habit donation
  // (see donationQuestionnaireSlug in studies/groups config).
  scope: z.enum(['study', 'habit', 'donation']).optional(),
});

export const updateQuestionnaireSchema = z.object({
  title: localeText(200).optional(),
  description: localeText(2000, { requireNonEmpty: false }).optional(),
  version: z.string().max(20).optional(),
  languages: languagesSchema.optional(),
  questions: z.array(questionSchema).max(200).optional(),
  scope: z.enum(['study', 'habit', 'donation']).optional(),
});

// ── Surveys ───────────────────────────────────────────────────────────────────

const surveyStatus = z.enum(['draft', 'published', 'archived']);
const surveyGroups = z.array(z.enum(['G1', 'G2', 'G3', 'G4'])).max(4);
const surveyTargetMode = z
  .enum(['all_participants', 'unassigned_only', 'group_assigned'])
  .optional();

export const createSurveySchema = z.object({
  title: shortString,
  type: z.string().min(1).max(100),
  jsonSchema: z.record(z.unknown()).optional(),
  assignedGroups: surveyGroups.optional(),
  targetMode: surveyTargetMode,
});

export const updateSurveySchema = z.object({
  title: shortString.optional(),
  type: z.string().max(100).optional(),
  jsonSchema: z.record(z.unknown()).optional(),
  assignedGroups: surveyGroups.optional(),
  targetMode: surveyTargetMode,
  status: surveyStatus.optional(),
});

export const updateSurveyStatusSchema = z.object({
  status: surveyStatus,
});

export const updateSurveyGroupsSchema = z.object({
  groups: surveyGroups,
});

// ── Cue pools ─────────────────────────────────────────────────────────────────

// The 3 psychometric quality ratings (1-5) used to weight cue selection —
// unrelated to the behaviour-dimension tags (TIME, PHYSICAL_SETTING, ...)
// used elsewhere for intentions; both are informally called "dimensions"
// but are separate concepts.
const cueDimensionsSchema = z.object({
  stability: z.number().int().min(1).max(5),
  salience: z.number().int().min(1).max(5),
  specificity: z.number().int().min(1).max(5),
});

export const createCueSchema = z.object({
  text: localeText(1000),
  languages: languagesSchema,
  quality: z.enum(['high', 'low']),
  dimensions: cueDimensionsSchema,
  domain: z.string().min(1).max(200).trim(),
});

// CSV rows arrive as flat string-keyed objects (parsed client-side from a
// wide-format CSV: text_en,text_de,text_fr,text_ja,text_nl,quality,
// stability,salience,specificity,domain). importCues() in cuePoolService.js
// does its own per-field validation/coercion (parseInt, trim, etc.) rather
// than relying on Zod for numeric coercion, so this only checks the outer
// array shape.
export const importCuesSchema = z.object({
  cues: z.array(z.record(z.string())).min(1).max(500),
});

// ── Activity types ────────────────────────────────────────────────────────────

const activityKey = z
  .string()
  .min(1)
  .max(100)
  .regex(
    /^[a-z][a-z0-9_]*$/,
    'must be lowercase alphanumeric with underscores, starting with a letter'
  );

export const createActivityTypeSchema = z.object({
  key: activityKey,
  label_en: shortString,
  label_de: z.string().max(200).trim().optional(),
  label_ja: z.string().max(200).trim().optional(),
  label_fr: z.string().max(200).trim().optional(),
  label_nl: z.string().max(200).trim().optional(),
  isDefault: z.boolean().optional(),
});

export const updateActivityTypeSchema = z
  .object({
    label_en: shortString.optional(),
    label_de: z.string().max(200).trim().optional(),
    label_ja: z.string().max(200).trim().optional(),
    label_fr: z.string().max(200).trim().optional(),
    label_nl: z.string().max(200).trim().optional(),
    isDefault: z.boolean().optional(),
  })
  .strict();

// ── Profile field definitions ─────────────────────────────────────────────────

const fieldType = z.enum(['text', 'number', 'date', 'select']);

const profileFieldOptionSchema = z.object({
  value: z.string().min(1).max(100),
  label: localeText(200),
});

export const createProfileFieldSchema = z.object({
  fieldId: slugString,
  label: localeText(200),
  type: fieldType,
  options: z.array(profileFieldOptionSchema).max(50).optional(),
  languages: languagesSchema,
  required: z.boolean().optional(),
  order: z.number().int().optional(),
});

export const updateProfileFieldSchema = z.object({
  label: localeText(200).optional(),
  type: fieldType.optional(),
  options: z.array(profileFieldOptionSchema).max(50).optional(),
  languages: languagesSchema.optional(),
  required: z.boolean().optional(),
  order: z.number().int().optional(),
});

// ── Backups ───────────────────────────────────────────────────────────────────

const backupFilenameSchema = z
  .string()
  .regex(
    /^(full_backup|uploaded)_[0-9_]+[A-Za-z0-9._-]*\.tar\.gz$/,
    'must be a valid backup filename'
  );

export const restoreBackupSchema = z.object({
  confirmFilename: backupFilenameSchema,
  restoreToken: z.string().min(1),
  acknowledgeWarnings: z.boolean().optional(),
  restoreKeycloak: z.boolean().optional(),
});

export const triggerBackupSchema = z.object({
  // Which components to include — any omitted key defaults to included.
  services: z
    .object({
      mongo: z.boolean().optional(),
      neo4j: z.boolean().optional(),
      lightrag: z.boolean().optional(),
      keycloak: z.boolean().optional(),
    })
    .strict()
    .optional(),
});

// ── Notification campaigns ────────────────────────────────────────────────────

// A recurring campaign (the "study update reminder" type): after each send it
// reschedules itself intervalDays later instead of terminating, until `until`
// (if set) has passed.
const campaignRecurrenceSchema = z
  .object({
    intervalDays: z.number().int().min(1).max(365),
    until: z.string().datetime({ offset: true }).optional().nullable(),
  })
  .strict();

export const createNotificationCampaignSchema = z.object({
  studyId: mongoId.optional().nullable(),
  title: z.string().min(1).max(65),
  body: z.string().min(1).max(240),
  targetType: z.enum(['individual', 'group', 'all_enrolled']),
  targetIds: z.array(z.string()).max(50).optional(),
  scheduledFor: z.string().datetime({ offset: true }).optional().nullable(),
  recurrence: campaignRecurrenceSchema.optional().nullable(),
});
