// app/routes/cuePoolRouter.js
import express from 'express';
import { makeGetDb } from '../utils/getDb.js';
import { createCue, listCues, deleteCue } from '../services/cuePoolService.js';

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
      console.error('[cue-pools] GET /:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  router.post('/', async (req, res) => {
    try {
      const { text, quality, dimensions, domain, language } = req.body;
      if (!text || !quality || !dimensions || !domain || !language) {
        return res
          .status(400)
          .json({
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
      console.error('[cue-pools] POST /:', err);
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
      console.error('[cue-pools] DELETE /:id:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  return router;
}
