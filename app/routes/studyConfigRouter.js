import express from 'express';
import { makeGetDb } from '../utils/getDb.js';
import { getParticipantGroupConfig } from '../services/studyService.js';
import { logger } from '../utils/logger.js';

const log = logger.child({ module: 'studyConfigRouter' });

/**
 * GET /api/v1/study-config/me
 *
 * Returns the resolved group config for the authenticated participant.
 * Used by the Flutter app at login to determine which UI features to enable.
 * Returns null body (204) when the user is not enrolled in any study.
 */
export function createStudyConfigRouter({ db, neo4jRun } = {}) {
  const router = express.Router();
  const getDb = makeGetDb(db);

  router.get('/me', async (req, res) => {
    try {
      const userId = req.user?.sub;
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });

      const database = await getDb();
      const config = await getParticipantGroupConfig({
        db: database,
        userId,
        neo4jRun,
      });

      if (!config) return res.status(200).json(null);
      res.json(config);
    } catch (err) {
      log.error({ err }, 'unhandled route error');
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  return router;
}
