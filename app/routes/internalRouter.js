import express from 'express';

export function createInternalRouter({ broadcast, internalSecret } = {}) {
  const router = express.Router();
  const secret = internalSecret || process.env.INTERNAL_API_SECRET;

  // Shared-secret guard — require X-Internal-Secret header matching INTERNAL_API_SECRET
  router.use((req, res, next) => {
    if (!secret) {
      // No secret configured: log a warning and deny by default (fail-secure)
      console.warn(
        '[internal] INTERNAL_API_SECRET is not set — rejecting request'
      );
      return res.status(403).json({ error: 'Forbidden' });
    }
    if (req.headers['x-internal-secret'] !== secret) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    next();
  });

  // POST /api/internal/recommendations - called by recommender to push new recommendation
  router.post('/recommendations', (req, res) => {
    const { userId, recommendation } = req.body;
    if (!userId || !recommendation) {
      return res
        .status(400)
        .json({ error: 'userId and recommendation required' });
    }
    broadcast(userId, { type: 'new_recommendation', data: recommendation });
    res.json({ ok: true });
  });

  return router;
}

export default createInternalRouter;
