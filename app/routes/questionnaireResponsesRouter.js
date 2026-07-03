import express from 'express';
import neo4j from 'neo4j-driver';
import { makeGetDb } from '../utils/getDb.js';
import { logger } from '../utils/logger.js';
import {
  mergeUserAndHabits,
  createSubmissionWithScores,
} from '../db/userQueries.js';
import { markWindowSubmitted } from '../services/questionnaireScheduleService.js';

const log = logger.child({ module: 'questionnaireResponsesRouter' });

/**
 * Service-to-service router for questionnaire responses.
 * Mounted BEFORE JWT authenticate middleware — auth is done via X-Service-Auth-Token.
 */
export function createQuestionnaireResponsesServiceRouter({
  db,
  neo4jRun,
} = {}) {
  const router = express.Router();
  const getDb = makeGetDb(db);

  // Long-lived Neo4j driver for the service router — created once if not injected
  const _serviceNeo4jDriver = neo4jRun
    ? null
    : neo4j.driver(
        process.env.NEO4J_URI || 'bolt://neo4j:7687',
        neo4j.auth.basic(
          process.env.NEO4J_USER || 'neo4j',
          process.env.NEO4J_PASSWORD || 'password'
        )
      );

  async function queryServiceNeo4j(cypher, params = {}) {
    if (neo4jRun) return neo4jRun(cypher, params);
    const session = _serviceNeo4jDriver.session();
    try {
      const result = await session.run(cypher, params);
      return result.records.map((r) => r.toObject());
    } finally {
      await session.close();
    }
  }

  /**
   * GET /service/:userId — all questionnaire responses for a user's enrolled study.
   *
   * Resolves enrollment + questionnaire slugs via a single Neo4j traversal, then
   * returns the most recent response for each slug as { [slug]: responseOrNull }.
   * Returns {} when the user is not enrolled or the study has no questionnaires.
   */
  router.get('/service/:userId', async (req, res) => {
    try {
      const token = req.headers['x-service-auth-token'];
      const expected = process.env.API_SERVICE_SECRET;
      if (!token || !expected || token !== expected) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const { userId } = req.params;
      const database = await getDb();

      // Single Neo4j traversal: User → ENROLLED_IN → Study → HAS_QUESTIONNAIRE → Questionnaire
      const rows = await queryServiceNeo4j(
        `MATCH (u:User {userID: $userId})-[:ENROLLED_IN]->(s:Study)-[:HAS_QUESTIONNAIRE]->(q:Questionnaire)
         RETURN collect(q.slug) AS slugs`,
        { userId }
      );

      const slugs = (rows[0]?.slugs ?? []).filter(Boolean);
      if (slugs.length === 0) {
        return res.json({});
      }

      // 4. Fetch the most recent response per slug in one aggregation
      const latestResponses = await database
        .collection('form_responses')
        .aggregate([
          { $match: { userId, questionnaireSlug: { $in: slugs } } },
          { $sort: { submittedAt: -1 } },
          {
            $group: {
              _id: '$questionnaireSlug',
              doc: { $first: '$$ROOT' },
            },
          },
        ])
        .toArray();

      const result = Object.fromEntries(slugs.map((s) => [s, null]));
      for (const { _id: slug, doc } of latestResponses) {
        const { _id, ...rest } = doc;
        result[slug] = rest;
      }

      return res.json(result);
    } catch (err) {
      log.error({ err: err }, 'unhandled route error');
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  router.get('/service/:userId/:slug', async (req, res) => {
    try {
      const token = req.headers['x-service-auth-token'];
      const expected = process.env.API_SERVICE_SECRET;
      if (!token || !expected || token !== expected) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      const { userId, slug } = req.params;
      const database = await getDb();
      const responses = await database
        .collection('form_responses')
        .find({ userId, questionnaireSlug: slug })
        .sort({ submittedAt: -1 })
        .limit(1)
        .toArray();

      if (responses.length === 0) {
        return res.status(404).json({ error: 'No response found' });
      }
      const { _id, ...responseData } = responses[0];
      res.json(responseData);
    } catch (err) {
      log.error({ err: err }, 'unhandled route error');
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  return router;
}

export function createQuestionnaireResponsesRouter({ db, neo4jRun } = {}) {
  const router = express.Router();
  const getDb = makeGetDb(db);

  // Long-lived Neo4j driver — created once per router instance if not injected
  const _neo4jDriver = neo4jRun
    ? null
    : neo4j.driver(
        process.env.NEO4J_URI || 'bolt://neo4j:7687',
        neo4j.auth.basic(
          process.env.NEO4J_USER || 'neo4j',
          process.env.NEO4J_PASSWORD || 'password'
        )
      );

  async function queryNeo4j(cypher, params = {}) {
    if (neo4jRun) return neo4jRun(cypher, params);
    const session = _neo4jDriver.session();
    try {
      const result = await session.run(cypher, params);
      return result.records.map((r) => r.toObject());
    } finally {
      await session.close();
    }
  }

  async function syncUserGraph(userId, questionnaireId, answers) {
    await mergeUserAndHabits(queryNeo4j, userId);
    await createSubmissionWithScores(
      queryNeo4j,
      userId,
      questionnaireId,
      answers
    );
  }

  // Ensure index on form_responses for efficient per-user queries
  async function ensureIndex(database) {
    try {
      await database
        .collection('form_responses')
        .createIndex(
          { userId: 1, questionnaireSlug: 1, submittedAt: -1 },
          { background: true }
        );
    } catch {
      // Non-fatal: mock DBs used in tests do not implement createIndex
    }
  }

  // Kick off index creation eagerly (non-blocking)
  (async () => {
    try {
      const database = await getDb();
      await ensureIndex(database);
    } catch {
      // Non-fatal: initialization errors are ignored
    }
  })();

  /**
   * @swagger
   * /questionnaire-responses:
   *   post:
   *     summary: Submit a questionnaire response
   *     description: Saves the authenticated user's answers for a questionnaire to the form_responses MongoDB collection.
   *     tags: [Questionnaires]
   *     security:
   *       - bearerAuth: []
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [questionnaireSlug, answers]
   *             properties:
   *               questionnaireSlug:
   *                 type: string
   *                 example: sliq
   *               answers:
   *                 type: object
   *                 description: Map of questionId to answer value
   *                 example: { "sliq_diet": "2", "sliq_activity": "3" }
   *     responses:
   *       201:
   *         description: Response saved successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 ok:
   *                   type: boolean
   *       400:
   *         description: Missing required fields
   *       401:
   *         description: Missing or invalid JWT
   */
  router.post('/', async (req, res) => {
    try {
      const userId = req.user?.sub;
      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const { questionnaireSlug, answers } = req.body;
      if (!questionnaireSlug || typeof questionnaireSlug !== 'string') {
        return res.status(400).json({ error: 'questionnaireSlug is required' });
      }
      if (!answers || typeof answers !== 'object' || Array.isArray(answers)) {
        return res.status(400).json({ error: 'answers must be an object' });
      }

      const database = await getDb();
      const submittedAt = new Date();
      const { insertedId } = await database
        .collection('form_responses')
        .insertOne({
          userId,
          questionnaireSlug,
          answers,
          submittedAt,
        });

      // Mark the participant's next scheduled window for this questionnaire as
      // completed and link it to the response (best-effort — ad-hoc / unscheduled
      // submissions simply have no window to close).
      try {
        await markWindowSubmitted({
          db: database,
          userId,
          questionnaireSlug,
          responseId: insertedId,
          submittedAt,
        });
      } catch (err) {
        log.error({ err }, '[questionnaire-responses] window link error');
      }

      // Sync to Neo4j — non-blocking: errors are logged but never surface to the caller
      syncUserGraph(userId, questionnaireSlug, answers).catch((err) => {
        log.error({ err: err }, '[questionnaire-responses] neo4j sync error:');
      });

      res.status(201).json({ ok: true });
    } catch (err) {
      log.error({ err: err }, 'unhandled route error');
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  /**
   * @swagger
   * /questionnaire-responses/me:
   *   get:
   *     summary: Get all questionnaire responses for the authenticated user
   *     description: Returns all responses submitted by the authenticated user, ordered by most recent first.
   *     tags: [Questionnaires]
   *     security:
   *       - bearerAuth: []
   *     responses:
   *       200:
   *         description: List of responses
   *       401:
   *         description: Missing or invalid JWT
   */
  router.get('/me', async (req, res) => {
    try {
      const userId = req.user?.sub;
      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const database = await getDb();
      const responses = await database
        .collection('form_responses')
        .find({ userId: String(userId) })
        .sort({ submittedAt: -1 })
        .toArray();

      // Strip internal MongoDB _id from response
      res.json(responses.map(({ _id, ...rest }) => rest));
    } catch (err) {
      log.error({ err: err }, 'unhandled route error');
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  /**
   * @swagger
   * /questionnaire-responses/me/{slug}:
   *   get:
   *     summary: Get the most recent response for a specific questionnaire
   *     description: Returns the most recent response submitted by the authenticated user for the given questionnaire slug.
   *     tags: [Questionnaires]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: slug
   *         required: true
   *         schema:
   *           type: string
   *         description: Questionnaire slug (e.g. sliq, rand-36)
   *     responses:
   *       200:
   *         description: The most recent response
   *       404:
   *         description: No response found for this slug
   *       401:
   *         description: Missing or invalid JWT
   */
  router.get('/me/:slug', async (req, res) => {
    try {
      const userId = req.user?.sub;
      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const { slug } = req.params;
      const database = await getDb();
      const responses = await database
        .collection('form_responses')
        .find({ userId: String(userId), questionnaireSlug: String(slug) })
        .sort({ submittedAt: -1 })
        .limit(1)
        .toArray();

      if (responses.length === 0) {
        return res.status(404).json({ error: 'No response found' });
      }

      const { _id, ...responseData } = responses[0];
      res.json(responseData);
    } catch (err) {
      log.error({ err: err }, 'unhandled route error');
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  return router;
}
