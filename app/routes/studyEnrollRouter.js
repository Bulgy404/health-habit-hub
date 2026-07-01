import express from 'express';
import { makeGetDb } from '../utils/getDb.js';
import { redeemCode, skipCode } from '../services/studyCodeService.js';
import { logger } from '../utils/logger.js';

const log = logger.child({ module: 'studyEnrollRouter' });

export function createStudyEnrollRouter({ db, neo4jRun } = {}) {
  const router = express.Router();
  const getDb = makeGetDb(db);

  // POST /api/v1/onboarding/redeem-code — redeem a study enrollment code
  router.post('/redeem-code', async (req, res) => {
    try {
      const { code } = req.body;
      if (!code || typeof code !== 'string') {
        return res.status(400).json({ error: 'code is required' });
      }
      if (!/^HHH-[A-Z0-9]{5}$/i.test(code.trim())) {
        return res.status(400).json({
          error:
            'Invalid code format. Expected HHH-XXXXX (5 alphanumeric characters).',
        });
      }
      const userId = req.user?.sub;
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });

      const database = await getDb();
      const result = await redeemCode({ db: database, userId, code, neo4jRun });

      if (result.notFound)
        return res.status(404).json({ error: 'Code not found' });
      if (result.expired)
        return res.status(410).json({ error: 'Code has expired' });
      if (result.exhausted)
        return res.status(410).json({ error: 'Code redemption limit reached' });
      if (result.alreadyEnrolled)
        return res.status(409).json({ error: 'Already enrolled in a study' });

      res.json({
        studyId: result.studyId,
        groupId: result.groupId,
        studyName: result.studyName,
        groupLabel: result.groupLabel,
      });
    } catch (err) {
      log.error({ err: err }, 'unhandled route error');
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // POST /api/v1/onboarding/skip-code — enroll in default study, round-robin group
  router.post('/skip-code', async (req, res) => {
    try {
      const userId = req.user?.sub;
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });

      const database = await getDb();
      const result = await skipCode({ db: database, userId, neo4jRun });

      if (result.noDefaultStudy) {
        return res.status(503).json({ error: 'No default study configured' });
      }
      if (result.noGroups) {
        return res.status(503).json({ error: 'Default study has no groups' });
      }

      res.json({
        studyId: result.studyId,
        groupId: result.groupId,
        studyName: result.studyName,
        groupLabel: result.groupLabel,
      });
    } catch (err) {
      log.error({ err: err }, 'unhandled route error');
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  return router;
}

export default createStudyEnrollRouter;
