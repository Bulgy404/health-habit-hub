import express from 'express';
import { isPrivileged } from '../middleware/roles.js';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isValidUserId(id) {
  return typeof id === 'string' && UUID_RE.test(id);
}

const PROXY_TIMEOUT_MS = parseInt(process.env.RECOMMENDER_TIMEOUT_MS ?? '180000', 10);

async function proxyToRecommender(req, res, targetUrl) {
  const headers = {};
  if (req.headers.authorization) {
    headers['Authorization'] = req.headers.authorization;
  }
  if (process.env.API_SERVICE_SECRET) {
    headers['X-Service-Auth-Token'] = process.env.API_SERVICE_SECRET;
  }
  const fetchOptions = { method: req.method, headers, signal: AbortSignal.timeout(PROXY_TIMEOUT_MS) };
  if (req.body && Object.keys(req.body).length > 0) {
    fetchOptions.body = JSON.stringify(req.body);
    headers['Content-Type'] = 'application/json';
  }
  try {
    const upstream = await fetch(targetUrl, fetchOptions);
    const data = await upstream.json();
    res.status(upstream.status).json(data);
  } catch (err) {
    if (err.name === 'TimeoutError' || err.name === 'AbortError') {
      res.status(504).json({ error: 'Recommender service timed out' });
    } else {
      res.status(502).json({ error: 'Recommender service unavailable' });
    }
  }
}

export function createRecommendRouter({ recommenderUrl } = {}) {
  const baseUrl =
    recommenderUrl || process.env.RECOMMENDER_URL || 'http://recommender:8000';
  const router = express.Router();

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

  // POST /api/v1/recommend/generate → Python POST /api/v1/llm/recommend
  router.post('/generate', async (req, res) => {
    await proxyToRecommender(req, res, `${baseUrl}/api/v1/llm/recommend`);
  });

  return router;
}

export default createRecommendRouter;
