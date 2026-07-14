// app/routes/intentionsRouter.js
import express from 'express';
import { makeGetDb } from '../utils/getDb.js';
import { resolveHabitConfig } from '../services/habitConfigService.js';
import { computeReminderPlans } from '../services/reminderPlanService.js';
import {
  createIntention,
  listIntentions,
  updateIntentionStatus,
  getIntention,
} from '../services/intentionService.js';
import { upsertLog, getLogs, deleteLog } from '../services/dailyLogService.js';
import { generateWindows } from '../services/srhiService.js';
import { logger } from '../utils/logger.js';

const log = logger.child({ module: 'intentionsRouter' });

export function createIntentionsRouter({ db, neo4jRun } = {}) {
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
      // neo4jRun is required here so an enrolled participant's real study/
      // group config (maxHabits cap, cueConfig restrictions,
      // selfHabitCreationEnabled) is resolved instead of silently falling
      // back to the unrestricted public defaults.
      const cueConfig = await resolveHabitConfig({
        db: database,
        userId,
        neo4jRun,
      });
      // The Flutter app hides the "add habit" entry point when the
      // participant's study/group disables self habit creation, but that's
      // only a UI convenience — enforce it here too so a direct API call
      // can't bypass the study's protocol.
      if (!cueConfig.selfHabitCreationEnabled) {
        return res
          .status(403)
          .json({ error: 'Habit creation is disabled for your study condition' });
      }

      // Enforce the resolved habit-reminder mode server-side too — the
      // mobile app hides/pre-fills the reminder-time picker per mode, but a
      // direct API call must not be able to bypass an "off" or "admin_fixed"
      // study condition.
      const habitReminder = cueConfig.habitReminder;
      if (habitReminder?.mode === 'off' && reminderTime != null) {
        return res.status(400).json({
          error: 'Reminders are disabled for your study condition',
        });
      }
      const reminderTimeToStore =
        habitReminder?.mode === 'off'
          ? null
          : habitReminder?.mode === 'admin_fixed'
            ? habitReminder.time
            : (reminderTime ?? null);

      const result = await createIntention({
        db: database,
        userId,
        behaviorKey,
        behaviorLabel,
        durationMinutes,
        cues,
        intentionStatement,
        reminderTime: reminderTimeToStore,
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
      const userId = req.user.sub;
      // Ownership check: 404 (not 500/leaked data) if this intentionId
      // doesn't exist or isn't owned by the requesting user — prevents an
      // IDOR where any authenticated user could read another user's logs
      // by guessing/observing their intentionId.
      const intention = await getIntention({
        db: database,
        id: req.params.id,
        userId,
      });
      if (!intention)
        return res.status(404).json({ error: 'Intention not found' });
      const logs = await getLogs({
        db: database,
        intentionId: req.params.id,
        userId,
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
      const userId = req.user.sub;
      // Ownership check: verify the intentionId belongs to this user before
      // upserting a log against it (IDOR — see dailyLogService.js).
      const intention = await getIntention({
        db: database,
        id: req.params.id,
        userId,
      });
      if (!intention)
        return res.status(404).json({ error: 'Intention not found' });
      await upsertLog({
        db: database,
        intentionId: req.params.id,
        userId,
        date,
        enacted,
      });
      res.status(201).json({ logged: true });
    } catch (err) {
      log.error({ err: err }, '[intentions] error');
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Un-log a day: removes the entry entirely (back to "not logged"), as
  // opposed to POSTing enacted:false which records an explicit miss.
  router.delete('/:id/logs/:date', async (req, res) => {
    try {
      const database = await getDb();
      const userId = req.user.sub;
      // Ownership check — same IDOR concern as GET/POST above.
      const intention = await getIntention({
        db: database,
        id: req.params.id,
        userId,
      });
      if (!intention)
        return res.status(404).json({ error: 'Intention not found' });
      await deleteLog({
        db: database,
        intentionId: req.params.id,
        userId,
        date: req.params.date,
      });
      res.json({ deleted: true });
    } catch (err) {
      log.error({ err: err }, '[intentions] error');
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  return router;
}
