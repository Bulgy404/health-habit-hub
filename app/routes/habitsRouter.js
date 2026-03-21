import express from 'express';
import neo4j from 'neo4j-driver';
import { randomUUID } from 'node:crypto';

export function createHabitsRouter({
  db,
  neo4jRun,
  apiServiceUrl,
  libreTranslateUrl,
} = {}) {
  const router = express.Router();

  async function getDb() {
    if (db) return db;
    const { connect } = await import('../models/survey.js');
    return connect();
  }

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

  // Unified translation helper — translates sentence from `sourceLang` to `targetLang` via
  // LibreTranslate (step 1) then refines tone with LLM (step 2).
  // Returns the refined translation string, or null if LibreTranslate is unavailable.
  // Falls back to raw LibreTranslate output if the LLM refinement step fails.
  async function translate(
    sentence,
    sourceLang,
    targetLang,
    llmEndpoint,
    apiBase,
    translateUrl
  ) {
    // Step 1: LibreTranslate with 10-second timeout (matching LLM timeout)
    let draft;
    try {
      const ltController = new AbortController();
      const ltTimeout = setTimeout(() => ltController.abort(), 10000);
      let ltRes;
      try {
        ltRes = await fetch(translateUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            q: sentence,
            source: sourceLang,
            target: targetLang,
            format: 'text',
          }),
          signal: ltController.signal,
        });
      } finally {
        clearTimeout(ltTimeout);
      }
      if (!ltRes.ok) {
        console.warn(
          `[translate] LibreTranslate returned ${ltRes.status} — skipping translation${targetLang.toUpperCase()}`
        );
        return null;
      }
      const ltData = await ltRes.json();
      draft = ltData.translatedText;
    } catch (err) {
      console.warn(
        `[translate] LibreTranslate error: ${err.message} — skipping translation${targetLang.toUpperCase()}`
      );
      return null;
    }

    // Step 2: LLM tone refinement with 10-second timeout
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      let refineRes;
      try {
        refineRes = await fetch(`${apiBase}${llmEndpoint}`, {
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

      if (!refineRes.ok) {
        console.warn(
          `[translate] LLM ${llmEndpoint} returned ${refineRes.status} — using raw LibreTranslate output`
        );
        return draft;
      }

      const refineData = await refineRes.json();
      return refineData.refined_translation || draft;
    } catch (err) {
      console.warn(
        `[translate] LLM refinement error/timeout: ${err.message} — using raw LibreTranslate output`
      );
      return draft;
    }
  }

  // Convenience wrappers kept for clarity
  async function translateToGerman(sentence, language, apiBase, translateUrl) {
    if (!language || !language.startsWith('en')) return null;
    return translate(
      sentence,
      'en',
      'de',
      '/api/v1/llm/refine-translation-de',
      apiBase,
      translateUrl
    );
  }

  async function translateAndRefine(sentence, language, apiBase, translateUrl) {
    if (!language || language.startsWith('en')) return null;
    return translate(
      sentence,
      language,
      'en',
      '/api/v1/llm/refine-translation',
      apiBase,
      translateUrl
    );
  }

  // GET /api/v1/habits
  // Returns all donated habits with original, translationEN, translationDE fields.
  // Optional ?lang=en|de adds a displayText convenience field.
  router.get('/', async (req, res) => {
    try {
      const { lang } = req.query;
      const records = await queryNeo4j(`
        MATCH (h:Habit)
        RETURN h.uuid AS uuid,
               h.sentence AS original,
               h.language AS language,
               h.translationEN AS translationEN,
               h.translationDE AS translationDE
      `);

      const habits = records.map((r) => {
        const habit = {
          uuid: r.uuid || null,
          original: r.original || null,
          language: r.language || null,
          translationEN: r.translationEN || null,
          translationDE: r.translationDE || null,
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

      const records = await queryNeo4j(`
        MATCH (h:hhh__Habit)
        OPTIONAL MATCH (h)-[:hhh__hasBehavior]->()-[:hhh__partOf]->(es)
        RETURN h.hhh__id AS id,
               h.hhh__value AS name,
               head([l IN labels(es) WHERE l =~ 'hhh__Group\\d+']) AS category,
               null AS bcioClass
      `);

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
        queryNeo4j('MATCH (h:hhh__Habit) RETURN count(h) AS total'),
        queryNeo4j(`
          MATCH (h:hhh__Habit)
          OPTIONAL MATCH (h)-[:hhh__hasBehavior]->()-[:hhh__partOf]->(es)
          WITH head([l IN labels(es) WHERE l =~ 'hhh__Group\\d+']) AS cat, count(h) AS cnt
          RETURN coalesce(cat, 'Uncategorized') AS category, cnt AS count
        `),
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

  // POST /api/v1/habits/donate
  // Orchestrates M1.1 → M1.2 → M1.3 pipeline and writes to Neo4j/MongoDB
  router.post('/donate', async (req, res) => {
    const { sentence, language } = req.body || {};
    if (!sentence || !language) {
      return res
        .status(400)
        .json({ error: 'sentence and language are required' });
    }

    // Input length and language validation
    const SUPPORTED_LANGUAGES = [
      'en',
      'de',
      'fr',
      'es',
      'it',
      'pt',
      'nl',
      'pl',
      'ru',
      'zh',
    ];
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

    const userID = req.user?.sub;
    const uuid = randomUUID();
    const apiBase =
      apiServiceUrl || process.env.API_SERVICE_URL || 'http://recommender:8000';
    const translateUrl =
      libreTranslateUrl ||
      process.env.LIBRE_TRANSLATE_URL ||
      `http://${process.env.TRANSLATE_HOST || 'localhost'}:${process.env.TRANSLATE_PORT || '5000'}${process.env.TRANSLATE_PATH || '/translate'}`;

    const DIMENSIONS = [
      'TIME',
      'PHYSICAL_SETTING',
      'PRIOR_BEHAVIOR',
      'OTHER_PEOPLE',
      'INTERNAL_STATE',
      'BEHAVIOR',
      'REASONING',
    ];

    try {
      // M1.1: Classify habit
      const classifyRes = await fetch(`${apiBase}/api/v1/llm/classify-habit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sentence, language, user_id: userID }),
      });

      if (!classifyRes.ok) {
        return res.status(502).json({ error: 'Habit classification failed' });
      }

      const classified = await classifyRes.json();

      if (!classified.is_habit) {
        // Store non-habit in MongoDB for review
        const database = await getDb();
        await database.collection('habits').insertOne({
          sentence,
          language,
          is_habit: false,
          userID,
          created_at: new Date(),
        });
        return res.json({
          is_habit: false,
          message:
            'Thank you for your contribution. This sentence was not identified as a habit and has been noted for review.',
        });
      }

      // M1.2: Extract context
      const contextRes = await fetch(`${apiBase}/api/v1/llm/classify-context`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uuid, sentence, language }),
      });

      if (!contextRes.ok) {
        return res.status(502).json({ error: 'Context extraction failed' });
      }

      const context = await contextRes.json();

      // Build context_phrases: { dimension: [phrases] } (non-empty dims only)
      const contextPhrases = {};
      for (const dim of DIMENSIONS) {
        if (Array.isArray(context[dim]) && context[dim].length > 0) {
          contextPhrases[dim] = context[dim];
        }
      }

      // M1.3: Map BCIO concepts
      const bcioRes = await fetch(`${apiBase}/api/v1/llm/map-bcio`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uuid, context_phrases: contextPhrases }),
      });

      if (!bcioRes.ok) {
        return res.status(502).json({ error: 'BCIO mapping failed' });
      }

      const bcioData = await bcioRes.json();
      const mappings = bcioData.mappings || [];

      // Translate non-English habits to English (tone-preserving)
      const translationEN = await translateAndRefine(
        sentence,
        language,
        apiBase,
        translateUrl
      );

      // Translate English habits to German (tone-preserving)
      const translationDE = await translateToGerman(
        sentence,
        language,
        apiBase,
        translateUrl
      );

      // Write to Neo4j — 1. Create Habit node
      const createdAt = new Date().toISOString();
      await queryNeo4j(
        `CREATE (h:Habit {uuid: $uuid, sentence: $sentence, language: $language,
           is_habit: true, confidence: $confidence, userID: $userID, created_at: $created_at,
           translationEN: $translationEN, translationDE: $translationDE})`,
        {
          uuid,
          sentence,
          language,
          confidence: classified.confidence,
          userID,
          created_at: createdAt,
          translationEN: translationEN || null,
          translationDE: translationDE || null,
        }
      );

      // 2. MERGE Context nodes and HAS_CONTEXT relationships (batched with UNWIND)
      const contextRows = [];
      for (const [dimension, phrases] of Object.entries(contextPhrases)) {
        for (const phrase of phrases) {
          contextRows.push({ text: phrase, dimension });
        }
      }
      if (contextRows.length > 0) {
        await queryNeo4j(
          `UNWIND $rows AS row
           MERGE (c:Context {text: row.text, dimension: row.dimension})
           WITH c, row
           MATCH (h:Habit {uuid: $habitUuid})
           MERGE (h)-[:HAS_CONTEXT {dimension: row.dimension}]->(c)`,
          { rows: contextRows, habitUuid: uuid }
        );
      }

      // 3. MERGE BCIOConcept nodes and MAPS_TO relationships (batched with UNWIND)
      if (mappings.length > 0) {
        await queryNeo4j(
          `UNWIND $mappings AS m
           MERGE (b:BCIOConcept {bcio_concept_id: m.bcio_concept_id})
           ON CREATE SET b.bcio_concept_label = m.bcio_concept_label
           WITH b, m
           MATCH (c:Context {text: m.phrase, dimension: m.dimension})
           MERGE (c)-[:MAPS_TO {confidence: m.confidence, phrase: m.phrase, dimension: m.dimension}]->(b)`,
          { mappings }
        );
      }

      return res.status(201).json({
        is_habit: true,
        uuid,
        message: 'Thank you! Your habit has been successfully donated.',
      });
    } catch (err) {
      console.error('[donate] Unexpected error:', err);
      return res.status(500).json({ error: 'Internal server error' });
    }
  });

  return router;
}

export default createHabitsRouter;
