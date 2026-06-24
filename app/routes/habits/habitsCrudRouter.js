import express from 'express';
import { randomUUID } from 'node:crypto';
import {
  classifyHabit,
  persistRejectedHabit,
  enqueueHabitDonation,
  shareHabit,
} from '../../services/habitDonationService.js';
import { translateHabit } from '../../utils/translate.js';
import { getJobStatus } from '../../lib/habitQueue.js';
import { SUPPORTED_LANGUAGES } from '../../utils/constants.js';
import {
  getAllHabits,
  getPublicHabits,
  getHabitAnnotationCounts,
  updateHabitAnnotation,
  addHabitComment,
  getHabitComments,
} from '../../db/habitQueries.js';
import { habitShareLimiter } from '../../middleware/rateLimiter.js';
import { logger } from '../../utils/logger.js';

/**
 * Handles CRUD-style habits routes: list, public, annotate, share, donate.
 * Mounts under /api/v1/habits by the parent habitsRouter.
 *
 * @param {object} opts
 * @param {Function} opts.getDb - MongoDB connection factory
 * @param {Function} opts.queryNeo4j - Neo4j query helper
 * @param {string} [opts.apiServiceUrl]
 * @param {string} [opts.libreTranslateUrl]
 * @returns {express.Router}
 */
const log = logger.child({ module: 'habitsCrudRouter' });

export function createHabitsCrudRouter({
  getDb,
  queryNeo4j,
  apiServiceUrl,
  libreTranslateUrl,
  habitQueue,
} = {}) {
  const router = express.Router();

  // GET /api/v1/habits
  // Returns all donated habits with translation and category fields.
  // Annotation counts come from Neo4j Habit node properties — no MongoDB scan.
  // Optional ?lang=en|de adds a displayText convenience field.
  router.get('/', async (req, res) => {
    try {
      const { lang } = req.query;
      const records = await getAllHabits(queryNeo4j);

      const habits = records.map((r) => {
        const uuid = r.uuid || null;
        const habit = {
          uuid,
          original: r.original || null,
          language: r.language || null,
          translationEN: r.translationEN || null,
          translationDE: r.translationDE || null,
          category: r.category || 'Other',
          bcioClass: r.bcioClass || '',
          annotationCounts: {
            helpful: r.annotationsHelpful ?? 0,
            iDoThis: r.annotationsIDoThis ?? 0,
          },
        };
        if (lang === 'en') {
          habit.displayText = habit.translationEN || habit.original;
        } else if (lang === 'de') {
          habit.displayText = habit.translationDE || habit.original;
        }
        return habit;
      });

      res.json(habits);
    } catch (err) {
      log.error({ err: err }, 'unhandled route error');
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  /**
   * @swagger
   * /habits/public:
   *   get:
   *     summary: Get anonymized public habit list
   *     description: Returns all donated habits with annotation counts. No personal data included. Useful for the habit graph visualization.
   *     tags: [Habits]
   *     security:
   *       - bearerAuth: []
   *     responses:
   *       200:
   *         description: List of anonymized habits
   *         content:
   *           application/json:
   *             schema:
   *               type: array
   *               items:
   *                 $ref: '#/components/schemas/Habit'
   *             example:
   *               - id: habit-001
   *                 name: Go for a 30-min walk daily
   *                 category: Group1
   *                 bcioClass: null
   *                 annotationCounts: { helpful: 5, iDoThis: 3 }
   *       401:
   *         description: Missing or invalid JWT
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Error'
   *       500:
   *         description: Internal server error
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Error'
   */
  // GET /api/v1/habits/public
  // Returns anonymized habit list with annotation counts from Neo4j — no MongoDB scan.
  router.get('/public', async (req, res) => {
    try {
      const records = await getPublicHabits(queryNeo4j);
      const habits = records.map((r) => ({
        id: r.id,
        name: r.name,
        category: r.category ? String(r.category).replace('hhh__', '') : null,
        bcioClass: r.bcioClass || null,
        annotationCounts: {
          helpful: r.annotationsHelpful ?? 0,
          iDoThis: r.annotationsIDoThis ?? 0,
        },
      }));
      res.json(habits);
    } catch (err) {
      log.error({ err: err }, 'unhandled route error');
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  /**
   * @swagger
   * /habits/{id}/annotate:
   *   post:
   *     summary: Annotate a habit
   *     description: Adds an anonymous annotation ("helpful" or "iDoThis") to a habit node. Returns updated annotation counts.
   *     tags: [Habits]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *         description: Neo4j habit node ID
   *         example: habit-001
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [type]
   *             properties:
   *               type:
   *                 type: string
   *                 enum: [helpful, iDoThis]
   *                 example: helpful
   *     responses:
   *       200:
   *         description: Annotation stored; updated counts returned
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 habitId: { type: string, example: habit-001 }
   *                 annotationCounts:
   *                   type: object
   *                   properties:
   *                     helpful: { type: integer, example: 6 }
   *                     iDoThis: { type: integer, example: 3 }
   *       400:
   *         description: Invalid annotation type
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Error'
   *             example:
   *               error: 'type must be "helpful" or "iDoThis"'
   *       401:
   *         description: Missing or invalid JWT
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Error'
   *       500:
   *         description: Internal server error
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Error'
   */
  // GET /api/v1/habits/my-annotations — returns the current user's own annotations
  router.get('/my-annotations', async (req, res) => {
    try {
      const userId = req.user?.sub;
      if (!userId || typeof userId !== 'string') {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      const database = await getDb();
      const docs = await database
        .collection('habit_annotations')
        .find({ userId }, { projection: { habitId: 1, type: 1, _id: 0 } })
        .toArray();
      const result = { helpful: [], iDoThis: [] };
      for (const doc of docs) {
        if (doc.type === 'helpful') result.helpful.push(doc.habitId);
        if (doc.type === 'iDoThis') result.iDoThis.push(doc.habitId);
      }
      res.json(result);
    } catch (err) {
      log.error({ err: err }, 'unhandled route error');
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // POST /api/v1/habits/:id/annotate
  // Adds or removes the requesting user's annotation and returns updated counts.
  // Body: { type: 'helpful'|'iDoThis', remove?: boolean }
  router.post('/:id/annotate', async (req, res) => {
    try {
      const { type, remove = false } = req.body || {};
      if (!['helpful', 'iDoThis'].includes(type)) {
        return res
          .status(400)
          .json({ error: 'type must be "helpful" or "iDoThis"' });
      }

      const userId = req.user?.sub;
      if (!userId || typeof userId !== 'string') {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const database = await getDb();
      const habitId = req.params.id;

      // Update MongoDB — scope all queries to the requesting user so one
      // user cannot add or remove another user's annotation.
      let delta = 0;
      if (remove) {
        const { deletedCount } = await database
          .collection('habit_annotations')
          .deleteOne({ habitId: String(habitId), type: String(type), userId });
        delta = deletedCount > 0 ? -1 : 0;
      } else {
        await database.collection('habit_annotations').insertOne({
          habitId,
          type,
          userId,
          createdAt: new Date(),
        });
        delta = 1;
      }

      // Mirror counts to Neo4j only when a document actually changed.
      if (delta !== 0) {
        await updateHabitAnnotation(queryNeo4j, habitId, type, delta);
      }

      // Read authoritative counts from Neo4j (single source of truth after mirror).
      const counts = await getHabitAnnotationCounts(queryNeo4j, habitId);
      res.json({ habitId, annotationCounts: counts });
    } catch (err) {
      log.error({ err: err }, 'unhandled route error');
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // GET /api/v1/habits/:id/comments — anonymous community comments, newest first
  router.get('/:id/comments', async (req, res) => {
    try {
      const comments = await getHabitComments(queryNeo4j, req.params.id);
      res.json({ habitId: req.params.id, comments });
    } catch (err) {
      log.error({ err: err }, 'unhandled route error');
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // POST /api/v1/habits/:id/comments — add an anonymous comment.
  // The Comment node carries no user identifier; ownership is recorded in
  // MongoDB (habit_comments) solely for rate limiting and GDPR erasure.
  router.post('/:id/comments', habitShareLimiter, async (req, res) => {
    try {
      const userId = req.user?.sub;
      if (!userId || typeof userId !== 'string') {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      const text = String(req.body?.text ?? '').trim();
      if (!text || text.length > 500) {
        return res
          .status(400)
          .json({ error: 'text is required (1-500 characters)' });
      }

      const habitId = req.params.id;
      const commentId = randomUUID();
      const created = await addHabitComment(queryNeo4j, habitId, {
        id: commentId,
        text,
      });
      if (!created) {
        return res.status(404).json({ error: 'Habit not found' });
      }

      const database = await getDb();
      await database.collection('habit_comments').insertOne({
        commentId,
        habitId: String(habitId),
        userId: String(userId),
        createdAt: new Date(),
      });

      res.status(201).json({ habitId, comment: created });
    } catch (err) {
      log.error({ err: err }, 'unhandled route error');
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // POST /api/v1/habits/share (and /donate alias)
  // Classify synchronously; rejected habits return 200 immediately, accepted
  // habits are enqueued and return 202 so the LLM pipeline runs off the request.
  async function handleShareHabit(req, res) {
    const {
      sentence,
      language,
      frequency,
      duration,
      health_benefit,
      wellbeing_impact,
    } = req.body || {};
    const userId = req.user?.sub;
    if (!userId || typeof userId !== 'string') {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    if (!sentence || !language) {
      return res
        .status(400)
        .json({ error: 'sentence and language are required' });
    }
    if (typeof sentence !== 'string' || sentence.length > 1000) {
      return res.status(400).json({
        error: 'sentence must be a string of at most 1000 characters',
      });
    }
    if (
      typeof language !== 'string' ||
      !SUPPORTED_LANGUAGES.includes(language.slice(0, 2).toLowerCase())
    ) {
      return res.status(400).json({
        error: `language must be a supported ISO 639-1 code (${SUPPORTED_LANGUAGES.join(', ')})`,
      });
    }
    const isValidRating = (v, max) =>
      v === undefined ||
      v === null ||
      (Number.isInteger(v) && v >= 1 && v <= max);
    if (
      !isValidRating(frequency, 4) ||
      !isValidRating(duration, 4) ||
      !isValidRating(health_benefit, 5) ||
      !isValidRating(wellbeing_impact, 5)
    ) {
      return res.status(400).json({ error: 'Invalid rating value' });
    }

    const apiBase =
      apiServiceUrl || process.env.API_SERVICE_URL || 'http://recommender:8000';
    const translateUrl =
      libreTranslateUrl ||
      process.env.LIBRE_TRANSLATE_URL ||
      `http://${process.env.TRANSLATE_HOST || 'localhost'}:${process.env.TRANSLATE_PORT || '5000'}${process.env.TRANSLATE_PATH || '/translate'}`;
    try {
      const uuid = randomUUID();

      // When no queue is available (e.g. test mode), fall back to the
      // synchronous pipeline so tests can verify end-to-end behaviour.
      if (!habitQueue) {
        const result = await shareHabit({
          uuid,
          sentence,
          language,
          userID: userId,
          frequency: frequency ?? null,
          duration: duration ?? null,
          healthBenefit: health_benefit ?? null,
          wellbeingImpact: wellbeing_impact ?? null,
          queryNeo4j,
          getDb,
          apiBase,
          translate: translateHabit,
          translateUrl,
        });
        return res.status(result.is_habit ? 201 : 200).json(result);
      }

      // Step 1 (sync, fast): classify — keeps the immediate "not a habit" UX.
      const classified = await classifyHabit(
        sentence,
        language,
        userId,
        apiBase
      );

      if (!classified.is_habit) {
        const result = await persistRejectedHabit(
          {
            uuid,
            sentence,
            language,
            userID: userId,
            confidence: classified.confidence,
          },
          queryNeo4j,
          getDb
        );
        return res.status(200).json(result);
      }

      // Step 2 (async): enqueue the expensive pipeline and return 202 immediately.
      const { jobId } = await enqueueHabitDonation({
        uuid,
        sentence,
        language,
        userID: userId,
        confidence: classified.confidence,
        frequency: frequency ?? null,
        duration: duration ?? null,
        healthBenefit: health_benefit ?? null,
        wellbeingImpact: wellbeing_impact ?? null,
        habitQueue,
      });

      return res.status(202).json({
        jobId,
        status: 'pending',
        message: 'Your habit has been submitted and is being analyzed.',
      });
    } catch (err) {
      if (err.status && Number.isInteger(err.status)) {
        if (process.env.NODE_ENV !== 'production') {
          console.error(
            '[share] Upstream/service error:',
            JSON.stringify({
              status: err.status,
              code: err.code || null,
              downstreamStatus: err.downstreamStatus || null,
              message: err.message || String(err),
              userId,
              language,
              sentenceLength: sentence.length,
            })
          );
        }
        return res.status(err.status).json({
          error: err.message || 'Service unavailable',
          ...(err.code ? { code: err.code } : {}),
        });
      }
      console.error(
        '[share] Unexpected error:',
        JSON.stringify({
          message: err?.message || String(err),
          stack: err?.stack || null,
          userId,
          language,
          sentenceLength: sentence.length,
        })
      );
      const detail =
        process.env.NODE_ENV !== 'production'
          ? err?.message || String(err)
          : undefined;
      return res.status(500).json({
        error: 'Internal server error',
        ...(detail ? { detail } : {}),
      });
    }
  }

  // GET /api/v1/habits/jobs/:jobId — poll donation job status from Redis.
  router.get('/jobs/:jobId', async (req, res) => {
    const userId = req.user?.sub;
    const { jobId } = req.params;
    try {
      const job = await getJobStatus(jobId);
      if (!job) return res.status(404).json({ error: 'Job not found' });
      if (job.userID !== userId)
        return res.status(403).json({ error: 'Forbidden' });
      const { userID: _drop, ...safe } = job;
      return res.json(safe);
    } catch (err) {
      log.error({ err: err.message }, 'failed to get job status');
      return res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Strict per-user rate limit on habit donation (10 submissions per hour).
  router.post('/share', habitShareLimiter, handleShareHabit);
  router.post('/donate', habitShareLimiter, handleShareHabit);

  return router;
}
