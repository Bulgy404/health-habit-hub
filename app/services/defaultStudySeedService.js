import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { ObjectId } from 'mongodb';
import { COLLECTION as STUDIES } from '../models/study.js';
import { ASSIGNMENTS } from '../models/questionnaireSchedule.js';
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
 * Upsert the built-in questionnaire library (SLIQ, RAND-36) by slug.
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
 * Remove the retired SRHI library entry from any environment that seeded it
 * before SRHI became unconditional (see intentionsRouter.js) — it's no
 * longer part of the questionnaire library, and a stale `questionnaire_id`/
 * `questionnaire_assignments` row referencing it could otherwise leak SRHI
 * back into the generic study-scoped window pipeline (a since-deleted
 * questionnaireId resolves to no scope, which the generic pipeline treats as
 * study-scoped by default). Idempotent — safe to run on every boot.
 * @param {import('mongodb').Db} db
 */
export async function retireLegacySrhiLibraryEntry(db) {
  const { deletedCount: assignmentsRemoved } = await db
    .collection(ASSIGNMENTS)
    .deleteMany({ questionnaireSlug: 'srhi' });
  const { deletedCount: questionnaireRemoved } = await db
    .collection(QUESTIONNAIRES_COLLECTION)
    .deleteMany({ slug: 'srhi' });
  if (assignmentsRemoved || questionnaireRemoved) {
    log.info(
      { assignmentsRemoved, questionnaireRemoved },
      'Retired legacy SRHI library entry / assignments'
    );
  }
}

/**
 * Ensure a default study exists. Study-scoped questionnaires (SLIQ, RAND-36)
 * are seeded as library *definitions* only (see seedDefaultQuestionnaires
 * above); an admin must explicitly turn each one on for the study via the
 * admin UI. SRHI is unconditional — see intentionsRouter.js — and needs no
 * assignment. No-ops if a default study already exists. Mirrors
 * scripts/seed-local.js's seedDefaultStudy().
 * @param {import('mongodb').Db} db
 */
export async function seedDefaultStudy(db) {
  const studies = db.collection(STUDIES);
  let study = await studies.findOne({ isDefault: true });

  if (!study) {
    const now = new Date();
    const { insertedId } = await studies.insertOne({
      name: 'Default Study',
      description:
        'Pre-configured default study. Participants without a study code are enrolled here.',
      isDefault: true,
      isActive: true,
      groups: DEFAULT_GROUPS,
      questionnaires: [],
      createdAt: now,
      updatedAt: now,
    });
    study = { _id: insertedId };
    log.info('Default study seeded');
  }
}
