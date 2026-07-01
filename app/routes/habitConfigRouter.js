// app/routes/habitConfigRouter.js
import express from 'express';
import { makeGetDb } from '../utils/getDb.js';
import { resolveHabitConfig } from '../services/habitConfigService.js';
import { SRHI_ITEMS } from '../utils/srhi.js';
import { logger } from '../utils/logger.js';

const log = logger.child({ module: 'habitConfigRouter' });

export function createHabitConfigRouter({ db, neo4jRun } = {}) {
  const router = express.Router();
  const getDb = makeGetDb(db);

  router.get('/', async (req, res) => {
    try {
      const database = await getDb();
      const config = await resolveHabitConfig({
        db: database,
        userId: req.user.sub,
        neo4jRun,
      });
      res.json({ ...config, srhiItems: SRHI_ITEMS });
    } catch (err) {
      log.error({ err: err }, '[habit-config] GET /:');
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  return router;
}
