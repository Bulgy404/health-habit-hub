// app/routes/intentionsRouter.js
import express from 'express';
import { makeGetDb } from '../utils/getDb.js';
import { resolveHabitConfig } from '../services/habitConfigService.js';
import {
  createIntention,
  listIntentions,
  updateIntentionStatus,
} from '../services/intentionService.js';
import { upsertLog, getLogs } from '../services/dailyLogService.js';
import { generateWindows } from '../services/srhiService.js';

export function createIntentionsRouter({ db } = {}) {
  const router = express.Router();
  const getDb = makeGetDb(db);

  router.get('/', async (req, res) => {
    try {
      const database = await getDb();
      const intentions = await listIntentions({
        db: database,
        userId: req.user.sub,
      });
      res.json(intentions);
    } catch (err) {
      console.error('[intentions] GET /:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  router.post('/', async (req, res) => {
    try {
      const {
        behaviorKey,
        behaviorLabel,
        durationMinutes,
        cues,
        intentionStatement,
      } = req.body;
      if (
        !behaviorKey ||
        !behaviorLabel ||
        !durationMinutes ||
        !cues?.length ||
        !intentionStatement
      ) {
        return res
          .status(400)
          .json({
            error:
              'behaviorKey, behaviorLabel, durationMinutes, cues, and intentionStatement are required',
          });
      }
      const database = await getDb();
      const userId = req.user.sub;
      const cueConfig = await resolveHabitConfig({ db: database, userId });
      const result = await createIntention({
        db: database,
        userId,
        behaviorKey,
        behaviorLabel,
        durationMinutes,
        cues,
        intentionStatement,
        cueConfig,
      });
      if (result.limitReached)
        return res
          .status(409)
          .json({ error: 'Habit limit reached for your study condition' });
      await generateWindows({
        db: database,
        intentionId: result.id,
        userId,
        createdAt: result.createdAt,
        studyId: result.studyId ?? null,
        groupId: result.groupId ?? null,
      });
      res.status(201).json(result);
    } catch (err) {
      console.error('[intentions] POST /:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  router.patch('/:id/status', async (req, res) => {
    try {
      const { status } = req.body;
      const allowed = ['paused', 'completed', 'abandoned'];
      if (!allowed.includes(status))
        return res
          .status(400)
          .json({ error: `status must be one of ${allowed.join(', ')}` });
      const database = await getDb();
      const result = await updateIntentionStatus({
        db: database,
        id: req.params.id,
        userId: req.user.sub,
        status,
      });
      if (result.notFound)
        return res.status(404).json({ error: 'Intention not found' });
      res.json({ updated: true });
    } catch (err) {
      console.error('[intentions] PATCH /:id/status:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  router.get('/:id/logs', async (req, res) => {
    try {
      const { from, to } = req.query;
      const database = await getDb();
      const logs = await getLogs({
        db: database,
        intentionId: req.params.id,
        from,
        to,
      });
      res.json(logs);
    } catch (err) {
      console.error('[intentions] GET /:id/logs:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  router.post('/:id/logs', async (req, res) => {
    try {
      const { date, enacted } = req.body;
      if (!date || typeof enacted !== 'boolean')
        return res
          .status(400)
          .json({
            error: 'date (YYYY-MM-DD) and enacted (boolean) are required',
          });
      const database = await getDb();
      await upsertLog({
        db: database,
        intentionId: req.params.id,
        userId: req.user.sub,
        date,
        enacted,
      });
      res.status(201).json({ logged: true });
    } catch (err) {
      console.error('[intentions] POST /:id/logs:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  return router;
}
