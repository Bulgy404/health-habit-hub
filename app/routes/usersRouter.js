import express from 'express';
import { makeGetDb } from '../utils/getDb.js';

const SUPPORTED_LANGUAGES = ['en', 'de'];

export function createUsersRouter({ db } = {}) {
  const router = express.Router();
  const getDb = makeGetDb(db);

  // GET /api/v1/users/me – return caller's user record (creates default if absent)
  router.get('/me', async (req, res) => {
    try {
      const database = await getDb();
      const userId = String(req.user.sub);
      const doc = await database.collection('users').findOne({ userId });
      if (doc) {
        const { _id, ...rest } = doc;
        return res.json(rest);
      }
      // Return default without persisting
      return res.json({ userId, preferredLanguage: 'en' });
    } catch (err) {
      console.error('[usersRouter] Error in GET /me:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // PUT /api/v1/users/me – update user fields (currently preferredLanguage)
  router.put('/me', async (req, res) => {
    try {
      const { preferredLanguage } = req.body || {};
      if (
        preferredLanguage !== undefined &&
        !SUPPORTED_LANGUAGES.includes(preferredLanguage)
      ) {
        return res.status(400).json({
          error: `preferredLanguage must be one of: ${SUPPORTED_LANGUAGES.join(', ')}`,
        });
      }
      const database = await getDb();
      const userId = String(req.user.sub);
      const update = {};
      if (preferredLanguage !== undefined)
        update.preferredLanguage = preferredLanguage;
      await database
        .collection('users')
        .updateOne(
          { userId },
          { $set: { userId, ...update } },
          { upsert: true }
        );
      const doc = await database.collection('users').findOne({ userId });
      const { _id, ...rest } = doc;
      res.json(rest);
    } catch (err) {
      console.error('[usersRouter] Error in PUT /me:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  return router;
}

export default createUsersRouter;
