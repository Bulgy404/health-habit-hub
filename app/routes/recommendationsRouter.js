import { createHash } from 'node:crypto';
import express from 'express';
import { makeGetDb } from '../utils/getDb.js';

/**
 * Compute the same Redis cache key that API-service/routers/recommend.py uses.
 * Key: recommend:{SHA256(user_id||goal)}
 */
function cacheKey(userId, goal) {
  return `recommend:${createHash('sha256').update(`${userId}||${goal}`).digest('hex')}`;
}

export function createRecommendationsRouter({
  db,
  redisClient,
  redisUrl,
} = {}) {
  const router = express.Router();
  const getDb = makeGetDb(db);

  async function getRedis() {
    if (redisClient !== undefined) return redisClient; // null means disabled in tests
    try {
      const { createClient } = await import('redis');
      const url = redisUrl || process.env.REDIS_URL || 'redis://localhost:6379';
      const client = createClient({ url });
      client.on('error', (err) =>
        console.warn('[redis] client error:', err.message)
      );
      await client.connect();
      return client;
    } catch (err) {
      console.error('[route] Error:', err);
      return null;
    }
  }

  /**
   * POST /api/v1/recommendations/:recommendation_id/feedback
   * Body: { comment: string }
   * Stores feedback in MongoDB and invalidates Redis cache for (user_id, goal).
   */
  router.post('/:recommendation_id/feedback', async (req, res) => {
    const { comment } = req.body || {};
    if (!comment || typeof comment !== 'string' || !comment.trim()) {
      return res.status(400).json({ error: 'comment is required' });
    }

    const userId = req.user?.sub;
    const { recommendation_id } = req.params;

    try {
      const database = await getDb();

      // Look up recommendation scoped by userId — wrong owner gets implicit 404
      const rec = await database.collection('recommendations').findOne(
        {
          recommendation_id: String(recommendation_id),
          userId: String(userId),
        },
        { projection: { goal: 1, userId: 1 } }
      );

      if (!rec) {
        return res.status(404).json({ error: 'Recommendation not found' });
      }

      // Store feedback
      await database.collection('recommendation_feedback').insertOne({
        recommendation_id,
        userId,
        goal: rec.goal,
        comment: comment.trim(),
        created_at: new Date(),
      });

      // Invalidate Redis cache for (user_id, goal)
      try {
        const redis = await getRedis();
        if (redis) {
          const key = cacheKey(userId, rec.goal);
          await redis.del(key);
        }
      } catch (err) {
        console.error('[route] Error:', err);
        // Redis failure is non-fatal
      }

      return res.status(201).json({ ok: true });
    } catch (err) {
      console.error('[route] Error:', err);
      return res.status(500).json({ error: 'Internal server error' });
    }
  });

  /**
   * GET /api/v1/recommendations/me
   * Returns all past recommendations for the authenticated user, each with
   * their feedback comments attached.
   */
  router.get('/me', async (req, res) => {
    const userId = req.user?.sub;

    try {
      const database = await getDb();

      const recs = await database
        .collection('recommendations')
        .find({ userId: String(userId) }, { projection: { _id: 0 } })
        .sort({ generated_at: -1 })
        .toArray();

      if (recs.length === 0) {
        return res.json([]);
      }

      const recIds = recs.map((r) => r.recommendation_id);
      const feedbackDocs = await database
        .collection('recommendation_feedback')
        .find(
          { recommendation_id: { $in: recIds } },
          { projection: { _id: 0 } }
        )
        .toArray();

      const feedbackByRecId = {};
      for (const f of feedbackDocs) {
        if (!feedbackByRecId[f.recommendation_id]) {
          feedbackByRecId[f.recommendation_id] = [];
        }
        feedbackByRecId[f.recommendation_id].push({
          comment: f.comment,
          created_at: f.created_at,
        });
      }

      const result = recs.map((r) => ({
        ...r,
        feedback: feedbackByRecId[r.recommendation_id] || [],
      }));

      return res.json(result);
    } catch (err) {
      console.error('[route] Error:', err);
      return res.status(500).json({ error: 'Internal server error' });
    }
  });

  return router;
}

export default createRecommendationsRouter;
