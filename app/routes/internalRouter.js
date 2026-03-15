import express from 'express';

export function createInternalRouter({ broadcast } = {}) {
  const router = express.Router();

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
