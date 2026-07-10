import express from 'express';
import { logger } from '../../utils/logger.js';
import {
  getHabitTotal,
  getHabitsByCategory,
  getUserHabits,
} from '../../db/habitQueries.js';

const log = logger.child({ module: 'habitsStatsRouter' });

function toNumber(val) {
  if (val == null) return 0;
  if (typeof val === 'object' && typeof val.toNumber === 'function')
    return val.toNumber();
  return Number(val);
}

const DIMENSION_LABELS = {
  TIME: 'Time',
  BEHAVIOR: 'Behavior',
  PHYSICAL_SETTING: 'Location',
  PRIOR_BEHAVIOR: 'Prior Behavior',
  OTHER_PEOPLE: 'Social',
  INTERNAL_STATE: 'Mental State',
  REASONING: 'Reasoning',
};

/**
 * Handles habit statistics routes: aggregate stats and per-user stats.
 * Mounts under /api/v1/habits by the parent habitsRouter.
 *
 * @param {object} opts
 * @param {Function} opts.getDb - MongoDB connection factory
 * @param {Function} opts.queryNeo4j - Neo4j query helper
 * @returns {express.Router}
 */
export function createHabitsStatsRouter({ getDb, queryNeo4j } = {}) {
  const router = express.Router();

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
      log.error({ err: err }, 'unhandled route error');
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // GET /api/v1/habits/my-stats
  // Returns the authenticated user's donated habits grouped by dimension,
  // plus a flat list of their habits with annotation counts.
  // BEHAVIOR dimension is excluded from the dimension summary.
  router.get('/my-stats', async (req, res) => {
    try {
      const userId = req.user?.sub;
      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const [rows, database] = await Promise.all([
        getUserHabits(queryNeo4j, userId, req.query.lang),
        getDb(),
      ]);

      // Group rows by habitId, collecting all dimensions per habit.
      const habitMap = new Map();
      for (const row of rows) {
        if (!row.habitId) continue;
        if (!habitMap.has(row.habitId)) {
          habitMap.set(row.habitId, {
            id: row.habitId,
            label: row.habitLabel || '',
            originalText: row.originalText || '',
            language: row.language || '',
            dimensions: [],
          });
        }
        if (row.dimension)
          habitMap.get(row.habitId).dimensions.push(row.dimension);
      }

      // Join annotation counts from MongoDB.
      const allIds = [...habitMap.keys()];
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

      const habits = [...habitMap.values()].map((h) => ({
        ...h,
        annotationCounts: countsByHabit[h.id] || { helpful: 0, iDoThis: 0 },
      }));

      // Dimension summary — deduplicated per habit, BEHAVIOR excluded.
      const dimCountMap = {};
      for (const habit of habits) {
        const seen = new Set();
        for (const dim of habit.dimensions) {
          if (dim === 'BEHAVIOR' || seen.has(dim)) continue;
          seen.add(dim);
          dimCountMap[dim] = (dimCountMap[dim] || 0) + 1;
        }
      }
      const byDimension = Object.entries(dimCountMap)
        .map(([dim, count]) => ({
          dimension: dim,
          label: DIMENSION_LABELS[dim] || dim,
          count,
        }))
        .sort((a, b) => b.count - a.count);

      res.json({ total: habits.length, byDimension, habits });
    } catch (err) {
      log.error({ err: err }, '[route] error');
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  return router;
}
