import express from 'express';
import { isPrivileged } from '../middleware/roles.js';
import { productAnalytics } from '../services/productAnalyticsService.js';
import { makeGetDb } from '../utils/getDb.js';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isValidUserId(id) {
  return typeof id === 'string' && UUID_RE.test(id);
}

const PROXY_TIMEOUT_MS = parseInt(
  process.env.RECOMMENDER_TIMEOUT_MS ?? '180000',
  10
);

function notifyResult(listener, result) {
  if (!listener) return;
  Promise.resolve(listener(result)).catch(() => {
    // Analytics is deliberately detached from the participant response.
  });
}

async function proxyToRecommender(req, res, targetUrl, onResult) {
  const startedAt = Date.now();
  const headers = {};
  if (req.headers.authorization) {
    headers['Authorization'] = req.headers.authorization;
  }
  if (process.env.API_SERVICE_SECRET) {
    headers['X-Service-Auth-Token'] = process.env.API_SERVICE_SECRET;
  }
  const fetchOptions = {
    method: req.method,
    headers,
    signal: AbortSignal.timeout(PROXY_TIMEOUT_MS),
  };
  if (req.body && Object.keys(req.body).length > 0) {
    fetchOptions.body = JSON.stringify(req.body);
    headers['Content-Type'] = 'application/json';
  }
  try {
    const upstream = await fetch(targetUrl, fetchOptions);
    // Preserve the upstream status even when the body is empty or not JSON
    // (e.g. 204 No Content, or an HTML error page from an intermediary) —
    // parsing blindly would otherwise mask the real status as a 502 below.
    const text = await upstream.text();
    if (!text) {
      notifyResult(onResult, {
        status: upstream.status,
        data: null,
        latencyMs: Date.now() - startedAt,
        cacheHit: upstream.headers.get('x-hhh-recommendation-cache') === 'hit',
      });
      return res.status(upstream.status).end();
    }
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      notifyResult(onResult, {
        status: upstream.status,
        data: null,
        latencyMs: Date.now() - startedAt,
        cacheHit: false,
      });
      return res
        .status(upstream.status)
        .json({ error: 'Recommender returned a non-JSON response' });
    }
    notifyResult(onResult, {
      status: upstream.status,
      data,
      latencyMs: Date.now() - startedAt,
      cacheHit: upstream.headers.get('x-hhh-recommendation-cache') === 'hit',
    });
    res.status(upstream.status).json(data);
  } catch (err) {
    if (err.name === 'TimeoutError' || err.name === 'AbortError') {
      notifyResult(onResult, {
        status: 504,
        reason: 'timeout',
        latencyMs: Date.now() - startedAt,
        cacheHit: false,
      });
      res.status(504).json({ error: 'Recommender service timed out' });
    } else {
      notifyResult(onResult, {
        status: 502,
        reason: 'unavailable',
        latencyMs: Date.now() - startedAt,
        cacheHit: false,
      });
      res.status(502).json({ error: 'Recommender service unavailable' });
    }
  }
}

export function createRecommendRouter({ recommenderUrl, db } = {}) {
  const baseUrl =
    recommenderUrl || process.env.RECOMMENDER_URL || 'http://recommender:8000';
  const router = express.Router();
  const getDb = makeGetDb(db);

  async function trackGeneration(req, result) {
    if (!productAnalytics.enabled) return;
    const userId = String(req.user?.sub ?? '');
    if (!userId) return;
    let enrollment = null;
    try {
      const database = await getDb();
      enrollment = await database
        .collection('enrollments')
        .findOne({ userId }, { projection: { studyId: 1, groupId: 1 } });
    } catch {
      // Missing context must not suppress the event; the service uses a
      // controlled `not_assigned` sentinel for unavailable enrollment data.
    }

    const context = {
      distinctId: userId,
      studyId: enrollment?.studyId?.toString(),
      groupId: enrollment?.groupId?.toString(),
    };
    if (result.status >= 200 && result.status < 300 && result.data) {
      productAnalytics.capture({
        ...context,
        event: 'recommendation_generated',
        properties: {
          latency_ms: result.latencyMs,
          count: Array.isArray(result.data.recommendations)
            ? result.data.recommendations.length
            : 0,
          cache_hit: result.cacheHit,
        },
      });
      return;
    }
    productAnalytics.capture({
      ...context,
      event: 'recommendation_failed',
      properties: {
        latency_ms: result.latencyMs,
        reason:
          result.reason ??
          (result.status === 504 ? 'timeout' : 'upstream_error'),
      },
    });
  }

  /**
   * @swagger
   * /recommend/{userId}/history:
   *   get:
   *     summary: Get recommendation history for a user
   *     description: Proxies to the Python recommender service. Returns all past recommendations (accepted and dismissed) for the given user.
   *     tags: [Recommend]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: userId
   *         required: true
   *         schema:
   *           type: string
   *           format: uuid
   *         description: Keycloak user UUID
   *         example: a1b2c3d4-1234-5678-abcd-ef0123456789
   *     responses:
   *       200:
   *         description: Recommendation history list
   *         content:
   *           application/json:
   *             schema:
   *               type: array
   *               items:
   *                 type: object
   *                 properties:
   *                   recommendationId: { type: string }
   *                   type: { type: string, enum: [accepted, dismissed] }
   *                   timestamp: { type: string, format: date-time }
   *             example:
   *               - recommendationId: rec-001
   *                 type: accepted
   *                 timestamp: "2026-03-15T08:00:00.000Z"
   *       401:
   *         description: Missing or invalid JWT
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Error'
   */
  // GET /api/v1/recommend/:userId/history → Python GET /recommend/:userId/history
  router.get('/:userId/history', async (req, res) => {
    if (!isValidUserId(req.params.userId)) {
      return res.status(400).json({ error: 'Invalid userId' });
    }
    // IDOR guard: participants can only access their own history
    if (!isPrivileged(req.user) && req.user?.sub !== req.params.userId) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    await proxyToRecommender(
      req,
      res,
      `${baseUrl}/recommend/${req.params.userId}/history`
    );
  });

  /**
   * @swagger
   * /recommend/{userId}:
   *   get:
   *     summary: Get habit recommendations for a user
   *     description: Proxies to the Python recommender service. Returns a list of personalized habit recommendations with rationale and BCIO citation.
   *     tags: [Recommend]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: userId
   *         required: true
   *         schema:
   *           type: string
   *           format: uuid
   *         description: Keycloak user UUID
   *         example: a1b2c3d4-1234-5678-abcd-ef0123456789
   *     responses:
   *       200:
   *         description: List of habit recommendations
   *         content:
   *           application/json:
   *             schema:
   *               type: array
   *               items:
   *                 type: object
   *                 properties:
   *                   recommendationId: { type: string }
   *                   habitName: { type: string }
   *                   rationale: { type: string }
   *                   citation: { type: string }
   *             example:
   *               - recommendationId: rec-001
   *                 habitName: Walk 30 minutes daily
   *                 rationale: Based on your goal to exercise more
   *                 citation: BCIO:0000042
   *       401:
   *         description: Missing or invalid JWT
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Error'
   */
  // GET /api/v1/recommend/:userId → Python GET /recommend/:userId
  router.get('/:userId', async (req, res) => {
    if (!isValidUserId(req.params.userId)) {
      return res.status(400).json({ error: 'Invalid userId' });
    }
    // IDOR guard: participants can only access their own recommendations
    if (!isPrivileged(req.user) && req.user?.sub !== req.params.userId) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    await proxyToRecommender(
      req,
      res,
      `${baseUrl}/recommend/${req.params.userId}`
    );
  });

  /**
   * @swagger
   * /recommend/classify:
   *   post:
   *     summary: Classify a habit text into a BCIO behavior category
   *     description: Proxies to the Python recommender context classifier. Returns the predicted BCIO class for the given habit description.
   *     tags: [Recommend]
   *     security:
   *       - bearerAuth: []
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [text]
   *             properties:
   *               text:
   *                 type: string
   *                 description: Free-text habit description to classify
   *                 example: I go for a 30-minute walk every morning
   *     responses:
   *       200:
   *         description: Classification result
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 class:
   *                   type: string
   *                   example: Physical activity
   *                 confidence:
   *                   type: number
   *                   example: 0.92
   *                 bcioUri:
   *                   type: string
   *                   example: "http://humanbehaviourchange.org/ontology/BCIO_000042"
   *       401:
   *         description: Missing or invalid JWT
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Error'
   */
  // POST /api/v1/recommend/classify → Python POST /classify
  router.post('/classify', async (req, res) => {
    await proxyToRecommender(req, res, `${baseUrl}/classify`);
  });

  /**
   * @swagger
   * /recommend/generate:
   *   post:
   *     summary: Generate personalised habit recommendations
   *     description: >-
   *       Proxies to the Python recommender's POST /api/v1/llm/recommend (M3 single-LLM-call pipeline).
   *       The goal is guarded input: a prompt-injection screen (EN + DE) and an LLM refusal backstop
   *       reject shady or off-topic goals with 422 and a user-facing reason. Recommendations are
   *       written in the language of the goal. Each item carries paper citations (with DOI links when
   *       curated in API-service/data/references.json) and a suggested implementation-intention cue.
   *       Graph provenance (habit UUIDs) is logged and stored server-side, never returned.
   *     tags:
   *       - Recommend
   *     security:
   *       - bearerAuth: []
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [user_id, goal, session_id]
   *             properties:
   *               user_id:
   *                 type: string
   *                 format: uuid
   *               goal:
   *                 type: string
   *                 maxLength: 2000
   *                 example: besser schlafen
   *               session_id:
   *                 type: string
   *     responses:
   *       '200':
   *         description: Generated recommendations
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 recommendation_id:
   *                   type: string
   *                 goal:
   *                   type: string
   *                 generated_at:
   *                   type: string
   *                   format: date-time
   *                 recommendations:
   *                   type: array
   *                   items:
   *                     type: object
   *                     properties:
   *                       title:
   *                         type: string
   *                       body:
   *                         type: string
   *                       rationale:
   *                         type: string
   *                         description: Plain language, cites papers in Author (Year) style
   *                       suggested_cue:
   *                         type: string
   *                         description: Suggested "when/where" trigger phrase for the implementation intention
   *                       sources:
   *                         type: array
   *                         description: Academic paper citations backing this recommendation
   *                         items:
   *                           type: object
   *                           properties:
   *                             filename:
   *                               type: string
   *                             title:
   *                               type: string
   *                             excerpt:
   *                               type: string
   *                               description: Preformatted citation, e.g. "Wood & Rünger (2016) — Psychology of Habit"
   *                             quote:
   *                               type: string
   *                               description: Verbatim sentence(s) from the paper backing this recommendation, when the LLM supplied one; empty otherwise
   *                             url:
   *                               type: string
   *                               description: DOI/publisher link when curated in references.json; empty otherwise
   *       '422':
   *         description: Goal rejected by the input guard (prompt injection, harmful, or off-topic)
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 detail:
   *                   type: string
   *                   example: Only health-related goals are supported.
   *       '401':
   *         description: Missing or invalid JWT
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Error'
   *       '504':
   *         description: Recommender service timed out (RECOMMENDER_TIMEOUT_MS)
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Error'
   */
  // POST /api/v1/recommend/generate → Python POST /api/v1/llm/recommend
  router.post('/generate', async (req, res) => {
    if (
      !isPrivileged(req.user) &&
      req.body?.user_id !== undefined &&
      req.body.user_id !== req.user?.sub
    ) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    await proxyToRecommender(
      req,
      res,
      `${baseUrl}/api/v1/llm/recommend`,
      (result) => trackGeneration(req, result)
    );
  });

  return router;
}

export default createRecommendRouter;
