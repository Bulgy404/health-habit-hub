import express from 'express';
import neo4j from 'neo4j-driver';
import { randomUUID } from 'node:crypto';
import { makeGetDb } from '../utils/getDb.js';
import { shareHabit } from '../services/habitDonationService.js';
import { SUPPORTED_LANGUAGES } from '../utils/constants.js';
import {
  getAllHabits,
  getPublicHabits,
  getHabitTotal,
  getHabitsByCategory,
} from '../db/habitQueries.js';

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

  function toNumber(val) {
    if (val == null) return 0;
    if (typeof val === 'object' && typeof val.toNumber === 'function')
      return val.toNumber();
    return Number(val);
  }

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
          `[translate] LibreTranslate returned ${res.status} — skipping translation${targetLang.toUpperCase()}`
        );
        return null;
      }
      const data = await res.json();
      return data.translatedText;
    } catch (err) {
      console.warn(
        `[translate] LibreTranslate error: ${err.message} — skipping translation${targetLang.toUpperCase()}`
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
  // Stores anonymous annotation (no userId) and returns updated counts
  router.post('/:id/annotate', async (req, res) => {
    try {
      const { type } = req.body || {};
      if (type !== 'helpful' && type !== 'iDoThis') {
        return res
          .status(400)
          .json({ error: 'type must be "helpful" or "iDoThis"' });
      }

      const database = await getDb();
      const habitId = req.params.id;

      await database.collection('habit_annotations').insertOne({
        habitId,
        type,
        createdAt: new Date(),
      });

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

  /**
   * @swagger
   * /habits/stats:
   *   get:
   *     summary: Get aggregate habit donation statistics
   *     description: Returns total habit count, breakdown by study group category, and daily annotation activity over the last 30 days.
   *     tags: [Habits]
   *     security:
   *       - bearerAuth: []
   *     responses:
   *       200:
   *         description: Habit statistics
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/HabitStats'
   *             example:
   *               total: 142
   *               byCategory:
   *                 - category: Group1
   *                   count: 42
   *                 - category: Group2
   *                   count: 38
   *               byDay:
   *                 - date: "2026-03-14"
   *                   count: 7
   *                 - date: "2026-03-15"
   *                   count: 12
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
  // GET /api/v1/habits/stats
  // Returns {total, byCategory, byDay}
  router.get('/stats', async (req, res) => {
    try {
      const [totalRecords, catRecords, database] = await Promise.all([
        getHabitTotal(queryNeo4j),
        getHabitsByCategory(queryNeo4j),
        getDb(),
      ]);

      const total = toNumber(totalRecords[0]?.total);

      const byCategory = catRecords.map((r) => ({
        category: String(r.category || 'Uncategorized').replace('hhh__', ''),
        count: toNumber(r.count),
      }));

      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const annotations = await database
        .collection('habit_annotations')
        .find({ createdAt: { $gte: thirtyDaysAgo } })
        .toArray();

      const byDayMap = {};
      for (const ann of annotations) {
        const date = ann.createdAt.toISOString().split('T')[0];
        byDayMap[date] = (byDayMap[date] || 0) + 1;
      }
      const byDay = Object.entries(byDayMap)
        .map(([date, count]) => ({ date, count }))
        .sort((a, b) => a.date.localeCompare(b.date));

      res.json({ total, byCategory, byDay });
    } catch (err) {
      console.error('[route] Error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // POST /api/v1/habits/share
  // Validate input then delegate to the habit-sharing service.
  async function handleShareHabit(req, res) {
    const { sentence, language } = req.body || {};
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
        userID: req.user?.sub,
        queryNeo4j,
        getDb,
        apiBase,
        translate,
        translateUrl,
      });
      return res.status(result.is_habit ? 201 : 200).json(result);
    } catch (err) {
      if (err.status === 502)
        return res.status(502).json({ error: err.message });
      console.error('[share] Unexpected error:', err);
      return res.status(500).json({ error: 'Internal server error' });
    }
  }

  router.post('/share', handleShareHabit);
  router.post('/donate', handleShareHabit);

  return router;
}

export default createHabitsRouter;
