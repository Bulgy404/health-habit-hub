// app/routes/cuePoolRouter.js
import express from 'express';
import { makeGetDb } from '../utils/getDb.js';
import { logger } from '../utils/logger.js';
import {
  createCue,
  listCues,
  deleteCue,
  importCues,
} from '../services/cuePoolService.js';

const log = logger.child({ module: 'cuePoolRouter' });

export function createCuePoolRouter({ db } = {}) {
  const router = express.Router();
  const getDb = makeGetDb(db);

  router.get('/', async (req, res) => {
    try {
      const { quality, language, page, limit } = req.query;
      const database = await getDb();
      const result = await listCues({
        db: database,
        quality,
        language,
        page: parseInt(page ?? '1', 10),
        limit: parseInt(limit ?? '50', 10),
      });
      res.json(result);
    } catch (err) {
      log.error({ err: err }, '[cue-pools] GET /:');
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  router.post('/', async (req, res) => {
    try {
      const { text, quality, dimensions, domain, language } = req.body;
      if (!text || !quality || !dimensions || !domain || !language) {
        return res.status(400).json({
          error: 'text, quality, dimensions, domain, language required',
        });
      }
      const database = await getDb();
      const result = await createCue({
        db: database,
        text,
        quality,
        dimensions,
        domain,
        language,
      });
      res.status(201).json(result);
    } catch (err) {
      log.error({ err: err }, '[cue-pools] POST /:');
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // POST /api/v1/admin/cue-pools/import
  router.post('/import', async (req, res) => {
    try {
      const { cues } = req.body;
      if (!Array.isArray(cues)) {
        return res.status(400).json({ error: 'cues must be an array' });
      }
      const database = await getDb();
      const result = await importCues({ db: database, rows: cues });
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
