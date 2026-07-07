// app/services/adminInsightsService.js
//
// Admin "insights": a registry of frequently-asked, cross-database questions
// (MongoDB + Neo4j). Each answer is computed on demand and cached in Redis with
// a TTL so the admin portal doesn't recompute heavy aggregations on every load.
// A caller can force a refresh to recompute now.

import { getOrComputeJson } from '../lib/jsonCache.js';

const TTL = Number(process.env.INSIGHTS_CACHE_TTL_SECONDS) || 300;
const PREFIX = 'insights:v1:';

/** Normalise a Neo4j integer (or plain value) to a JS number. */
function toNum(v) {
  if (v == null) return 0;
  if (typeof v === 'object' && typeof v.toNumber === 'function') {
    return v.toNumber();
  }
  return Number(v) || 0;
}

/**
 * Insight registry. Each entry computes a result shaped as either:
 *   { type: 'stats', items: [{ label, value }] }
 *   { type: 'table', columns: [{ key, label }], rows: [{ ... }] }
 */
const INSIGHTS = {
  totals: {
    title: 'Platform totals',
    description: 'Headline counts across MongoDB and Neo4j.',
    async compute({ db, neo4jRun }) {
      const [participants, studies, responses, srhi, logs] = await Promise.all([
        db
          .collection('participants')
          .countDocuments({ deletedAt: { $exists: false } }),
        db
          .collection('studies')
          .countDocuments({ deletedAt: { $exists: false } }),
        db.collection('form_responses').countDocuments({}),
        db.collection('srhi_responses').countDocuments({}),
        db.collection('daily_behavior_logs').countDocuments({}),
      ]);
      let habits = 0;
      let users = 0;
      if (neo4jRun) {
        const hr = await neo4jRun(
          'MATCH (h:Habit) WHERE h.is_habit = true RETURN count(h) AS n',
          {}
        );
        habits = toNum(hr?.[0]?.n);
        const ur = await neo4jRun('MATCH (u:User) RETURN count(u) AS n', {});
        users = toNum(ur?.[0]?.n);
      }
      return {
        type: 'stats',
        items: [
          { label: 'Participants', value: participants },
          { label: 'Studies', value: studies },
          { label: 'Donated habits', value: habits },
          { label: 'Graph users', value: users },
          { label: 'Questionnaire responses', value: responses },
          { label: 'SRHI responses', value: srhi },
          { label: 'Daily logs', value: logs },
        ],
      };
    },
  },

  donations_by_participant: {
    title: 'Habits donated per participant',
    description:
      'Which participants have contributed the most habits (top 100).',
    async compute({ neo4jRun }) {
      if (!neo4jRun) return { type: 'table', columns: [], rows: [] };
      const rows = await neo4jRun(
        `MATCH (u:User)-[:DONATED]->(h:Habit)
         WHERE coalesce(h.is_habit, true) = true
         RETURN u.userID AS participantId, count(h) AS habits
         ORDER BY habits DESC LIMIT 100`,
        {}
      );
      return {
        type: 'table',
        columns: [
          { key: 'participantId', label: 'Participant' },
          { key: 'habits', label: 'Habits' },
        ],
        rows: rows.map((r) => ({
          participantId: r.participantId,
          habits: toNum(r.habits),
        })),
      };
    },
  },

  active_per_study: {
    title: 'Enrolled & active per study',
    description:
      'Enrolled participants and those active (≥1 log) in the last 7 days, per study.',
    async compute({ db, neo4jRun }) {
      const studies = await db
        .collection('studies')
        .find({ deletedAt: { $exists: false } })
        .project({ name: 1 })
        .toArray();
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 7);
      const cutoffStr = cutoff.toISOString().slice(0, 10);
      const rows = await Promise.all(
        studies.map(async (s) => {
          let enrolledIds = [];
          if (neo4jRun) {
            const er = await neo4jRun(
              `MATCH (u:User)-[:ENROLLED_IN]->(:Study {uuid: $uuid})
               RETURN u.userID AS userId`,
              { uuid: s._id.toString() }
            );
            enrolledIds = er.map((r) => r.userId).filter(Boolean);
          }
          let active = 0;
          if (enrolledIds.length > 0) {
            const a = await db
              .collection('daily_behavior_logs')
              .aggregate([
                {
                  $match: {
                    userId: { $in: enrolledIds },
                    date: { $gte: cutoffStr },
                  },
                },
                { $group: { _id: '$userId' } },
              ])
              .toArray();
            active = a.length;
          }
          return { study: s.name, enrolled: enrolledIds.length, active };
        })
      );
      return {
        type: 'table',
        columns: [
          { key: 'study', label: 'Study' },
          { key: 'enrolled', label: 'Enrolled' },
          { key: 'active', label: 'Active (7d)' },
        ],
        rows,
      };
    },
  },

  top_categories: {
    title: 'Top habit categories',
    description: 'Donated habits grouped by BCIO behaviour category.',
    async compute({ neo4jRun }) {
      if (!neo4jRun) return { type: 'table', columns: [], rows: [] };
      const rows = await neo4jRun(
        `MATCH (h:Habit) WHERE h.is_habit = true
         OPTIONAL MATCH (h)-[:HAS_CONTEXT]->(:Context)-[:MAPS_TO]->(b:BCIOConcept)
         WITH h, coalesce(b.bcio_concept_label, 'Other') AS category
         RETURN category, count(DISTINCT h) AS habits
         ORDER BY habits DESC LIMIT 50`,
        {}
      );
      return {
        type: 'table',
        columns: [
          { key: 'category', label: 'Category' },
          { key: 'habits', label: 'Habits' },
        ],
        rows: rows.map((r) => ({
          category: r.category,
          habits: toNum(r.habits),
        })),
      };
    },
  },
};

/** Metadata list for the insights hub (no computation). */
export function listInsights() {
  return Object.entries(INSIGHTS).map(([key, v]) => ({
    key,
    title: v.title,
    description: v.description,
  }));
}

/**
 * Compute (or serve cached) a single insight.
 * @param {{ db, neo4jRun, key: string, refresh?: boolean }} deps
 * @returns {Promise<object|null>} null when the key is unknown
 */
export async function getInsight({ db, neo4jRun, key, refresh = false }) {
  const def = INSIGHTS[key];
  if (!def) return null;
  const { data, computedAt, cached } = await getOrComputeJson(
    `${PREFIX}${key}`,
    () => def.compute({ db, neo4jRun }),
    { ttlSeconds: TTL, refresh }
  );
  return {
    key,
    title: def.title,
    description: def.description,
    computedAt,
    cached,
    result: data,
  };
}
