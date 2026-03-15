import express from 'express';
import { createAuthMiddleware } from '../middleware/auth.js';
import { requireRole } from '../middleware/requireRole.js';
import surveyRouter from './surveyRouter.js';
import { createRecommendRouter } from './recommendRouter.js';
import { createProfileRouter } from './profileRouter.js';
import { createHabitsRouter } from './habitsRouter.js';
import { createAdminRouter } from './adminRouter.js';
import { checkAllServices } from '../utils/healthCheck.js';

export function createV1Router({
  jwksUrl,
  serviceChecks,
  recommenderUrl,
  db,
  neo4jRun,
  keycloak,
} = {}) {
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
  router.use(
    '/admin',
    requireRole('admin', 'researcher'),
    createAdminRouter({ db, neo4jRun, keycloak })
  );

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
    createHabitsRouter({ db, neo4jRun })
  );

  // Recommend routes: require participant, admin, or researcher role
  router.use(
    '/recommend',
    requireRole('participant', 'admin', 'researcher'),
    createRecommendRouter({ recommenderUrl })
  );

  // Profile routes: require participant, admin, or researcher role
  router.use(
    '/profile',
    requireRole('participant', 'admin', 'researcher'),
    createProfileRouter({ db })
  );

  return router;
}

export default createV1Router;
