import express from 'express';
import neo4j from 'neo4j-driver';
import { makeGetDb } from '../utils/getDb.js';
import { createHabitsCrudRouter } from './habits/habitsCrudRouter.js';
import { createHabitsStatsRouter } from './habits/habitsStatsRouter.js';
import { createHabitsGraphRouter } from './habits/habitsGraphRouter.js';
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
 * @returns {express.Router}
 */
export function createHabitsRouter({
  db,
  neo4jRun,
  apiServiceUrl,
  libreTranslateUrl,
} = {}) {
  const router = express.Router();
  const getDb = makeGetDb(db);

  // Long-lived Neo4j driver — created once per router instance, reusing the connection pool
  const _neo4jDriver = neo4jRun
    ? null
    : neo4j.driver(
        process.env.NEO4J_URI || 'bolt://neo4j:7687',
        neo4j.auth.basic(
          process.env.NEO4J_USER || 'neo4j',
          process.env.NEO4J_PASSWORD || 'password'
        )
      );

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

  router.use(
    '/',
    createHabitsCrudRouter({
      getDb,
      queryNeo4j,
      apiServiceUrl,
      libreTranslateUrl,
      habitQueue: neo4jRun ? null : getHabitQueue(),
    })
  );
  router.use('/', createHabitsStatsRouter({ getDb, queryNeo4j }));
  router.use('/', createHabitsGraphRouter({ queryNeo4j, getDb }));

  // Start the BullMQ worker unless we are in test mode (neo4jRun injected).
  if (!neo4jRun) {
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
