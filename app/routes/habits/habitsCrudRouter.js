import express from 'express';
import { randomUUID } from 'node:crypto';
import {
  enqueueHabitDonation,
  shareHabit,
  createDonationRecord,
  getPostDonationQuestionnaire,
  markDonationOutcome,
} from '../../services/habitDonationService.js';
import { getEnrollment } from '../../services/enrollmentNeo4j.js';
import { resolveHabitConfig } from '../../services/habitConfigService.js';
import { COLLECTION as HABIT_COMMENTS_COLLECTION } from '../../models/habitComment.js';
import { translateHabit, translateTerm } from '../../utils/translate.js';
import { getJobStatus } from '../../lib/habitQueue.js';
import { getOrComputeStitch } from '../../lib/stitchCache.js';
import { SUPPORTED_LANGUAGES } from '../../utils/constants.js';
import {
  getAllHabits,
  getPublicHabits,
  getHabitAnnotationCounts,
  updateHabitAnnotation,
  addHabitComment,
  getHabitComments,
  reportComment,
  getRelatedHabits,
} from '../../db/habitQueries.js';
import { moderateComment } from '../../services/commentModerationService.js';
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
  // GET /api/v1/habits/:id/related — semantically similar habits (top-N by
  // embedding similarity, capped). Falls back to an empty list when the source
  // habit has no embedding; the client then uses its own local fallback.
  router.get('/:id/related', async (req, res) => {
    try {
      const limit = Math.min(
        20,
        Math.max(1, parseInt(req.query.limit, 10) || 10)
      );
      const { lang } = req.query;
      const rows = await getRelatedHabits(queryNeo4j, req.params.id, limit);
      const habits = rows.map((r) => {
        const displayText =
          lang === 'de'
            ? r.translationDE || r.original
            : lang === 'en'
              ? r.translationEN || r.original
              : r.original;
        return {
          uuid: r.uuid,
          original: r.original,
          translationEN: r.translationEN,
          translationDE: r.translationDE,
          category: r.category
            ? String(r.category).replace('hhh__', '')
            : 'Other',
          displayText,
          score: r.score,
        };
      });
      res.json(habits);
    } catch (err) {
      log.error({ err: err }, 'related habits query failed');
      // Non-fatal: the client falls back to its local related list.
      res.json([]);
    }
  });

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
      // Auto-moderation: flagged comments are held out of the public listing
      // until a researcher/admin reviews them (see the admin comments queue),
      // so most comments never need a human to look at them at all.
      const { flagged, reason } = moderateComment({ text });
      const created = await addHabitComment(queryNeo4j, habitId, {
        id: commentId,
        text,
        flagged,
        reason,
      });
      if (!created) {
        return res.status(404).json({ error: 'Habit not found' });
      }

      const database = await getDb();
      await database.collection(HABIT_COMMENTS_COLLECTION).insertOne({
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

  // POST /api/v1/habits/:id/comments/:commentId/report — App Store Guideline
  // 1.2: lets a participant report an objectionable comment. Immediately
  // pulls it out of the public listing (same effect as auto-moderation) and
  // re-queues it in the admin moderation queue for a human decision — it
  // never becomes visible again, to anyone, including the original poster,
  // until a researcher/admin re-approves it.
  router.post('/:id/comments/:commentId/report', async (req, res) => {
    try {
      const userId = req.user?.sub;
      if (!userId || typeof userId !== 'string') {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      const found = await reportComment(queryNeo4j, req.params.commentId);
      if (!found) {
        return res.status(404).json({ error: 'Comment not found' });
      }
      res.json({ ok: true, commentId: req.params.commentId });
    } catch (err) {
      log.error({ err: err }, 'unhandled route error');
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // POST /api/v1/habits/share (and /donate alias)
  // Enqueues the habit and returns 202 as soon as it's written to Redis;
  // classification and the rest of the pipeline run off-request in the
  // BullMQ worker (see lib/habitQueue.js). Falls back to the fully
  // synchronous shareHabit() when no queue is configured (tests).
  async function handleShareHabit(req, res) {
    const {
      sentence,
      language,
      frequency,
      duration,
      health_benefit,
      wellbeing_impact,
      habitType,
      stackedOnUuid,
      creationMode,
      inputMode,
      transcript,
      transcriptEdited,
    } = req.body || {};
    const requestedInputMode = inputMode === 'speech' ? 'speech' : 'text';
    // §7.4/§7.1 — optional on the donation path: the structured New Habit
    // flow sends an explicit choice, but free-text community donations
    // (donate_screen.dart) never do. Pass through only a recognised explicit
    // value; leave it undefined otherwise so shareHabit() falls back to the
    // classifier's own build/quit read of the sentence instead of guessing.
    const explicitHabitType =
      habitType === 'build' || habitType === 'quit' ? habitType : undefined;
    const safeCreationMode =
      creationMode === 'stacked' ? 'stacked' : 'standalone';
    const safeStackedOnUuid =
      typeof stackedOnUuid === 'string' && stackedOnUuid ? stackedOnUuid : null;
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

      // Resolve the participant's studyId/groupId so Neo4j Habit nodes can
      // be tagged for research queries — best-effort, null for non-enrolled
      // users.
      let studyId = null;
      let groupId = null;
      try {
        const enrollment = await getEnrollment(queryNeo4j, userId);
        studyId = enrollment?.studyId ?? null;
        groupId = enrollment?.groupId ?? null;
      } catch {
        // Non-fatal: missing studyId is fine, habit is still stored.
      }

      // Resolve the admin-configured donation input mode + optional
      // post-donation questionnaire for this participant's study/group.
      // Reject a speech submission the config doesn't actually permit
      // server-side, rather than trusting the client-declared mode.
      const database = await getDb();
      const resolvedConfig = await resolveHabitConfig({
        db: database,
        userId,
        neo4jRun: queryNeo4j,
        lang: language.slice(0, 2).toLowerCase(),
      });
      if (
        requestedInputMode === 'speech' &&
        resolvedConfig.donationInputMode === 'text'
      ) {
        return res.status(403).json({
          error: 'Speech input is not enabled for this study/group.',
        });
      }

      const postDonationQuestionnaireSlug = await getPostDonationQuestionnaire({
        db: database,
        slug: resolvedConfig.donationQuestionnaireSlug,
      });
      await createDonationRecord({
        db: database,
        uuid,
        userID: userId,
        studyId,
        groupId,
        inputMode: requestedInputMode,
        transcript:
          requestedInputMode === 'speech' && typeof transcript === 'string'
            ? transcript
            : null,
        transcriptEdited:
          requestedInputMode === 'speech' ? transcriptEdited === true : null,
        questionnaireSlug: postDonationQuestionnaireSlug,
      });

      // When no queue is available (e.g. test mode), fall back to the
      // synchronous pipeline so tests can verify end-to-end behaviour.
      if (!habitQueue) {
        const result = await shareHabit({
          uuid,
          sentence,
          language,
          userID: userId,
          studyId,
          frequency: frequency ?? null,
          duration: duration ?? null,
          healthBenefit: health_benefit ?? null,
          wellbeingImpact: wellbeing_impact ?? null,
          habitType: explicitHabitType,
          stackedOnUuid: safeStackedOnUuid,
          creationMode: safeCreationMode,
          queryNeo4j,
          getDb,
          apiBase,
          translate: translateHabit,
          translateTerm,
          translateUrl,
        });
        await markDonationOutcome({
          db: database,
          uuid,
          isHabit: result.is_habit,
        });
        return res.status(result.is_habit ? 201 : 200).json({
          ...result,
          uuid,
          postDonationQuestionnaireSlug,
        });
      }

      // Classification (and the rest of the pipeline) now runs inside the
      // BullMQ worker rather than here, so the response only waits on the
      // Redis enqueue — not on the classifier LLM call. This trades the
      // previous "instant not-a-habit" rejection for a fast "shared"
      // response; the true accept/reject outcome is available afterwards
      // via GET /habits/jobs/:jobId.
      const { jobId } = await enqueueHabitDonation({
        uuid,
        sentence,
        language,
        userID: userId,
        studyId,
        frequency: frequency ?? null,
        duration: duration ?? null,
        healthBenefit: health_benefit ?? null,
        wellbeingImpact: wellbeing_impact ?? null,
        habitType: explicitHabitType,
        stackedOnUuid: safeStackedOnUuid,
        creationMode: safeCreationMode,
        habitQueue,
      });

      return res.status(202).json({
        jobId,
        uuid,
        status: 'pending',
        message: 'Your habit has been submitted and is being analyzed.',
        postDonationQuestionnaireSlug,
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
    // No queue (synchronous/test mode) → there are no async jobs to report.
    if (!habitQueue) return res.status(404).json({ error: 'Job not found' });
    try {
      const job = await getJobStatus(jobId, habitQueue);
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

  // POST /api/v1/habits/stitch-intention — proxy to API-service LLM
  // Merges user-entered action + cues into one implementation intention sentence.
  router.post('/stitch-intention', async (req, res) => {
    const { action, cues, language = 'en' } = req.body || {};
    if (!action || !Array.isArray(cues) || cues.length === 0) {
      return res.status(400).json({ error: 'action and cues are required' });
    }
    const apiBase =
      apiServiceUrl || process.env.API_SERVICE_URL || 'http://recommender:8000';
    const headers = { 'Content-Type': 'application/json' };
    if (process.env.API_SERVICE_SECRET)
      headers['X-Service-Auth-Token'] = process.env.API_SERVICE_SECRET;

    // Sentinel used to distinguish "upstream returned an error" (don't cache,
    // surface the status) from "upstream returned a sentence" (cache it).
    let upstreamError = null;

    try {
      const { sentence, cached } = await getOrComputeStitch(
        { action, cues, language },
        async () => {
          const upstream = await fetch(
            `${apiBase}/api/v1/llm/stitch-intention`,
            {
              method: 'POST',
              headers,
              body: JSON.stringify({ action, cues, language }),
            }
          );
          if (!upstream.ok) {
            const text = await upstream.text().catch(() => '');
            upstreamError = {
              status: upstream.status >= 500 ? 502 : upstream.status,
              error: text || 'Upstream error',
            };
            return null;
          }
          const data = await upstream.json();
          return data?.sentence ?? null;
        }
      );

      if (upstreamError) {
        return res
          .status(upstreamError.status)
          .json({ error: upstreamError.error });
      }
      if (sentence == null) {
        return res.status(502).json({ error: 'Upstream error' });
      }
      // `cached` is advisory; the app only reads `sentence`.
      return res.json({ sentence, cached });
    } catch (err) {
      log.error({ err }, 'stitch-intention proxy error');
      return res.status(503).json({ error: 'Service unavailable' });
    }
  });

  // POST /api/v1/habits/stack-merge — §7.1 Habit Stacking proxy to API-service.
  // Merges an anchor habit + a new behaviour into one implementation intention
  // sentence, in the user's language. Proxied through the backend like
  // /habits/stitch-intention so the mobile app never talks to the LLM service
  // directly (auth + service token stay server-side).
  router.post('/stack-merge', async (req, res) => {
    const {
      anchor_text: anchorText,
      new_behavior_text: newBehaviorText,
      language = 'en',
    } = req.body || {};
    if (!anchorText || !newBehaviorText) {
      return res
        .status(400)
        .json({ error: 'anchor_text and new_behavior_text are required' });
    }
    const apiBase =
      apiServiceUrl || process.env.API_SERVICE_URL || 'http://recommender:8000';
    const headers = { 'Content-Type': 'application/json' };
    if (process.env.API_SERVICE_SECRET)
      headers['X-Service-Auth-Token'] = process.env.API_SERVICE_SECRET;
    try {
      const upstream = await fetch(`${apiBase}/api/v1/llm/stack-merge`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          anchor_text: anchorText,
          new_behavior_text: newBehaviorText,
          language,
        }),
      });
      if (!upstream.ok) {
        const text = await upstream.text().catch(() => '');
        return res
          .status(upstream.status >= 500 ? 502 : upstream.status)
          .json({ error: text || 'Upstream error' });
      }
      const data = await upstream.json();
      if (data?.sentence == null) {
        return res.status(502).json({ error: 'Upstream error' });
      }
      return res.json({ sentence: data.sentence });
    } catch (err) {
      log.error({ err }, 'stack-merge proxy error');
      return res.status(503).json({ error: 'Service unavailable' });
    }
  });

  return router;
}
