import express from 'express';
import neo4j from 'neo4j-driver';
import { config } from '../utils/config.js';
import { registerNeo4jDriver } from '../utils/neo4jDrivers.js';
import { makeGetDb } from '../utils/getDb.js';
import { createHabitsCrudRouter } from './habits/habitsCrudRouter.js';
import { createHabitsStatsRouter } from './habits/habitsStatsRouter.js';
import { createHabitsGraphRouter } from './habits/habitsGraphRouter.js';
import { createVoiceRouter } from './habits/voiceTranscribeRouter.js';
import { getHabitQueue, startHabitWorker } from '../lib/habitQueue.js';

/**
 * Top-level habits router. Composes CRUD, stats, and graph sub-routers.
 * Shared infrastructure (Neo4j driver, DB factory) is created once here
 * and passed down to each sub-router.
 *
 * @param {object} opts
 * @param {object} [opts.db] - MongoDB connection (injected in tests)
 * @param {Function} [opts.neo4jRun] - Neo4j run function (injected in tests)
 * @param {string} [opts.apiServiceUrl]
 * @param {string} [opts.libreTranslateUrl]
 * @param {string} [opts.audioStorageDir] - Directory for recorded habit-donation voice clips
 * @returns {express.Router}
 */
export function createHabitsRouter({
  db,
  neo4jRun,
  apiServiceUrl,
  libreTranslateUrl,
  audioStorageDir,
  enableQueue = false,
} = {}) {
  const router = express.Router();
  const getDb = makeGetDb(db);

  // Long-lived Neo4j driver — created once per router instance, reusing the connection pool
  const _neo4jDriver = neo4jRun
    ? null
    : neo4j.driver(
        config.neo4j.uri,
        neo4j.auth.basic(config.neo4j.user, config.neo4j.password)
      );
  registerNeo4jDriver(_neo4jDriver);

  // Returns Array<Object> — either from injected neo4jRun or reusing the shared driver
  async function queryNeo4j(cypher, params = {}) {
    if (neo4jRun) return neo4jRun(cypher, params);
    const session = _neo4jDriver.session();
    try {
      const result = await session.run(cypher, params);
      return result.records.map((r) => r.toObject());
    } finally {
      await session.close();
      // Driver is NOT closed here — it lives for the lifetime of the process
    }
  }

  // The BullMQ queue/worker connect to Redis the moment they are constructed,
  // so they are strictly opt-in: only the real app boot passes enableQueue=true
  // (see app.js). Tests never set it, so building any router stays offline and
  // donation uses the synchronous fallback in habitsCrudRouter when the queue is
  // null. This avoids ECONNREFUSED when no Redis is present (e.g. the CI
  // integration job, which has Mongo + Neo4j but no Redis).
  const queueEnabled = enableQueue && !neo4jRun;

  router.use(
    '/',
    createHabitsCrudRouter({
      getDb,
      queryNeo4j,
      apiServiceUrl,
      libreTranslateUrl,
      habitQueue: queueEnabled ? getHabitQueue() : null,
    })
  );
  router.use('/', createHabitsStatsRouter({ getDb, queryNeo4j }));
  router.use('/', createHabitsGraphRouter({ queryNeo4j, getDb }));
  router.use('/', createVoiceRouter({ getDb, apiServiceUrl, audioStorageDir }));

  // Start the BullMQ worker only for a real running app (see queueEnabled above).
  if (queueEnabled) {
    const apiBase =
      apiServiceUrl || process.env.API_SERVICE_URL || 'http://recommender:8000';
    const translateUrl =
      libreTranslateUrl ||
      process.env.LIBRE_TRANSLATE_URL ||
      `http://${process.env.TRANSLATE_HOST || 'localhost'}:${process.env.TRANSLATE_PORT || '5000'}${process.env.TRANSLATE_PATH || '/translate'}`;
    startHabitWorker({ queryNeo4j, getDb, apiBase, translateUrl });
  }

  return router;
}

export default createHabitsRouter;
