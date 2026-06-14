import { logger } from '../utils/logger.js';
import express from 'express';

/**
 * Knowledge Base router — proxies KB CRUD operations to the API-service.
 *
 * Routes (all require admin/researcher role, enforced in v1Router):
 *   GET    /api/v1/kb              — list PDFs
 *   POST   /api/v1/kb              — upload a PDF (multipart/form-data)
 *   DELETE /api/v1/kb/:filename    — delete a PDF
 *   POST   /api/v1/kb/reindex      — force re-index
 */
const log = logger.child({ module: 'kbRouter' });

export function createKbRouter({ apiServiceUrl } = {}) {
  const router = express.Router();
  const serviceUrl =
    apiServiceUrl || process.env.API_SERVICE_URL || 'http://recommender:8000';

  // The Python API-service requires X-Service-Auth-Token on every request.
  // FastAPI returns 422 (not 401) when a required Header(...) param is absent.
  function serviceHeaders(extra = {}) {
    return {
      'x-service-auth-token': process.env.API_SERVICE_SECRET || '',
      ...extra,
    };
  }

  // GET /api/v1/kb — list all PDFs
  router.get('/', async (_req, res) => {
    try {
      const upstream = await fetch(`${serviceUrl}/api/v1/kb`, {
        headers: serviceHeaders(),
      });
      const data = await upstream.json();
      res.status(upstream.status).json(data);
    } catch (err) {
      log.error({ err: err }, 'unhandled route error');
      res.status(502).json({ error: 'Knowledge base service unavailable' });
    }
  });

  // POST /api/v1/kb/reindex — force full re-index (registered before /:filename)
  router.post('/reindex', async (_req, res) => {
    try {
      const upstream = await fetch(`${serviceUrl}/api/v1/kb/reindex`, {
        method: 'POST',
        headers: serviceHeaders(),
      });
      const data = await upstream.json();
      res.status(upstream.status).json(data);
    } catch (err) {
      log.error({ err: err }, 'unhandled route error');
      res.status(502).json({ error: 'Knowledge base service unavailable' });
    }
  });

  // POST /api/v1/kb — upload PDF (pipe raw multipart body to API-service)
  router.post('/', async (req, res) => {
    try {
      const chunks = [];
      for await (const chunk of req) {
        chunks.push(chunk);
      }
      const body = Buffer.concat(chunks);
      const upstream = await fetch(`${serviceUrl}/api/v1/kb`, {
        method: 'POST',
        headers: serviceHeaders({ 'content-type': req.headers['content-type'] }),
        body,
      });
      const data = await upstream.json();
      res.status(upstream.status).json(data);
    } catch (err) {
      log.error({ err: err }, 'unhandled route error');
      res.status(502).json({ error: 'Knowledge base service unavailable' });
    }
  });

  // DELETE /api/v1/kb/:filename — delete a PDF
  router.delete('/:filename', async (req, res) => {
    try {
      const upstream = await fetch(
        `${serviceUrl}/api/v1/kb/${encodeURIComponent(req.params.filename)}`,
        { method: 'DELETE', headers: serviceHeaders() }
      );
      const data = await upstream.json();
      res.status(upstream.status).json(data);
    } catch (err) {
      log.error({ err: err }, 'unhandled route error');
      res.status(502).json({ error: 'Knowledge base service unavailable' });
    }
  });

  return router;
}
