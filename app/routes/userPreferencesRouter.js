// app/routes/userPreferencesRouter.js
import express from 'express';
import { makeGetDb } from '../utils/getDb.js';
import {
  getPreferences,
  setInformationOverloadOptOut,
} from '../services/userPreferencesService.js';
import { resolveHabitConfig } from '../services/habitConfigService.js';
import { logger } from '../utils/logger.js';

const log = logger.child({ module: 'userPreferencesRouter' });

/**
 * Per-user preferences (currently the §7.3 Information Overload opt-out).
 * Mounted at /me/preferences.
 * @param {{ db?: object, neo4jRun?: Function }} deps
 */
export function createUserPreferencesRouter({ db, neo4jRun } = {}) {
  const router = express.Router();
  const getDb = makeGetDb(db);

  // GET /api/v1/me/preferences — current prefs + whether opt-out is even
  // allowed for this participant's study/group (so the app can hide the toggle).
  router.get('/', async (req, res) => {
    try {
      const database = await getDb();
      const userId = req.user.sub;
      const [prefs, cueConfig] = await Promise.all([
        getPreferences({ db: database, userId }),
        resolveHabitConfig({ db: database, userId, neo4jRun }).catch(() => ({
          informationOverloadGuard: {
            enabled: false,
            userOptOutAllowed: false,
          },
        })),
      ]);
      res.json({
        ...prefs,
        informationOverloadGuardEnabled:
          cueConfig.informationOverloadGuard?.enabled === true,
        informationOverloadOptOutAllowed:
          cueConfig.informationOverloadGuard?.userOptOutAllowed === true,
      });
    } catch (err) {
      log.error({ err }, '[preferences] GET error');
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // PATCH /api/v1/me/preferences/information-overload-opt-out { optOut: bool }
  // Enforces that opt-out is only honoured when the study/group allows it —
  // the mobile toggle is already hidden otherwise, but a direct API call must
  // not be able to bypass a protocol that forbids opting out.
  router.patch('/information-overload-opt-out', async (req, res) => {
    try {
      const { optOut } = req.body || {};
      if (typeof optOut !== 'boolean') {
        return res.status(400).json({ error: 'optOut (boolean) is required' });
      }
      const database = await getDb();
      const userId = req.user.sub;
      const cueConfig = await resolveHabitConfig({
        db: database,
        userId,
        neo4jRun,
      });
      const allowed =
        cueConfig.informationOverloadGuard?.userOptOutAllowed === true;
      if (optOut && !allowed) {
        return res.status(403).json({
          error: 'Opt-out is not permitted for your study condition',
        });
      }
      const result = await setInformationOverloadOptOut({
        db: database,
        userId,
        optOut,
      });
      res.json(result);
    } catch (err) {
      log.error({ err }, '[preferences] PATCH error');
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  return router;
}

export default createUserPreferencesRouter;
