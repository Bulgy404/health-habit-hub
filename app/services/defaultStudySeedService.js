import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { ObjectId } from 'mongodb';
import { COLLECTION as STUDIES } from '../models/study.js';
import { ASSIGNMENTS } from '../models/questionnaireSchedule.js';
import { resolveLocaleText } from '../utils/localeText.js';
import { logger } from '../utils/logger.js';

const log = logger.child({ module: 'defaultStudySeedService' });

const __dirname = dirname(fileURLToPath(import.meta.url));
const QUESTIONNAIRES_SEED_PATH = resolve(
  __dirname,
  '../db/seed/questionnaires.json'
);
const QUESTIONNAIRES_COLLECTION = 'questionnaires';

// Organic app-store signups (no study code) all land in this one group — the
// default study has no experimental arms to randomize into.
const DEFAULT_GROUPS = [
  {
    id: new ObjectId(),
    label: 'Group 1',
    index: 1,
    cueConfig: null,
    activityTypeConfig: null,
    reminderConfig: { enabled: true, fixedTime: null },
    autoDonate: false,
  },
];

/**
 * Upsert the built-in questionnaire library (SLIQ, RAND-36, SRHI) by slug.
 * Idempotent — safe to run on every boot. Mirrors scripts/seed-local.js's
 * seedMongo() so a fresh deploy that never ran the manual seed script still
 * ends up with a usable questionnaire library.
 * @param {import('mongodb').Db} db
 */
export async function seedDefaultQuestionnaires(db) {
  const collection = db.collection(QUESTIONNAIRES_COLLECTION);
  const questionnaires = JSON.parse(
    readFileSync(QUESTIONNAIRES_SEED_PATH, 'utf8')
  );
  for (const q of questionnaires) {
    const { _id, ...doc } = q;
    await collection.updateOne(
      { slug: doc.slug },
      { $set: doc, $setOnInsert: { createdAt: new Date() } },
      { upsert: true }
    );
  }
  log.info(
    { slugs: questionnaires.map((q) => q.slug) },
    'Default questionnaires seeded'
  );
}

/**
 * Ensure a default study exists, linking the SLIQ and RAND-36 library
 * questionnaires (SRHI is scheduled per-intention, not at the study level —
 * see srhiService.js). No-ops if a default study already exists. Mirrors
 * scripts/seed-local.js's seedDefaultStudy().
 * @param {import('mongodb').Db} db
 */
export async function seedDefaultStudy(db) {
  const studies = db.collection(STUDIES);
  const questionnaires = db.collection(QUESTIONNAIRES_COLLECTION);
  let study = await studies.findOne({ isDefault: true });

  if (!study) {
    const [sliq, rand36] = await Promise.all([
      questionnaires.findOne({ slug: 'sliq' }),
      questionnaires.findOne({ slug: 'rand-36' }),
    ]);
    const qIds = [sliq?._id, rand36?._id].filter(Boolean);

    const now = new Date();
    const { insertedId } = await studies.insertOne({
      name: 'Default Study',
      description:
        'Pre-configured default study. Participants without a study code are enrolled here.',
      isDefault: true,
      isActive: true,
      groups: DEFAULT_GROUPS,
      questionnaires: qIds,
      createdAt: now,
      updatedAt: now,
    });
    study = { _id: insertedId };
    log.info({ questionnaireCount: qIds.length }, 'Default study seeded');
  }

  // Ensure SRHI is delivered on habit creation for the default study (counts as
  // week 1). Idempotent — also backfills studies created before this feature.
  await ensureSrhiHabitCreationAssignment(db, study._id);
}

/**
 * Upsert an active SRHI questionnaire assignment (study-wide) flagged
 * `deliverOnHabitCreation` for the given study. Safe to run repeatedly.
 * @param {import('mongodb').Db} db
 * @param {ObjectId} studyId
 */
export async function ensureSrhiHabitCreationAssignment(db, studyId) {
  const srhi = await db
    .collection(QUESTIONNAIRES_COLLECTION)
    .findOne({ slug: 'srhi' });
  if (!srhi) {
    log.warn('SRHI questionnaire not found — skipping default assignment');
    return;
  }
  const now = new Date();
  await db.collection(ASSIGNMENTS).updateOne(
    { studyId, groupId: null, questionnaireId: srhi._id },
    {
      $set: {
        questionnaireSlug: 'srhi',
        questionnaireTitle:
          resolveLocaleText(srhi.title, 'en', srhi.languages || ['en']) ||
          'srhi',
        // Nominal cadence for admin display; SRHI's own per-habit pipeline
        // (srhiService.generateWindows) drives the actual weekly windows.
        cadence: {
          mode: 'interval',
          startOffsetDays: 0,
          intervalDays: 7,
          occurrences: 4,
        },
        deliverOnHabitCreation: true,
        active: true,
        updatedAt: now,
      },
      $setOnInsert: {
        studyId,
        groupId: null,
        questionnaireId: srhi._id,
        createdAt: now,
      },
    },
    { upsert: true }
  );
  log.info(
    { studyId: studyId.toString() },
    'SRHI habit-creation assignment ensured'
  );
}
