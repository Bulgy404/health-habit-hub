import express from 'express';
import swaggerUi from 'swagger-ui-express';
import { createAuthMiddleware } from '../middleware/auth.js';
import { requireRole } from '../middleware/requireRole.js';
import { apiRateLimiter } from '../middleware/rateLimiter.js';
import { sanitizeBody } from '../middleware/inputSanitizer.js';
import { createSurveyRouter } from './surveyRouter.js';
import { createRecommendRouter } from './recommendRouter.js';
import { createProfileRouter } from './profileRouter.js';
import { createHabitsRouter } from './habitsRouter.js';
import { createAdminRouter } from './adminRouter.js';
import { createOnboardRouter } from './onboardRouter.js';
import { createQuestionnairesRouter } from './questionnairesRouter.js';
import { createQuestionnaireResponsesRouter } from './questionnaireResponsesRouter.js';
import { createRecommendationsRouter } from './recommendationsRouter.js';
import { createKbRouter } from './kbRouter.js';
import { checkAllServices } from '../utils/healthCheck.js';
import { swaggerSpec } from '../swagger.js';

export function createV1Router({
  jwksUrl,
  serviceChecks,
  recommenderUrl,
  apiServiceUrl,
  db,
  neo4jRun,
  keycloak,
  tokenCardService,
  rateLimiter,
  redisClient,
  redisUrl,
} = {}) {
  const router = express.Router();
  const authenticate = createAuthMiddleware({ jwksUrl });
  const limiter = rateLimiter || apiRateLimiter;

  /**
   * @swagger
   * /docs:
   *   get:
   *     summary: Swagger UI – interactive API documentation
   *     description: Serves the Swagger UI for exploring and testing all HHH API endpoints. No authentication required to view the docs.
   *     tags: [Docs]
   *     security: []
   *     responses:
   *       200:
   *         description: Swagger UI HTML page
   *         content:
   *           text/html:
   *             schema:
   *               type: string
   */
  // Public: Swagger UI (no auth required)
  router.use('/docs', swaggerUi.serve);
  router.get('/docs', swaggerUi.setup(swaggerSpec, { explorer: true }));

  /**
   * @swagger
   * /docs/openapi.json:
   *   get:
   *     summary: Raw OpenAPI spec in JSON format
   *     description: Returns the full OpenAPI 3.1 specification as JSON.
   *     tags: [Docs]
   *     security: []
   *     responses:
   *       200:
   *         description: OpenAPI spec JSON
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   */
  router.get('/docs/openapi.json', (_req, res) => {
    res.json(swaggerSpec);
  });

  /**
   * @swagger
   * /health:
   *   get:
   *     summary: Check health of all downstream services
   *     description: Returns the live health status and latency of neo4j, mongo, fuseki, keycloak, and the recommender service. This endpoint is unauthenticated.
   *     tags: [Health]
   *     security: []
   *     responses:
   *       200:
   *         description: All critical services are healthy
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/HealthResponse'
   *             example:
   *               status: ok
   *               services:
   *                 neo4j: { status: ok, latencyMs: 8 }
   *                 mongo: { status: ok, latencyMs: 5 }
   *                 fuseki: { status: ok, latencyMs: 22 }
   *                 keycloak: { status: ok, latencyMs: 30 }
   *                 recommender: { status: ok, latencyMs: 15 }
   *       503:
   *         description: One or more critical services (neo4j, mongo) are unavailable
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/HealthResponse'
   *             example:
   *               status: error
   *               services:
   *                 neo4j: { status: error, latencyMs: 0 }
   *                 mongo: { status: ok, latencyMs: 5 }
   *                 fuseki: { status: ok, latencyMs: 22 }
   *                 keycloak: { status: ok, latencyMs: 30 }
   *                 recommender: { status: ok, latencyMs: 15 }
   */
  // Public: health check (no auth required)
  router.get('/health', async (req, res) => {
    const result = await checkAllServices(serviceChecks);
    const httpStatus = result.status === 'ok' ? 200 : 503;
    res.status(httpStatus).json(result);
  });

  // Public: anonymous self-registration (rate limited separately, no JWT required)
  router.use('/onboard', createOnboardRouter({ keycloak }));

  // Apply rate limiting and input sanitization to all authenticated routes
  router.use(limiter);
  router.use(sanitizeBody);

  // All routes below require a valid JWT
  router.use(authenticate);

  // Admin routes: require admin or researcher role
  router.use(
    '/admin',
    requireRole('admin', 'researcher'),
    createAdminRouter({ db, neo4jRun, keycloak, tokenCardService })
  );

  // Surveys routes: require participant, admin, or researcher role
  router.use(
    '/surveys',
    requireRole('participant', 'admin', 'researcher'),
    createSurveyRouter({ db })
  );

  // Habits routes: require participant, admin, or researcher role
  router.use(
    '/habits',
    requireRole('participant', 'admin', 'researcher'),
    createHabitsRouter({ db, neo4jRun, apiServiceUrl })
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

  // Questionnaires routes: require participant, admin, or researcher role
  router.use(
    '/questionnaires',
    requireRole('participant', 'admin', 'researcher'),
    createQuestionnairesRouter({ db })
  );

  // Questionnaire responses: require participant, admin, or researcher role
  router.use(
    '/questionnaire-responses',
    requireRole('participant', 'admin', 'researcher'),
    createQuestionnaireResponsesRouter({ db })
  );

  // Recommendations routes: require participant, admin, or researcher role
  router.use(
    '/recommendations',
    requireRole('participant', 'admin', 'researcher'),
    createRecommendationsRouter({ db, redisClient, redisUrl })
  );

  // Knowledge base routes: require admin or researcher role
  router.use(
    '/kb',
    requireRole('admin', 'researcher'),
    createKbRouter({ apiServiceUrl })
  );

  return router;
}

export default createV1Router;
