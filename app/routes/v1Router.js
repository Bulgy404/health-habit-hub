import express from 'express';
import { createAuthMiddleware } from '../middleware/auth.js';
import { requireRole } from '../middleware/requireRole.js';
import surveyRouter from './surveyRouter.js';
import { checkAllServices } from '../utils/healthCheck.js';

export function createV1Router({ jwksUrl, serviceChecks } = {}) {
  const router = express.Router();
  const authenticate = createAuthMiddleware({ jwksUrl });

  // Public: health check (no auth required)
  router.get('/health', async (req, res) => {
    const result = await checkAllServices(serviceChecks);
    const httpStatus = result.status === 'ok' ? 200 : 503;
    res.status(httpStatus).json(result);
  });

  // All routes below require a valid JWT
  router.use(authenticate);

  // Admin routes: require admin or researcher role
  router.use('/admin', requireRole('admin', 'researcher'), (req, res) => {
    res.json({ ok: true });
  });

  // Surveys routes: require participant, admin, or researcher role
  router.use(
    '/surveys',
    requireRole('participant', 'admin', 'researcher'),
    surveyRouter
  );

  // Habits routes: require participant, admin, or researcher role
  router.use(
    '/habits',
    requireRole('participant', 'admin', 'researcher'),
    (req, res) => {
      res.json({ ok: true });
    }
  );

  return router;
}

export default createV1Router;
