// app/routes/activityTypeRouter.js
import express from 'express';
import { makeGetDb } from '../utils/getDb.js';
import { logger } from '../utils/logger.js';
import { validate } from '../middleware/validate.js';
import { requireRole } from '../middleware/requireRole.js';
import { ROLES } from '../middleware/roles.js';
import {
  createActivityTypeSchema,
  updateActivityTypeSchema,
} from '../schemas/adminSchemas.js';
import {
  listActivityTypes,
  createActivityType,
  updateActivityType,
  deleteActivityType,
} from '../services/activityTypeService.js';

const log = logger.child({ module: 'activityTypeRouter' });

/**
 * Activity Type router — manages the platform-wide catalog of activity types.
 *
 * Routes:
 *   GET    /api/v1/admin/activity-types           — list all activity types
 *   POST   /api/v1/admin/activity-types           — create a new activity type
 *   PATCH  /api/v1/admin/activity-types/:key      — update label or isDefault flag
 *   DELETE /api/v1/admin/activity-types/:key      — delete an activity type
 *
 * Any portal role may list the catalog, because a study's habit-creation
 * settings label its activities from it. Changing it is admin-only, since
 * every study shares it.
 */
export function createActivityTypeRouter({ db } = {}) {
  const router = express.Router();
  const getDb = makeGetDb(db);

  // GET /api/v1/admin/activity-types
  router.get('/', async (_req, res) => {
    try {
      const database = await getDb();
      const types = await listActivityTypes(database);
      res.json(types);
    } catch (err) {
      log.error({ err }, '[activity-types] GET /');
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // POST /api/v1/admin/activity-types
  router.post(
    '/',
    requireRole(ROLES.ADMIN),
    validate(createActivityTypeSchema),
    async (req, res) => {
      try {
        const {
          key,
          label_en,
          label_de,
          label_ja,
          label_fr,
          label_nl,
          isDefault,
        } = req.body;
        const database = await getDb();
        const result = await createActivityType(database, {
          key,
          label_en,
          label_de,
          label_ja,
          label_fr,
          label_nl,
          isDefault,
        });
        if (result.error)
          return res.status(result.status ?? 400).json({ error: result.error });
        res.status(201).json(result);
      } catch (err) {
        log.error({ err }, '[activity-types] POST /');
        res.status(500).json({ error: 'Internal server error' });
      }
    }
  );

  // PATCH /api/v1/admin/activity-types/:key
  router.patch(
    '/:key',
    requireRole(ROLES.ADMIN),
    validate(updateActivityTypeSchema),
    async (req, res) => {
      try {
        const { key } = req.params;
        const database = await getDb();
        const result = await updateActivityType(database, key, req.body);
        if (result.notFound)
          return res.status(404).json({ error: 'Activity type not found' });
        res.json({ ok: true });
      } catch (err) {
        log.error({ err }, '[activity-types] PATCH /:key');
        res.status(500).json({ error: 'Internal server error' });
      }
    }
  );

  // DELETE /api/v1/admin/activity-types/:key
  router.delete('/:key', requireRole(ROLES.ADMIN), async (req, res) => {
    try {
      const database = await getDb();
      const result = await deleteActivityType(database, req.params.key);
      if (result.notFound)
        return res.status(404).json({ error: 'Activity type not found' });
      res.json({ deleted: true });
    } catch (err) {
      log.error({ err }, '[activity-types] DELETE /:key');
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  return router;
}
