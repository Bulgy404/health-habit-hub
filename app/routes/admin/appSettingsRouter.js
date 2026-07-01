import express from 'express';
import { makeGetDb } from '../../utils/getDb.js';
import { COLLECTION, DEFAULTS } from '../../models/appSettings.js';
import { validate } from '../../middleware/validate.js';
import { updateAppSettingsSchema } from '../../schemas/adminSchemas.js';
import { logger } from '../../utils/logger.js';

const log = logger.child({ module: 'appSettingsRouter' });

export function createAppSettingsRouter({ db } = {}) {
  const router = express.Router();
  const getDb = makeGetDb(db);

  async function getSettings(database) {
    const doc = await database
      .collection(COLLECTION)
      .findOne({ key: 'global' });
    return {
      guidedHabitCreationEnabled:
        doc?.guidedHabitCreationEnabled ?? DEFAULTS.guidedHabitCreationEnabled,
      communityShareDefault:
        doc?.communityShareDefault ?? DEFAULTS.communityShareDefault,
    };
  }

  // GET /api/v1/admin/app-settings
  router.get('/app-settings', async (req, res) => {
    try {
      const database = await getDb();
      res.json(await getSettings(database));
    } catch (err) {
      log.error({ err }, 'unhandled route error');
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // PUT /api/v1/admin/app-settings
  router.put(
    '/app-settings',
    validate(updateAppSettingsSchema),
    async (req, res) => {
      try {
        const database = await getDb();
        const $set = { updatedAt: new Date() };
        if (req.body.guidedHabitCreationEnabled !== undefined)
          $set.guidedHabitCreationEnabled = req.body.guidedHabitCreationEnabled;
        if (req.body.communityShareDefault !== undefined)
          $set.communityShareDefault = req.body.communityShareDefault;

        await database
          .collection(COLLECTION)
          .updateOne(
            { key: 'global' },
            { $set: { key: 'global', ...$set } },
            { upsert: true }
          );
        res.json(await getSettings(database));
      } catch (err) {
        log.error({ err }, 'unhandled route error');
        res.status(500).json({ error: 'Internal server error' });
      }
    }
  );

  return router;
}
