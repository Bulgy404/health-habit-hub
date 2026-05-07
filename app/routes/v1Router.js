import express from 'express';
import swaggerUi from 'swagger-ui-express';
import { createAuthMiddleware, ROLES } from '../middleware/auth.js';
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
import { createUsersRouter } from './usersRouter.js';
import { createStudyEnrollRouter } from './studyEnrollRouter.js';
import { createParticipantRouter } from './participantRouter.js';
import {
  createUserProfileRouter,
  createUserProfileServiceRouter,
} from './userProfileRouter.js';
import { checkAllServices } from '../utils/healthCheck.js';
import { swaggerSpec } from '../swagger.js';

export function createV1Router({
  jwksUrl,
  expectedIssuer,
  expectedAudience,
  serviceChecks,
  recommenderUrl,
  apiServiceUrl,
  libreTranslateUrl,
  db,
  neo4jRun,
  keycloak,
  tokenCardService,
  rateLimiter,
  redisClient,
  redisUrl,
} = {}) {
  const router = express.Router();
  const authenticate = createAuthMiddleware({
    jwksUrl,
    expectedIssuer,
    expectedAudience,
  });
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

  // Sanitize request bodies before auth (general protection)
  router.use(sanitizeBody);

  // Service-to-service: user profile (no JWT required, uses X-Service-Auth-Token)
  router.use('/user-profile', createUserProfileServiceRouter({ db }));

  // All routes below require a valid JWT
  router.use(authenticate);

  // Apply rate limiting after auth so req.user.sub is available for per-user keying
  router.use(limiter);

  // Admin routes: require admin or researcher role
  router.use(
    '/admin',
    requireRole(ROLES.ADMIN, ROLES.RESEARCHER),
    createAdminRouter({ db, neo4jRun, keycloak, tokenCardService })
  );

  // Surveys routes: require participant, admin, or researcher role
  router.use(
    '/surveys',
    requireRole(ROLES.USER, ROLES.ADMIN, ROLES.RESEARCHER),
    createSurveyRouter({ db })
  );

  // Habits routes: require participant, admin, or researcher role
  router.use(
    '/habits',
    requireRole(ROLES.USER, ROLES.ADMIN, ROLES.RESEARCHER),
    createHabitsRouter({ db, neo4jRun, apiServiceUrl, libreTranslateUrl })
  );

  // Recommend routes: require participant, admin, or researcher role
  router.use(
    '/recommend',
    requireRole(ROLES.USER, ROLES.ADMIN, ROLES.RESEARCHER),
    createRecommendRouter({ recommenderUrl })
  );

  // Profile routes: require participant, admin, or researcher role
  router.use(
    '/profile',
    requireRole(ROLES.USER, ROLES.ADMIN, ROLES.RESEARCHER),
    createProfileRouter({ db })
  );

  // Questionnaires routes: require participant, admin, or researcher role
  router.use(
    '/questionnaires',
    requireRole(ROLES.USER, ROLES.ADMIN, ROLES.RESEARCHER),
    createQuestionnairesRouter({ db })
  );

  // Questionnaire responses: require participant, admin, or researcher role
  router.use(
    '/questionnaire-responses',
    requireRole(ROLES.USER, ROLES.ADMIN, ROLES.RESEARCHER),
    createQuestionnaireResponsesRouter({ db })
  );

  // Recommendations routes: require participant, admin, or researcher role
  router.use(
    '/recommendations',
    requireRole(ROLES.USER, ROLES.ADMIN, ROLES.RESEARCHER),
    createRecommendationsRouter({ db, redisClient, redisUrl })
  );

  // Users routes: require participant, admin, or researcher role
  router.use(
    '/users',
    requireRole(ROLES.USER, ROLES.ADMIN, ROLES.RESEARCHER),
    createUsersRouter({ db })
  );

  // Knowledge base routes: require admin role only
  router.use(
    '/kb',
    requireRole(ROLES.ADMIN),
    createKbRouter({ apiServiceUrl })
  );

  // Authenticated onboarding code routes: require participant role
  router.use(
    '/onboarding',
    requireRole(ROLES.USER, ROLES.ADMIN, ROLES.RESEARCHER),
    createStudyEnrollRouter({ db })
  );

  // Participant-specific routes: require participant, admin, or researcher role
  router.use(
    '/participant',
    requireRole(ROLES.USER, ROLES.ADMIN, ROLES.RESEARCHER),
    createParticipantRouter({ db })
  );

  // User profile: require participant, admin, or researcher role
  router.use(
    '/user-profile',
    requireRole(ROLES.USER, ROLES.ADMIN, ROLES.RESEARCHER),
    createUserProfileRouter({ db })
  );

  return router;
}

export default createV1Router;
