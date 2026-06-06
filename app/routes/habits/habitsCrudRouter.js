import express from 'express';
import { randomUUID } from 'node:crypto';
import { shareHabit } from '../../services/habitDonationService.js';
import { SUPPORTED_LANGUAGES } from '../../utils/constants.js';
import {
  getAllHabits,
  getPublicHabits,
  updateHabitAnnotation,
} from '../../db/habitQueries.js';

// Step 1: Call LibreTranslate with a 10-second timeout.
// Returns the raw translated string, or null if the service is unavailable.
async function fetchLibreTranslation(
  sentence,
  sourceLang,
  targetLang,
  translateUrl
) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    let res;
    try {
      res = await fetch(translateUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          q: sentence,
          source: sourceLang,
          target: targetLang,
          format: 'text',
        }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }
    if (!res.ok) {
      console.warn(
        `[translate] LibreTranslate returned ${res.status} — skipping translation to ${targetLang.toUpperCase()}`
      );
      return null;
    }
    const data = await res.json();
    return data.translatedText;
  } catch (err) {
    console.warn(
      `[translate] LibreTranslate error: ${err.message} — skipping translation to ${targetLang.toUpperCase()}`
    );
    return null;
  }
}

// Step 2: Refine the raw translation with the LLM tone endpoint.
// Returns the refined string, or the original draft if the LLM is unavailable.
async function refineLLMTranslation(
  draft,
  sentence,
  sourceLang,
  llmEndpoint,
  apiBase
) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    let res;
    try {
      res = await fetch(`${apiBase}${llmEndpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          original: sentence,
          raw_translation: draft,
          language: sourceLang,
        }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }
    if (!res.ok) {
      console.warn(
        `[translate] LLM ${llmEndpoint} returned ${res.status} — using raw LibreTranslate output`
      );
      return draft;
    }
    const data = await res.json();
    return data.refined_translation || draft;
  } catch (err) {
    console.warn(
      `[translate] LLM refinement error/timeout: ${err.message} — using raw LibreTranslate output`
    );
    return draft;
  }
}

// Unified translation: LibreTranslate → LLM tone refinement.
// Returns refined string, raw LibreTranslate output if LLM fails, or null if LibreTranslate fails.
async function translate(
  sentence,
  sourceLang,
  targetLang,
  llmEndpoint,
  apiBase,
  translateUrl
) {
  const draft = await fetchLibreTranslation(
    sentence,
    sourceLang,
    targetLang,
    translateUrl
  );
  if (!draft) return null;
  return refineLLMTranslation(
    draft,
    sentence,
    sourceLang,
    llmEndpoint,
    apiBase
  );
}

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
export function createHabitsCrudRouter({
  getDb,
  queryNeo4j,
  apiServiceUrl,
  libreTranslateUrl,
} = {}) {
  const router = express.Router();

  // GET /api/v1/habits
  // Returns all donated habits with translation and category fields.
  // Optional ?lang=en|de adds a displayText convenience field.
  router.get('/', async (req, res) => {
    try {
      const { lang } = req.query;
      const [records, database] = await Promise.all([
        getAllHabits(queryNeo4j),
        getDb(),
      ]);

      const annotations = await database
        .collection('habit_annotations')
        .find({})
        .toArray();

      const countsByHabit = {};
      for (const ann of annotations) {
        if (!countsByHabit[ann.habitId])
          countsByHabit[ann.habitId] = { helpful: 0, iDoThis: 0 };
        if (ann.type === 'helpful') countsByHabit[ann.habitId].helpful++;
        if (ann.type === 'iDoThis') countsByHabit[ann.habitId].iDoThis++;
      }

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
          annotationCounts: countsByHabit[uuid] || { helpful: 0, iDoThis: 0 },
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
      console.error('[route] Error:', err);
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
  // Returns anonymized habit list with annotation counts
  router.get('/public', async (req, res) => {
    try {
      const database = await getDb();

      const records = await getPublicHabits(queryNeo4j);

      const annotations = await database
        .collection('habit_annotations')
        .find({})
        .toArray();

      const countsByHabit = {};
      for (const ann of annotations) {
        if (!countsByHabit[ann.habitId])
          countsByHabit[ann.habitId] = { helpful: 0, iDoThis: 0 };
        if (ann.type === 'helpful') countsByHabit[ann.habitId].helpful++;
        if (ann.type === 'iDoThis') countsByHabit[ann.habitId].iDoThis++;
      }

      const habits = records.map((r) => ({
        id: r.id,
        name: r.name,
        category: r.category ? String(r.category).replace('hhh__', '') : null,
        bcioClass: r.bcioClass || null,
        annotationCounts: countsByHabit[r.id] || { helpful: 0, iDoThis: 0 },
      }));

      res.json(habits);
    } catch (err) {
      console.error('[route] Error:', err);
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
  // POST /api/v1/habits/:id/annotate
  // Adds or removes the requesting user's annotation and returns updated counts.
  // Body: { type: 'helpful'|'iDoThis', remove?: boolean }
  router.post('/:id/annotate', async (req, res) => {
    try {
      const { type, remove = false } = req.body || {};
      if (type !== 'helpful' && type !== 'iDoThis') {
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

      const all = await database
        .collection('habit_annotations')
        .find({ habitId })
        .toArray();

      const counts = { helpful: 0, iDoThis: 0 };
      for (const ann of all) {
        if (ann.type === 'helpful') counts.helpful++;
        if (ann.type === 'iDoThis') counts.iDoThis++;
      }

      res.json({ habitId, annotationCounts: counts });
    } catch (err) {
      console.error('[route] Error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // POST /api/v1/habits/share
  // Validate input then delegate to the habit-sharing service.
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
      const result = await shareHabit({
        uuid: randomUUID(),
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
        translate,
        translateUrl,
      });
      return res.status(result.is_habit ? 201 : 200).json(result);
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

  router.post('/share', handleShareHabit);
  router.post('/donate', handleShareHabit);

  return router;
}
