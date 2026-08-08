import express from 'express';
import { getHabitGraph, getHabitBubbleGraph } from '../../db/habitQueries.js';
import { logger } from '../../utils/logger.js';

const log = logger.child({ module: 'habitsGraphRouter' });

// Neo4j returns Integer objects for integer properties, and health_benefit /
// wellbeing_impact are optional (null means "not rated" — distinct from a
// real 0, which isn't even a valid rating — so unlike habitQueries.js's own
// neoInt() this must NOT coerce null/undefined to 0).
function neoIntOrNull(val) {
  if (val == null) return null;
  if (typeof val === 'object' && typeof val.toNumber === 'function')
    return val.toNumber();
  return Number(val);
}

// Kept in sync with the mobile ARB keys bubbleGraphDimension* (app_*.arb) —
// the client localizes these from its own bundle for any build shipped after
// that ARB change, but this server-side copy is what already-installed app
// versions display, since they render whatever `label` this endpoint returns
// verbatim. Same set of languages habit-sentence translation supports
// (TRANSLATABLE_LANGS in db/habitQueries.js).
const DIMENSION_LABELS_BY_LANG = {
  en: {
    TIME: 'Time',
    BEHAVIOR: 'Behavior',
    PHYSICAL_SETTING: 'Location',
    PRIOR_BEHAVIOR: 'Prior Behavior',
    OTHER_PEOPLE: 'Social',
    INTERNAL_STATE: 'Mental State',
    REASONING: 'Reasoning',
  },
  de: {
    TIME: 'Zeit',
    BEHAVIOR: 'Verhalten',
    PHYSICAL_SETTING: 'Ort',
    PRIOR_BEHAVIOR: 'Vorheriges Verhalten',
    OTHER_PEOPLE: 'Sozial',
    INTERNAL_STATE: 'Geisteszustand',
    REASONING: 'Begründung',
  },
  ja: {
    TIME: '時間',
    BEHAVIOR: '行動',
    PHYSICAL_SETTING: '場所',
    PRIOR_BEHAVIOR: '先行行動',
    OTHER_PEOPLE: '社会的',
    INTERNAL_STATE: '心理状態',
    REASONING: '理由付け',
  },
  fr: {
    TIME: 'Temps',
    BEHAVIOR: 'Comportement',
    PHYSICAL_SETTING: 'Lieu',
    PRIOR_BEHAVIOR: 'Comportement antérieur',
    OTHER_PEOPLE: 'Social',
    INTERNAL_STATE: 'État mental',
    REASONING: 'Raisonnement',
  },
  nl: {
    TIME: 'Tijd',
    BEHAVIOR: 'Gedrag',
    PHYSICAL_SETTING: 'Locatie',
    PRIOR_BEHAVIOR: 'Voorafgaand gedrag',
    OTHER_PEOPLE: 'Sociaal',
    INTERNAL_STATE: 'Mentale toestand',
    REASONING: 'Redenering',
  },
};

function dimensionLabelsForLang(lang) {
  const code = String(lang || '')
    .slice(0, 2)
    .toLowerCase();
  return DIMENSION_LABELS_BY_LANG[code] || DIMENSION_LABELS_BY_LANG.en;
}

/**
 * Handles habit graph routes: Neo4j graph and bubble-graph visualizations.
 * Mounts under /api/v1/habits by the parent habitsRouter.
 *
 * @param {object} opts
 * @param {Function} opts.queryNeo4j - Neo4j query helper
 * @param {Function} opts.getDb - MongoDB connection factory
 * @returns {express.Router}
 */
export function createHabitsGraphRouter({ queryNeo4j, getDb } = {}) {
  const router = express.Router();

  /**
   * @swagger
   * /habits/graph:
   *   get:
   *     summary: Get the Neo4j Habit↔BCIOConcept graph
   *     description: Returns all Habit and BCIOConcept nodes with their edges. Habit nodes include annotation counts. Habits with no BCIOConcept link are excluded.
   *     tags: [Habits]
   *     security:
   *       - bearerAuth: []
   *     responses:
   *       200:
   *         description: Graph data
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 nodes:
   *                   type: array
   *                   items:
   *                     type: object
   *                 edges:
   *                   type: array
   *                   items:
   *                     type: object
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
  // GET /api/v1/habits/graph
  // Returns {nodes, edges} for the Neo4j Habit↔BCIOConcept graph.
  // Habit nodes include annotation counts joined from MongoDB.
  router.get('/graph', async (req, res) => {
    try {
      const [rows, database] = await Promise.all([
        getHabitGraph(queryNeo4j, req.query.lang),
        getDb(),
      ]);

      // Collect unique habits and concepts
      const habitMap = new Map(); // habitId → row
      const conceptMap = new Map(); // conceptId → conceptLabel
      const edgeMap = new Map(); // key → {source, target}

      for (const row of rows) {
        if (row.habitId && !habitMap.has(row.habitId)) {
          habitMap.set(row.habitId, row);
        }
        if (row.conceptId && !conceptMap.has(row.conceptId)) {
          conceptMap.set(row.conceptId, row.conceptLabel || '');
        }
        if (row.habitId && row.conceptId) {
          const edgeKey = `${row.habitId}||${row.conceptId}`;
          if (!edgeMap.has(edgeKey)) {
            edgeMap.set(edgeKey, {
              source: `h:${row.habitId}`,
              target: `c:${row.conceptId}`,
            });
          }
        }
      }

      // Join annotation counts from MongoDB for habit nodes
      const habitIds = [...habitMap.keys()];
      const annotations =
        habitIds.length > 0
          ? await database
              .collection('habit_annotations')
              .find({ habitId: { $in: habitIds } })
              .toArray()
          : [];

      const countsByHabit = {};
      for (const ann of annotations) {
        if (!countsByHabit[ann.habitId])
          countsByHabit[ann.habitId] = { helpful: 0, iDoThis: 0 };
        if (ann.type === 'helpful') countsByHabit[ann.habitId].helpful++;
        if (ann.type === 'iDoThis') countsByHabit[ann.habitId].iDoThis++;
      }

      // Build nodes array
      const nodes = [
        ...[...habitMap.values()].map((row) => ({
          id: `h:${row.habitId}`,
          type: 'habit',
          label: row.habitLabel || '',
          habitId: row.habitId,
          originalText: row.originalText || '',
          language: row.language || '',
          annotationCounts: countsByHabit[row.habitId] || {
            helpful: 0,
            iDoThis: 0,
          },
        })),
        ...[...conceptMap.entries()].map(([conceptId, label]) => ({
          id: `c:${conceptId}`,
          type: 'concept',
          label: label,
          habitId: null,
          originalText: '',
          language: '',
          annotationCounts: { helpful: 0, iDoThis: 0 },
        })),
      ];

      const edges = [...edgeMap.values()];

      res.json({ nodes, edges });
    } catch (err) {
      log.error({ err: err }, '[route] error');
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // GET /api/v1/habits/bubble-graph
  // Returns dimensions with nested habits for the bubble drill-down view.
  router.get('/bubble-graph', async (req, res) => {
    try {
      const [rows, database] = await Promise.all([
        getHabitBubbleGraph(queryNeo4j, req.query.lang),
        getDb(),
      ]);

      // Group habits by dimension, deduplicate within each dimension.
      const dimensionMap = new Map();
      for (const row of rows) {
        if (!row.dimension || !row.habitId) continue;
        if (!dimensionMap.has(row.dimension))
          dimensionMap.set(row.dimension, new Map());
        const habitMap = dimensionMap.get(row.dimension);
        if (!habitMap.has(row.habitId)) {
          habitMap.set(row.habitId, {
            id: row.habitId,
            label: row.habitLabel || '',
            originalText: row.originalText || '',
            language: row.language || '',
            // §7.4 — build/quit so the mobile bubble graph can filter by type.
            habitType: row.habitType === 'quit' ? 'quit' : 'build',
            // Self-rated 1-5 scores from donation time (see habitsCrudRouter's
            // isValidRating) — null when the donor left them blank, so the
            // mobile impact filter can distinguish "not rated" from "rated
            // low". Not clamped/defaulted here; the client owns that logic.
            healthBenefit: neoIntOrNull(row.healthBenefit),
            wellbeingImpact: neoIntOrNull(row.wellbeingImpact),
            // The exact phrase the classifier matched for *this* dimension
            // (e.g. "at the gym" for Location) — lets the mobile detail sheet
            // bold it within the habit sentence instead of only showing the
            // dimension badge. Scoped per-dimension (not on the habit as a
            // whole), since the same habit can carry a different phrase under
            // a different dimension bubble.
            contextText: row.contextText || '',
          });
        }
      }

      // Join annotation counts from MongoDB.
      const allIds = [...new Set(rows.map((r) => r.habitId).filter(Boolean))];
      const annotations =
        allIds.length > 0
          ? await database
              .collection('habit_annotations')
              .find({ habitId: { $in: allIds } })
              .toArray()
          : [];

      const countsByHabit = {};
      for (const ann of annotations) {
        if (!countsByHabit[ann.habitId])
          countsByHabit[ann.habitId] = { helpful: 0, iDoThis: 0 };
        if (ann.type === 'helpful') countsByHabit[ann.habitId].helpful++;
        if (ann.type === 'iDoThis') countsByHabit[ann.habitId].iDoThis++;
      }

      const dimensionLabels = dimensionLabelsForLang(req.query.lang);
      const dimensions = [...dimensionMap.entries()]
        .map(([dimId, habitMap]) => {
          const habits = [...habitMap.values()].map((h) => ({
            ...h,
            annotationCounts: countsByHabit[h.id] || { helpful: 0, iDoThis: 0 },
          }));
          return {
            id: dimId,
            label: dimensionLabels[dimId] || dimId,
            habitCount: habits.length,
            habits,
          };
        })
        .sort((a, b) => b.habitCount - a.habitCount);

      res.json({ dimensions });
    } catch (err) {
      log.error({ err: err }, '[route] error');
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  return router;
}
