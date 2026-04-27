import express from 'express';
import { makeGetDb } from '../utils/getDb.js';

export function createUserProfileServiceRouter({ db } = {}) {
  const router = express.Router();
  const getDb = makeGetDb(db);

  router.get('/service/:userId', async (req, res) => {
    try {
      const token = req.headers['x-service-auth-token'];
      const expected = process.env.API_SERVICE_SECRET;
      if (!token || !expected || token !== expected) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      const database = await getDb();
      const doc = await database
        .collection('user_profiles')
        .findOne({ userId: req.params.userId });
      if (!doc) return res.status(404).json({ error: 'Profile not found' });
      const { _id, ...rest } = doc;
      res.json(rest);
    } catch (err) {
      console.error('[userProfileRouter] GET /service/:userId:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  return router;
}

export function createUserProfileRouter({ db } = {}) {
  const router = express.Router();
  const getDb = makeGetDb(db);

  router.post('/', async (req, res) => {
    try {
      const userId = req.user?.sub;
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });

      const { fields } = req.body;
      if (!Array.isArray(fields) || fields.length === 0) {
        return res
          .status(400)
          .json({ error: 'fields must be a non-empty array' });
      }
      for (const f of fields) {
        if (
          typeof f.questionId !== 'string' ||
          !f.questionId ||
          typeof f.questionText !== 'string' ||
          !f.questionText ||
          f.value === undefined ||
          f.value === null ||
          typeof f.label !== 'string' ||
          !f.label
        ) {
          return res.status(400).json({
            error:
              'each field must have questionId, questionText, value, and label',
          });
        }
      }

      const database = await getDb();
      await database.collection('user_profiles').updateOne(
        { userId },
        { $set: { userId, fields, updatedAt: new Date() } },
        { upsert: true }
      );
      res.json({ ok: true });
    } catch (err) {
      console.error('[userProfileRouter] POST /:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  router.get('/', async (req, res) => {
    try {
      const database = await getDb();
      const doc = await database
        .collection('user_profiles')
        .findOne({ userId: req.user.sub });
      if (!doc) return res.status(404).json({ error: 'Profile not found' });
      const { _id, ...rest } = doc;
      res.json(rest);
    } catch (err) {
      console.error('[userProfileRouter] GET /:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  return router;
}
