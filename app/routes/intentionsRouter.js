// app/routes/intentionsRouter.js
import express from 'express';
import { makeGetDb } from '../utils/getDb.js';
import { resolveHabitConfig } from '../services/habitConfigService.js';
import { computeReminderPlans } from '../services/reminderPlanService.js';
import {
  createIntention,
  listIntentions,
  updateIntentionStatus,
} from '../services/intentionService.js';
import { upsertLog, getLogs } from '../services/dailyLogService.js';
import { generateWindows } from '../services/srhiService.js';
import { logger } from '../utils/logger.js';

const log = logger.child({ module: 'intentionsRouter' });

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
      log.error({ err: err }, '[intentions] error');
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // GET /api/v1/habits/intentions/reminder-plans
  // Adaptive reminder schedule per active intention (autonomy score + tier).
  // The Flutter app uses this to (re)schedule local notifications; reminders
  // fade as SRHI and adherence rise (see reminderPlanService.js).
  router.get('/reminder-plans', async (req, res) => {
    try {
      const database = await getDb();
      const plans = await computeReminderPlans({
        db: database,
        userId: String(req.user.sub),
      });
      res.json({ plans });
    } catch (err) {
      log.error({ err: err }, '[intentions] reminder-plans error');
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
        reminderTime,
      } = req.body;
      if (
        reminderTime != null &&
        !/^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(String(reminderTime))
      ) {
        return res
          .status(400)
          .json({ error: 'reminderTime must be HH:mm (24h) or null' });
      }
      if (
        !behaviorKey ||
        !behaviorLabel ||
        !durationMinutes ||
        !cues?.length ||
        !intentionStatement
      ) {
        return res.status(400).json({
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
        reminderTime: reminderTime ?? null,
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
      log.error({ err: err }, '[intentions] error');
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
      log.error({ err: err }, '[intentions] error');
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
      log.error({ err: err }, '[intentions] error');
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  router.post('/:id/logs', async (req, res) => {
    try {
      const { date, enacted } = req.body;
      if (!date || typeof enacted !== 'boolean')
        return res.status(400).json({
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
      log.error({ err: err }, '[intentions] error');
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  return router;
}
