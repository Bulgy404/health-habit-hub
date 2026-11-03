// app/routes/cuePoolRouter.js
import express from 'express';
import { ObjectId } from 'mongodb';
import { isPrivileged } from '../middleware/roles.js';
import {
  resourceFilter,
  requireResourceStudy,
  authorizeResource,
} from '../services/researchResourceAccess.js';
import { makeGetDb } from '../utils/getDb.js';
import { logger } from '../utils/logger.js';
import {
  createCue,
  listCues,
  deleteCue,
  importCues,
} from '../services/cuePoolService.js';
import { validate } from '../middleware/validate.js';
import { createCueSchema, importCuesSchema } from '../schemas/adminSchemas.js';

const log = logger.child({ module: 'cuePoolRouter' });

export function createCuePoolRouter({ db } = {}) {
  const router = express.Router();
  const getDb = makeGetDb(db);

  router.use(async (req, res, next) => {
    try {
      const database = await getDb();
      if (req.method === 'GET')
        req.resourceFilter = await resourceFilter(
          database,
          req.user,
          req.query.studyId
        );
      if (req.method === 'POST') {
        req.resourceStudyId = req.query.studyId
          ? await requireResourceStudy(
              database,
              req.user,
              req.query.studyId,
              true
            )
          : null;
        if (!isPrivileged(req.user) && !req.resourceStudyId)
          return res.status(400).json({ error: 'Select a study' });
      }
      if (req.method === 'DELETE') {
        const id = req.path.split('/').filter(Boolean)[0];
        const resource = ObjectId.isValid(id ?? '')
          ? await database
              .collection('cue_pools')
              .findOne({ _id: new ObjectId(id) })
          : null;
        await authorizeResource(database, req.user, resource, true);
        if (
          await database.collection('studies').findOne({
            'groups.cueConfig.cuePoolId': {
              $in: [resource._id, String(resource._id)],
            },
          })
        )
          return res.status(409).json({ error: 'Cue is assigned to a study' });
      }
      next();
    } catch (err) {
      res
        .status(err.status || 500)
        .json({ error: err.status ? err.message : 'Internal server error' });
    }
  });

  router.get('/', async (req, res) => {
    try {
      const { quality, language, page, limit } = req.query;
      const database = await getDb();
      const result = await listCues({
        db: database,
        quality,
        language,
        resourceFilter: req.resourceFilter,
        page: parseInt(page ?? '1', 10),
        limit: parseInt(limit ?? '50', 10),
      });
      res.json({
        ...result,
        cues: result.cues.map((c) => ({
          ...c,
          canEdit:
            isPrivileged(req.user) ||
            (!!c.studyId &&
              (req.studyScope?.manageableStudyIds ?? []).some(
                (id) => String(id) === c.studyId
              )),
        })),
      });
    } catch (err) {
      log.error({ err: err }, '[cue-pools] GET /:');
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  router.post('/', validate(createCueSchema), async (req, res) => {
    try {
      const { text, languages, quality, dimensions, domain } = req.body;
      const database = await getDb();
      const result = await createCue({
        db: database,
        text,
        studyId: req.resourceStudyId,
        languages,
        quality,
        dimensions,
        domain,
      });
      res.status(201).json(result);
    } catch (err) {
      log.error({ err: err }, '[cue-pools] POST /:');
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // POST /api/v1/admin/cue-pools/import
  router.post('/import', validate(importCuesSchema), async (req, res) => {
    try {
      const { cues } = req.body;
      const database = await getDb();
      const result = await importCues({
        db: database,
        rows: cues,
        studyId: req.resourceStudyId,
      });
      res.status(201).json(result);
    } catch (err) {
      log.error({ err: err }, '[cue-pools] POST /import:');
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  router.delete('/:id', async (req, res) => {
    try {
      const database = await getDb();
      const result = await deleteCue({ db: database, id: req.params.id });
      if (result.notFound)
        return res.status(404).json({ error: 'Cue not found' });
      res.json({ deleted: true });
    } catch (err) {
      log.error({ err: err }, '[cue-pools] DELETE /:id:');
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  return router;
}
