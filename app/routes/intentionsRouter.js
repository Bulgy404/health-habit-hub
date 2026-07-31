// app/routes/intentionsRouter.js
import express from 'express';
import { makeGetDb } from '../utils/getDb.js';
import { resolveHabitConfig } from '../services/habitConfigService.js';
import {
  computeReminderPlans,
  readReminderTemplates,
} from '../services/reminderPlanService.js';
import { computeUserGamification } from '../services/gamificationService.js';
import {
  createIntention,
  listIntentions,
  updateIntentionStatus,
  getIntention,
} from '../services/intentionService.js';
import { upsertLog, getLogs, deleteLog } from '../services/dailyLogService.js';
import { getPreferences } from '../services/userPreferencesService.js';
import { generateWindows } from '../services/srhiService.js';
import { generateHabitCreationWindows } from '../services/questionnaireScheduleService.js';
import { logger } from '../utils/logger.js';

const log = logger.child({ module: 'intentionsRouter' });

/**
 * @param {object} deps
 * @param {object} [deps.db]
 * @param {Function} [deps.neo4jRun]
 */
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
      const userId = String(req.user.sub);
      // §7.2 — resolve the participant's reminder content mode + the (admin-
      // editable) rotating phrasing templates so the app can render
      // "when {cue}, {behavior}" style reminders when the mode is
      // implementation_intention, and vary the phrasing to avoid its own
      // habituation. Best-effort: fall back to generic + defaults on error.
      const [plans, cueConfig, templates] = await Promise.all([
        computeReminderPlans({ db: database, userId }),
        resolveHabitConfig({ db: database, userId, neo4jRun }).catch(() => ({
          reminderContentMode: 'generic',
        })),
        readReminderTemplates(database),
      ]);
      res.json({
        plans,
        reminderContentMode: cueConfig.reminderContentMode ?? 'generic',
        reminderTemplates: templates,
      });
    } catch (err) {
      log.error({ err: err }, '[intentions] reminder-plans error');
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // GET /api/v1/habits/intentions/gamification
  // §7.5 — XP, level, and earned badges, recomputed fresh from the same
  // signals reminderPlanService uses. Persists newly earned badges so the app
  // can show a one-time praise notification for `newlyEarned`.
  router.get('/gamification', async (req, res) => {
    try {
      const database = await getDb();
      const summary = await computeUserGamification({
        db: database,
        userId: String(req.user.sub),
        neo4jRun,
      });
      res.json(summary);
    } catch (err) {
      log.error({ err: err }, '[intentions] gamification error');
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
        habitType,
        stackedOn,
        creationMode,
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
      // §7.4 Habit Distinction — habitType is a required build/quit choice made
      // at the start of habit creation; reject anything else so the research
      // covariate is never silently defaulted for app-created habits.
      if (habitType !== 'build' && habitType !== 'quit') {
        return res
          .status(400)
          .json({ error: "habitType must be 'build' or 'quit'" });
      }
      // §7.1 Habit Stacking — creationMode is optional; when 'stacked' an
      // anchor reference should accompany it.
      if (
        creationMode != null &&
        creationMode !== 'standalone' &&
        creationMode !== 'stacked'
      ) {
        return res.status(400).json({
          error: "creationMode must be 'standalone' or 'stacked'",
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
        return res.status(403).json({
          error: 'Habit creation is disabled for your study condition',
        });
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

      // §7.3 Information Overload — resolve the (per study/group) guard so the
      // service can enforce the growing per-type cap. Absent/disabled → no-op.
      // When the study allows it and the participant has opted out, the guard
      // is skipped (a natural within-study comparison: gated vs. opted-out).
      let overload = null;
      if (cueConfig.informationOverloadGuard?.enabled) {
        const optOutAllowed =
          cueConfig.informationOverloadGuard.userOptOutAllowed === true;
        const prefs = optOutAllowed
          ? await getPreferences({ db: database, userId })
          : { informationOverloadOptOut: false };
        if (!(optOutAllowed && prefs.informationOverloadOptOut)) {
          overload = {
            enabled: true,
            unlockTier: cueConfig.informationOverloadUnlockTier ?? 'weekly',
          };
        }
      }

      const result = await createIntention({
        db: database,
        userId,
        behaviorKey,
        behaviorLabel,
        durationMinutes,
        cues,
        intentionStatement,
        habitType,
        stackedOn: stackedOn ?? null,
        creationMode: creationMode ?? 'standalone',
        reminderTime: reminderTimeToStore,
        cueConfig,
        overload,
      });
      if (result.limitReached) {
        // §7.3 returns unlockTier/currentTier so the app can explain *why* the
        // habit was blocked (and what has to happen to unlock a new slot),
        // rather than a bare refusal. The legacy maxHabits cap has neither.
        if (result.unlockTier) {
          return res.status(409).json({
            error: 'Habit limit reached for your study condition',
            limitReached: true,
            reason: 'information_overload',
            unlockTier: result.unlockTier,
            currentTier: result.currentTier,
          });
        }
        return res
          .status(409)
          .json({ error: 'Habit limit reached for your study condition' });
      }

      // Resolve the participant's study/group from their enrollment so we can
      // check which questionnaires are configured to deliver on habit creation.
      const enrollment = await database
        .collection('enrollments')
        .findOne(
          { userId: String(userId) },
          { projection: { studyId: 1, groupId: 1 } }
        );
      const studyId = enrollment?.studyId
        ? enrollment.studyId.toString()
        : (result.studyId ?? null);
      const groupId = enrollment?.groupId
        ? enrollment.groupId.toString()
        : (result.groupId ?? null);

      // SRHI runs for every habit, unconditionally — self-habit-creation was
      // already verified enabled above, and that's SRHI's only precondition.
      // Its own per-habit pipeline handles scoring/sparkline.
      await generateWindows({
        db: database,
        intentionId: result.id,
        userId,
        createdAt: result.createdAt,
        studyId,
        groupId,
      });

      // Generic habit-scoped questionnaires get their full window series
      // anchored at habit creation.
      await generateHabitCreationWindows({
        db: database,
        userId,
        studyId,
        groupId,
        intentionId: result.id,
        createdAt: new Date(result.createdAt),
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
