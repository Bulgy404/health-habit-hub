/**
 * Keeps the Neo4j questionnaire *definitions* (Questionnaire + QuestionnaireItem
 * nodes) in step with the MongoDB `questionnaires` collection, which is the
 * source of truth.
 *
 * Two entry points:
 *  - `syncAllQuestionnaireDefinitions` — a startup reconcile, so seeded
 *    questionnaires (services/defaultStudySeedService.js) and any drift are
 *    covered without threading a Neo4j runner through the seed path.
 *  - `syncOneQuestionnaireDefinition` — called from the admin questionnaire CRUD
 *    handlers so admin-created questionnaires appear in the graph immediately.
 *
 * Both are best-effort: the graph is a projection, so failures are logged and
 * never propagate (a Neo4j outage must not break questionnaire management).
 */

import { connect as connectMongo } from '../models/survey.js';
import { runNeo4j } from '../utils/neo4jDrivers.js';
import {
  syncQuestionnaireDefinition,
  deleteQuestionnaireDefinition,
} from '../db/questionnaireQueries.js';
import { logger } from '../utils/logger.js';

const log = logger.child({ module: 'questionnaireGraphSync' });

const QUESTIONNAIRES = 'questionnaires';

/**
 * Sync a single questionnaire definition (by slug) into the graph.
 * @param {{db: object, slug: string, neo4jRun?: Function}} deps
 */
export async function syncOneQuestionnaireDefinition({ db, slug, neo4jRun }) {
  const run = neo4jRun || runNeo4j;
  if (!run || !slug) return;
  const doc = await db.collection(QUESTIONNAIRES).findOne({ slug });
  if (!doc) {
    await deleteQuestionnaireDefinition(run, slug);
    return;
  }
  await syncQuestionnaireDefinition(run, {
    slug: doc.slug,
    title: doc.title,
    version: doc.version,
    questions: doc.questions,
  });
}

/**
 * Remove a questionnaire definition from the graph (admin deleted it).
 * @param {{slug: string, neo4jRun?: Function}} deps
 */
export async function removeQuestionnaireDefinition({ slug, neo4jRun }) {
  const run = neo4jRun || runNeo4j;
  if (!run || !slug) return;
  await deleteQuestionnaireDefinition(run, slug);
}

/**
 * Reconcile every questionnaire definition into the graph. Safe to run on every
 * boot — `syncQuestionnaireDefinition` is idempotent.
 *
 * @param {{db?: object, neo4jRun?: Function}} [deps]
 * @returns {Promise<number>} number of questionnaires synced
 */
export async function syncAllQuestionnaireDefinitions({ db, neo4jRun } = {}) {
  const run = neo4jRun || runNeo4j;
  if (!run) return 0;
  const database = db || (await connectMongo());
  const docs = await database
    .collection(QUESTIONNAIRES)
    .find({}, { projection: { slug: 1, title: 1, version: 1, questions: 1 } })
    .toArray();

  let synced = 0;
  for (const doc of docs) {
    if (!doc?.slug) continue;
    try {
      await syncQuestionnaireDefinition(run, {
        slug: doc.slug,
        title: doc.title,
        version: doc.version,
        questions: doc.questions,
      });
      synced += 1;
    } catch (err) {
      log.warn(
        { err, slug: doc.slug },
        'Could not sync questionnaire definition to Neo4j'
      );
    }
  }
  if (synced > 0) {
    log.info({ count: synced }, 'Questionnaire definitions synced to Neo4j');
  }
  return synced;
}

/**
 * Fire-and-forget wrapper for startup. Never throws.
 */
export function runSyncAllQuestionnaireDefinitions() {
  syncAllQuestionnaireDefinitions().catch((err) =>
    log.warn({ err }, 'Questionnaire graph sync skipped')
  );
}
