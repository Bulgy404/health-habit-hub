import { z } from 'zod';

// ── Reusable primitives ───────────────────────────────────────────────────────

const shortString = z.string().min(1).max(200).trim();
const longString = z.string().max(2000).trim();
const mongoId = z.string().regex(/^[0-9a-f]{24}$/, 'must be a 24-hex ObjectId');
const slugString = z
  .string()
  .regex(/^[a-z][a-z0-9_-]*$/, 'must be lowercase alphanumeric with _ or -')
  .max(100);

// ── Studies ───────────────────────────────────────────────────────────────────

const studyGroupSchema = z.object({
  label: shortString,
  id: z.string().optional(),
});

export const createStudySchema = z.object({
  name: shortString,
  description: longString.optional(),
  groups: z.array(studyGroupSchema).min(1).max(8),
  questionnaires: z.array(mongoId).max(20).optional(),
});

export const updateStudySchema = z
  .object({
    name: shortString.optional(),
    description: longString.optional(),
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
  cueCount: z.enum(['single', 'multi']),
  cueSource: z.enum(['high_quality', 'low_quality', 'self_selected']),
  cuePoolId: mongoId.optional().nullable(),
  behaviorOptions: z.array(z.string().max(200)).max(20).optional(),
  maxHabits: z.number().int().min(1).max(20).optional().nullable(),
});

// ── Questionnaires ────────────────────────────────────────────────────────────

export const createQuestionnaireSchema = z.object({
  slug: slugString.optional(),
  title: shortString,
  description: longString.optional(),
  version: z.string().max(20).optional(),
  questions: z.array(z.record(z.unknown())).max(200).optional(),
});

export const updateQuestionnaireSchema = z.object({
  title: shortString.optional(),
  description: longString.optional(),
  version: z.string().max(20).optional(),
  questions: z.array(z.record(z.unknown())).max(200).optional(),
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

export const createCueSchema = z.object({
  text: z.string().min(1).max(1000).trim(),
  quality: z.enum(['high', 'low']),
  dimensions: z.array(z.string().max(200)).min(1).max(20),
  domain: z.string().min(1).max(200).trim(),
  language: z.string().min(2).max(10),
});

export const importCuesSchema = z.object({
  cues: z.array(createCueSchema).min(1).max(500),
});

// ── Activity types ────────────────────────────────────────────────────────────

const activityKey = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[a-z][a-z0-9_]*$/, 'must be lowercase alphanumeric with underscores, starting with a letter');

export const createActivityTypeSchema = z.object({
  key: activityKey,
  label_en: shortString,
  label_de: z.string().max(200).trim().optional(),
  isDefault: z.boolean().optional(),
});

export const updateActivityTypeSchema = z
  .object({
    label_en: shortString.optional(),
    label_de: z.string().max(200).trim().optional(),
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
