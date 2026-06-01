// app/routes/srhiRouter.js
import express from 'express';
import { makeGetDb } from '../utils/getDb.js';
import {
  getDueWindows,
  submitSrhi,
  getTrajectory,
} from '../services/srhiService.js';

export function createSrhiRouter({ db } = {}) {
  const router = express.Router();
  const getDb = makeGetDb(db);

  router.get('/due', async (req, res) => {
    try {
      const database = await getDb();
      const due = await getDueWindows({ db: database, userId: req.user.sub });
      res.json(due);
    } catch (err) {
      console.error('[srhi] GET /due:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  router.post('/:intentionId/week/:weekNumber', async (req, res) => {
    try {
      const { items } = req.body;
      if (!items || typeof items !== 'object')
        return res.status(400).json({ error: 'items object required' });
      const database = await getDb();
      const result = await submitSrhi({
        db: database,
        intentionId: req.params.intentionId,
        userId: req.user.sub,
        weekNumber: parseInt(req.params.weekNumber, 10),
        items,
      });
      if (result.invalid)
        return res
          .status(400)
          .json({ error: 'Missing or invalid items', missing: result.missing });
      if (result.notFound)
        return res
          .status(404)
          .json({ error: 'SRHI window not found or already submitted' });
      res.status(201).json(result);
    } catch (err) {
      console.error('[srhi] POST:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  router.get('/:intentionId/trajectory', async (req, res) => {
    try {
      const database = await getDb();
      const trajectory = await getTrajectory({
        db: database,
        intentionId: req.params.intentionId,
        userId: req.user.sub,
      });
      res.json(trajectory);
    } catch (err) {
      console.error('[srhi] GET /trajectory:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  return router;
}
