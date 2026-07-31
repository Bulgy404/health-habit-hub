import cors from 'cors';
import express from 'express';
import neo4j from 'neo4j-driver';
import swaggerUi from 'swagger-ui-express';
import { createAuthMiddleware, ROLES } from '../middleware/auth.js';
import { requireRole } from '../middleware/requireRole.js';
import { apiRateLimiter } from '../middleware/rateLimiter.js';
import { sanitizeBody } from '../middleware/inputSanitizer.js';
import { maintenanceModeGuard } from '../middleware/maintenanceMode.js';
import { makeGetDb } from '../utils/getDb.js';
import { config } from '../utils/config.js';
import { registerNeo4jDriver } from '../utils/neo4jDrivers.js';
import { createSurveyRouter } from './surveyRouter.js';
import { createRecommendRouter } from './recommendRouter.js';
import { createProfileRouter } from './profileRouter.js';
import { createHabitsRouter } from './habitsRouter.js';
import { createAdminRouter } from './adminRouter.js';
import { createOnboardRouter } from './onboardRouter.js';
import { createRestoreRouter } from './restoreRouter.js';
import { createAuthRouter } from './authRouter.js';
import { createQuestionnairesRouter } from './questionnairesRouter.js';
import {
  createQuestionnaireResponsesRouter,
  createQuestionnaireResponsesServiceRouter,
} from './questionnaireResponsesRouter.js';
import { createRecommendationsRouter } from './recommendationsRouter.js';
import { createKbRouter } from './kbRouter.js';
import { createUsersRouter } from './usersRouter.js';
import { createStudyEnrollRouter } from './studyEnrollRouter.js';
import { createParticipantRouter } from './participantRouter.js';
import {
  createUserProfileRouter,
  createUserProfileServiceRouter,
} from './userProfileRouter.js';
import { createProfileFieldDefinitionsPublicRouter } from './profileFieldDefinitionsRouter.js';
import { createIntentionsRouter } from './intentionsRouter.js';
import { createSrhiRouter } from './srhiRouter.js';
import { createHabitConfigRouter } from './habitConfigRouter.js';
import { createUserPreferencesRouter } from './userPreferencesRouter.js';
import { createStudyConfigRouter } from './studyConfigRouter.js';
import { createCuePoolRouter } from './cuePoolRouter.js';
import { createStudyExportRouter } from './studyExportRouter.js';
import { createNotificationCampaignRouter } from './notificationCampaignRouter.js';
import { checkAllServices } from '../utils/healthCheck.js';
import { swaggerSpec } from '../swagger.js';

export function createApiRouter({
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
  enableQueue = false,
} = {}) {
  const router = express.Router();

  const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  router.use(
    cors({
      origin: allowedOrigins.length ? allowedOrigins : false,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
      credentials: true,
    })
  );

  const authenticate = createAuthMiddleware({
    jwksUrl,
    expectedIssuer,
    expectedAudience,
  });
  const limiter = rateLimiter || apiRateLimiter;

  // Shared Neo4j run helper for the subrouters that don't provision their own
  // driver. The real app boot (app.js) constructs this router without a
  // `neo4jRun`, so without this fallback every Neo4j-backed subrouter throws
  // "neo4jRun is not a function" (e.g. POST /onboarding/skip-code). Tests
  // inject a mock `neo4jRun`, in which case no real driver is created.
  //
  // habitsRouter is deliberately NOT switched to this helper below: it
  // self-provisions a driver and treats an undefined `neo4jRun` as the signal
  // to enable its BullMQ queue (see queueEnabled there), so it keeps receiving
  // the raw `neo4jRun`.
  const _neo4jDriver = neo4jRun
    ? null
    : neo4j.driver(
        config.neo4j.uri,
        neo4j.auth.basic(config.neo4j.user, config.neo4j.password)
      );
  if (_neo4jDriver) registerNeo4jDriver(_neo4jDriver);

  // Returns Array<Object> — either from the injected neo4jRun or the shared
  // driver above. Sessions are short-lived; the driver lives for the process.
  async function runNeo4j(cypher, params = {}) {
    if (neo4jRun) return neo4jRun(cypher, params);
    const session = _neo4jDriver.session();
    try {
      const result = await session.run(cypher, params);
      return result.records.map((r) => r.toObject());
    } finally {
      await session.close();
    }
  }

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
   *     description: Returns the live health status and latency of neo4j, mongo, keycloak, and the recommender service. This endpoint is unauthenticated.
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
  router.use('/onboard', createOnboardRouter({ keycloak, db }));

  // Public: passphrase-based account restore on a new device (rate limited
  // separately, no JWT required — the caller has no session yet).
  router.use('/restore', createRestoreRouter({ db }));

  // Public: refresh of hhh-ropc-issued token pairs (rate limited separately,
  // no JWT required — the caller's access token may already be expired).
  router.use('/auth', createAuthRouter());

  // Sanitize request bodies before auth (general protection)
  router.use(sanitizeBody);

  // Service-to-service: user profile (no JWT required, uses X-Service-Auth-Token)
  router.use(
    '/user-profile',
    apiRateLimiter,
    createUserProfileServiceRouter({ db })
  );

  // Service-to-service: questionnaire responses (no JWT required, uses X-Service-Auth-Token)
  router.use(
    '/questionnaire-responses',
    apiRateLimiter,
    createQuestionnaireResponsesServiceRouter({ db, neo4jRun: runNeo4j })
  );

  // All routes below require a valid JWT
  router.use(authenticate);

  // Apply rate limiting after auth so req.user.sub is available for per-user keying
  router.use(limiter);

  // While a backup restore is in flight, refuse everything except the
  // Backups admin routes themselves — nothing else should read/write Mongo
  // while it's being dropped and reloaded underneath it.
  router.use(maintenanceModeGuard({ getDb: makeGetDb(db) }));

  // Admin routes: require admin or researcher role
  router.use(
    '/admin',
    requireRole(ROLES.ADMIN, ROLES.RESEARCHER),
    createAdminRouter({ db, neo4jRun: runNeo4j, keycloak, tokenCardService })
  );

  // Surveys routes: require user, admin, or researcher role
  router.use(
    '/surveys',
    requireRole(ROLES.USER, ROLES.ADMIN, ROLES.RESEARCHER),
    createSurveyRouter({ db })
  );

  // Habits routes: require user, admin, or researcher role
  router.use(
    '/habits',
    requireRole(ROLES.USER, ROLES.ADMIN, ROLES.RESEARCHER),
    createHabitsRouter({
      db,
      neo4jRun,
      apiServiceUrl,
      libreTranslateUrl,
      enableQueue,
    })
  );

  // Implementation intentions (user + admin + researcher)
  router.use(
    '/habits/intentions',
    requireRole(ROLES.USER, ROLES.ADMIN, ROLES.RESEARCHER),
    createIntentionsRouter({ db, neo4jRun: runNeo4j })
  );

  // SRHI measurement (user + admin + researcher)
  router.use(
    '/srhi',
    requireRole(ROLES.USER, ROLES.ADMIN, ROLES.RESEARCHER),
    createSrhiRouter({ db, neo4jRun: runNeo4j })
  );

  // Resolved habit config (user + admin + researcher)
  router.use(
    '/me/habit-config',
    requireRole(ROLES.USER, ROLES.ADMIN, ROLES.RESEARCHER),
    createHabitConfigRouter({ db, neo4jRun: runNeo4j })
  );

  // Per-user preferences (§7.3 Information Overload opt-out)
  router.use(
    '/me/preferences',
    requireRole(ROLES.USER, ROLES.ADMIN, ROLES.RESEARCHER),
    createUserPreferencesRouter({ db, neo4jRun: runNeo4j })
  );

  // Cue pool management (admin + researcher only)
  router.use(
    '/admin/cue-pools',
    requireRole(ROLES.ADMIN, ROLES.RESEARCHER),
    createCuePoolRouter({ db })
  );

  // Study CSV/ZIP data export (admin + researcher only). Mounted at a
  // distinct path from the JSON export in studiesRouter.js's
  // GET /admin/studies/:id/export — both used to share that path, which
  // meant the earlier-mounted /admin router always won and this ZIP
  // handler was unreachable.
  router.use(
    '/admin/studies/:id/export/zip',
    requireRole(ROLES.ADMIN, ROLES.RESEARCHER),
    createStudyExportRouter({ db })
  );

  // Researcher notification campaigns (admin + researcher only)
  router.use(
    '/admin/notifications',
    requireRole(ROLES.ADMIN, ROLES.RESEARCHER),
    createNotificationCampaignRouter({ db, neo4jRun: runNeo4j })
  );

  // Recommend routes: require user, admin, or researcher role
  router.use(
    '/recommend',
    requireRole(ROLES.USER, ROLES.ADMIN, ROLES.RESEARCHER),
    createRecommendRouter({ recommenderUrl })
  );

  // Profile routes: require user, admin, or researcher role
  router.use(
    '/profile',
    requireRole(ROLES.USER, ROLES.ADMIN, ROLES.RESEARCHER),
    createProfileRouter({ db })
  );

  // Questionnaires routes: require user, admin, or researcher role
  router.use(
    '/questionnaires',
    requireRole(ROLES.USER, ROLES.ADMIN, ROLES.RESEARCHER),
    createQuestionnairesRouter({ db })
  );

  // Questionnaire responses: require user, admin, or researcher role
  router.use(
    '/questionnaire-responses',
    requireRole(ROLES.USER, ROLES.ADMIN, ROLES.RESEARCHER),
    createQuestionnaireResponsesRouter({ db, neo4jRun: runNeo4j })
  );

  // Recommendations routes: require user, admin, or researcher role
  router.use(
    '/recommendations',
    requireRole(ROLES.USER, ROLES.ADMIN, ROLES.RESEARCHER),
    createRecommendationsRouter({ db, redisClient, redisUrl })
  );

  // Users routes: require user, admin, or researcher role
  router.use(
    '/users',
    requireRole(ROLES.USER, ROLES.ADMIN, ROLES.RESEARCHER),
    createUsersRouter({ db, keycloak, neo4jRun: runNeo4j })
  );

  // Knowledge base routes: require admin role only
  router.use(
    '/kb',
    requireRole(ROLES.ADMIN),
    createKbRouter({ apiServiceUrl })
  );

  // Authenticated onboarding code routes: require user role
  router.use(
    '/onboarding',
    requireRole(ROLES.USER, ROLES.ADMIN, ROLES.RESEARCHER),
    createStudyEnrollRouter({ db, neo4jRun: runNeo4j })
  );

  // Study config for the current participant: require user, admin, or researcher role
  router.use(
    '/study-config',
    requireRole(ROLES.USER, ROLES.ADMIN, ROLES.RESEARCHER),
    createStudyConfigRouter({ db, neo4jRun: runNeo4j })
  );

  // Participant-specific routes: require user, admin, or researcher role
  router.use(
    '/participant',
    requireRole(ROLES.USER, ROLES.ADMIN, ROLES.RESEARCHER),
    createParticipantRouter({ db, neo4jRun: runNeo4j })
  );

  // User profile: require user, admin, or researcher role
  router.use(
    '/user-profile',
    requireRole(ROLES.USER, ROLES.ADMIN, ROLES.RESEARCHER),
    createUserProfileRouter({ db, neo4jRun: runNeo4j })
  );

  // Profile field definitions (public read): require user, admin, or researcher role
  router.use(
    '/profile-field-definitions',
    requireRole(ROLES.USER, ROLES.ADMIN, ROLES.RESEARCHER),
    createProfileFieldDefinitionsPublicRouter({ db })
  );

  return router;
}

export default createApiRouter;
