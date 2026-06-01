// app/routes/habitConfigRouter.js
import express from 'express';
import { makeGetDb } from '../utils/getDb.js';
import { resolveHabitConfig } from '../services/habitConfigService.js';
import { SRHI_ITEMS } from '../utils/srhi.js';

export function createHabitConfigRouter({ db } = {}) {
  const router = express.Router();
  const getDb = makeGetDb(db);

  router.get('/', async (req, res) => {
    try {
      const database = await getDb();
      const config = await resolveHabitConfig({
        db: database,
        userId: req.user.sub,
      });
      res.json({ ...config, srhiItems: SRHI_ITEMS });
    } catch (err) {
      console.error('[habit-config] GET /:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  return router;
}
