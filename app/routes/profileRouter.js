import express from 'express';

export function createProfileRouter({ db } = {}) {
  const router = express.Router();

  async function getDb() {
    if (db) return db;
    const { connect } = await import('../models/survey.js');
    return connect();
  }

  // GET /api/v1/profile – return caller's profile or 404
  router.get('/', async (req, res) => {
    try {
      const database = await getDb();
      const profile = await database
        .collection('profiles')
        .findOne({ userId: req.user.sub });
      if (!profile) return res.status(404).json({ error: 'Profile not found' });
      const { _id, ...rest } = profile;
      res.json(rest);
    } catch (_err) {
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // POST /api/v1/profile – upsert caller's profile
  router.post('/', async (req, res) => {
    try {
      const database = await getDb();
      const { answers, completedAt } = req.body;
      const now = new Date();
      await database.collection('profiles').updateOne(
        { userId: req.user.sub },
        {
          $set: {
            userId: req.user.sub,
            answers: answers || {},
            completedAt: completedAt ? new Date(completedAt) : now,
            updatedAt: now,
          },
        },
        { upsert: true }
      );
      const profile = await database
        .collection('profiles')
        .findOne({ userId: req.user.sub });
      const { _id, ...rest } = profile;
      res.json(rest);
    } catch (_err) {
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  return router;
}

export default createProfileRouter;
