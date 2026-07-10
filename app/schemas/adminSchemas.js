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
 * must be one of SUPPORTED_LANGS; at least one entry must be non-empty.
 * @param {number} [maxLen] Max length per language entry.
 */
function localeText(maxLen = 500) {
  const shape = {};
  for (const lang of SUPPORTED_LANGS) {
    shape[lang] = z.string().max(maxLen).trim().optional();
  }
  return z
    .object(shape)
    .strict()
    .refine((v) => !isLocaleTextEmpty(v), {
      message: 'at least one language must have non-empty text',
    });
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

const endOfStudyNotificationSchema = z.object({
  enabled: z.boolean(),
  title: z.string().min(1).max(120),
  body: z.string().min(1).max(500),
});

export const createStudySchema = z.object({
  name: shortString,
  description: longString.optional(),
  groups: z.array(studyGroupSchema).min(1).max(8),
  questionnaires: z.array(mongoId).max(20).optional(),
  recommenderEnabled: z.boolean().optional(),
  onboardingEnabled: z.boolean().optional(),
  selfHabitCreationEnabled: z.boolean().optional(),
  endDate: z.string().datetime({ offset: true }).optional().nullable(),
  endOfStudyNotification: endOfStudyNotificationSchema.optional(),
});

const questionnaireRemindersSchema = z.object({
  enabled: z.boolean(),
  hour: z.number().int().min(0).max(23),
});

export const updateStudySchema = z
  .object({
    name: shortString.optional(),
    description: longString.optional(),
    groups: z.array(studyGroupSchema).min(1).max(4).optional(),
    recommenderEnabled: z.boolean().optional(),
    onboardingEnabled: z.boolean().optional(),
    selfHabitCreationEnabled: z.boolean().optional(),
    questionnaireReminders: questionnaireRemindersSchema.optional(),
    endDate: z.string().datetime({ offset: true }).optional().nullable(),
    endOfStudyNotification: endOfStudyNotificationSchema.optional(),
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
  behaviorOptions: z.array(z.string().max(200)).max(20).optional(),
  maxHabits: z.number().int().min(1).max(20).optional().nullable(),
});

const activityTypeConfigSchema = z.object({
  restricted: z.boolean(),
  allowedActivityTypeIds: z.array(mongoId).max(50).optional(),
});

const reminderConfigSchema = z.object({
  enabled: z.boolean(),
  fixedTime: z
    .string()
    .regex(/^\d{2}:\d{2}$/, 'must be HH:MM')
    .optional()
    .nullable(),
});

export const updateGroupConfigSchema = z
  .object({
    cueConfig: cueConfigSchema.optional().nullable(),
    activityTypeConfig: activityTypeConfigSchema.optional().nullable(),
    reminderConfig: reminderConfigSchema.optional().nullable(),
    autoDonate: z.boolean().optional(),
    // null = inherit the study-level flag; a boolean overrides it per group.
    onboardingEnabled: z.boolean().optional().nullable(),
    selfHabitCreationEnabled: z.boolean().optional().nullable(),
  })
  .strict();

// ── Questionnaire scheduling ───────────────────────────────────────────────────

const cadenceSchema = z
  .object({
    mode: z.enum(['interval', 'fixed']),
    startOffsetDays: z.number().int().min(0).max(365).optional(),
    intervalDays: z.number().int().min(1).max(365).optional(),
    occurrences: z.number().int().min(1).max(200).optional(),
    // Fixed timepoints: whole weeks and/or exact days after enrollment.
    weeks: z.array(z.number().int().min(0).max(104)).max(52).optional(),
    days: z.array(z.number().int().min(0).max(730)).max(120).optional(),
  })
  .refine(
    (c) =>
      c.mode === 'fixed'
        ? (Array.isArray(c.weeks) && c.weeks.length > 0) ||
          (Array.isArray(c.days) && c.days.length > 0)
        : c.intervalDays != null && c.occurrences != null,
    {
      message:
        'interval mode requires intervalDays + occurrences; fixed mode requires weeks and/or days',
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

export const updateAppSettingsSchema = z
  .object({
    guidedHabitCreationEnabled: z.boolean().optional(),
    communityShareDefault: z.boolean().optional(),
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
  description: localeText(2000).optional(),
  version: z.string().max(20).optional(),
  languages: languagesSchema,
  questions: z.array(questionSchema).max(200).optional(),
});

export const updateQuestionnaireSchema = z.object({
  title: localeText(200).optional(),
  description: localeText(2000).optional(),
  version: z.string().max(20).optional(),
  languages: languagesSchema.optional(),
  questions: z.array(questionSchema).max(200).optional(),
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
  isDefault: z.boolean().optional(),
});

export const updateActivityTypeSchema = z
  .object({
    label_en: shortString.optional(),
    label_de: z.string().max(200).trim().optional(),
    label_ja: z.string().max(200).trim().optional(),
    isDefault: z.boolean().optional(),
  })
  .strict();

// ── Profile field definitions ─────────────────────────────────────────────────

const fieldType = z.enum(['text', 'number', 'date', 'select']);

export const createProfileFieldSchema = z.object({
  fieldId: slugString,
  label: shortString,
  type: fieldType,
  options: z.array(z.string().max(200)).max(50).optional(),
  required: z.boolean().optional(),
  order: z.number().int().optional(),
});

export const updateProfileFieldSchema = createProfileFieldSchema.partial();

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
