import { createServer } from 'node:http';
import bodyParser from 'body-parser';
import express from 'express';
import { metricsMiddleware, register } from './middleware/metrics.js';
import path from 'path';
import cookieParser from 'cookie-parser';
import { randomBytes, randomUUID } from 'node:crypto';

import { jsonBodyParser } from './middleware/requestParser.js';
import { securityHeaders } from './middleware/securityHeaders.js';
import { staticFileMiddleware } from './middleware/staticFileMiddleware.js';
import { config } from './utils/config.js';
import { logger } from './utils/logger.js';
import {
  getLanguageCodes,
  getLanguageMessages,
  loadLanguageFiles,
} from './utils/localization.js';

const log = logger.child({ module: 'startup' });

// Express config — public legal pages (rendered by the Flutter app)
import imprintRouter from './routes/imprintRouter.js';
import consentRouter from './routes/consentRouter.js';
import privacyRouter from './routes/privacyRouter.js';
import accessibilityRouter from './routes/accessibilityRouter.js';

const app = express();
app.use(metricsMiddleware);
app.use(securityHeaders);
app.set('trust proxy', 1);
const port = config.port;
const contextPath = process.env.APP_BASE_PATH || '/';
log.info({ contextPath }, 'Resolved context path');
// Serve static files from the public directory
const publicPath = path.join(process.cwd(), 'app/public');
app.use(express.static(publicPath));

const router = express.Router();

app.set('basepath', contextPath);
router.use((req, res, next) => {
  res.locals.contextPath = contextPath;
  next();
});

// Enable language functions
loadLanguageFiles();
const validLanguageCodes = getLanguageCodes().join('|');

// Use bodyParser for form/JSON bodies
router.use(bodyParser.urlencoded({ extended: true }));
router.use(bodyParser.json()); // Added to parse JSON bodies

router.use(cookieParser());

// CSRF double-submit cookie middleware for form routes.
// Note: /api/v1/* routes use JWT auth (CSRF-resistant) and are mounted on
// `app`, not on this `router`, so they are not affected by this middleware.
// Kept as defense-in-depth for any future state-changing public routes
// (currently the remaining public routes are read-only legal pages).
router.use((req, res, next) => {
  if (
    req.method === 'GET' ||
    req.method === 'HEAD' ||
    req.method === 'OPTIONS'
  ) {
    // Set CSRF token cookie on first visit
    if (!req.cookies._csrf) {
      const token = randomBytes(16).toString('hex');
      res.cookie('_csrf', token, {
        httpOnly: false,
        sameSite: 'strict',
        secure: process.env.NODE_ENV === 'production',
      });
    }
    return next();
  }
  // For state-changing requests, verify double-submit
  const cookieToken = req.cookies._csrf;
  const bodyToken = req.body?._csrf || req.headers['x-csrf-token'];
  if (!cookieToken || !bodyToken || cookieToken !== bodyToken) {
    return res.status(403).send('Invalid CSRF token');
  }
  next();
});

// Middleware for parsing form data in the request body
router.use(jsonBodyParser);

// Middleware for reading/writing of user IDs in cookies
router.use((req, res, next) => {
  let userId = req.cookies.userId;

  if (!userId) {
    userId = randomUUID();
    res.cookie('userId', userId, {
      maxAge: 365 * 24 * 60 * 60 * 1000,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
    });
  }

  req.userId = userId;
  next();
});

// Middleware for serving static files
router.use(staticFileMiddleware);

// Either sets req.lang to the already set route language parameter or gets the preferred browser language. Default value is 'en'.
router.use('/:lng(' + validLanguageCodes + ')?/', (req, res, next) => {
  req.lang = 'en';

  if (req.params.lng) {
    req.lang = req.params.lng;
  } else {
    const lang = req.acceptsLanguages(getLanguageCodes());
    if (lang) {
      req.lang = lang;
    }
  }
  res.locals.currentLanguage = req.lang;
  res.locals.messages = getLanguageMessages(req.lang);
  next();
});

router.use('/:lng(' + validLanguageCodes + ')/imprint', imprintRouter);
router.use('/:lng(' + validLanguageCodes + ')/consent', consentRouter);
router.use('/:lng(' + validLanguageCodes + ')/privacy', privacyRouter);
router.use(
  '/:lng(' + validLanguageCodes + ')/accessibility',
  accessibilityRouter
);

// NOTE: the legacy web experiment app (donate, thanks, demo, about, reward,
// contact) was removed in 2026-06. Habit donation now happens exclusively via
// the authenticated REST API (POST /api/v1/habits/donate). Only the legal
// pages above (imprint, privacy, accessibility) remain — the Flutter app
// fetches and renders them.

// API health/info endpoint
app.get('/api', (req, res) => {
  res.json({ status: 'ok', service: 'Health Habit Hub API', version: '1.0.0' });
});

// Convenience redirect: the Swagger UI is mounted under the versioned router at
// /api/v1/docs, but /api-docs is the conventional path people try first.
app.get('/api-docs', (req, res) => res.redirect(301, '/api/v1/docs'));

// Versioned API routes (JWT-protected)
import createApiRouter from './routes/index.js';
import { createInternalRouter } from './routes/internalRouter.js';
import { createRecommendationWsServer } from './ws/recommendationWs.js';
import { createTokenVerifier } from './middleware/auth.js';
import { startNotificationScheduler } from './services/notificationService.js';
import { makeGetDb } from './utils/getDb.js';
import {
  connect as connectMongo,
  disconnect as disconnectMongo,
  ensureIndexes,
} from './models/survey.js';
import { closeHabitQueue } from './lib/habitQueue.js';
import { closeAllNeo4jDrivers, runNeo4j } from './utils/neo4jDrivers.js';
import { runSeedDefaultProfileFields } from './db/seedProfileFields.js';
import { ensureNeo4jSchema } from './utils/neo4jSchema.js';
import {
  initErrorReporting,
  errorReportingMiddleware,
} from './utils/errorReporting.js';
// enableQueue: true — this is the real app boot, so the BullMQ donation queue
// and worker should run (they connect to Redis). Tests never set this.
app.use('/api/v1', express.json(), createApiRouter({ enableQueue: true }));

// Bull Board — queue dashboard. Served at /queues, NOT under /admin: in
// production Traefik routes PathPrefix(`/admin`) to the Next.js admin panel
// container, so anything mounted here under /admin never reaches this app.
//
// Bull Board ships no auth of its own. In production the only thing in front
// of it is Keycloak SSO (oauth2-proxy forward-auth, admin role) applied to the
// /queues Traefik router — so it must never be mounted without that gate.
// Locally there is no Traefik, which is why the dashboard is open in dev.
const queueBoardEnabled =
  process.env.NODE_ENV !== 'production' ||
  process.env.ENABLE_QUEUE_DASHBOARD === 'true';

if (queueBoardEnabled) {
  const { createBullBoard } = await import('@bull-board/api');
  const { BullMQAdapter } = await import('@bull-board/api/bullMQAdapter');
  const { ExpressAdapter } = await import('@bull-board/express');
  const { getHabitQueue } = await import('./lib/habitQueue.js');

  const boardAdapter = new ExpressAdapter();
  boardAdapter.setBasePath('/queues');
  createBullBoard({
    queues: [new BullMQAdapter(getHabitQueue())],
    serverAdapter: boardAdapter,
  });
  app.use('/queues', boardAdapter.getRouter());
  log.info('Queue dashboard mounted at /queues');
}

// Crash/error reporting (no-op unless SENTRY_DSN is set).
initErrorReporting();

// Ensure Neo4j constraints/indexes for the habit graph (idempotent, non-fatal).
ensureNeo4jSchema();

// Ensure required MongoDB indexes exist (idempotent — no-op if already present).
connectMongo()
  .then((db) => ensureIndexes(db))
  .catch((err) => log.error({ err }, 'Failed to ensure MongoDB indexes'));

// Seed default profile field definitions (gender, age_group) if not already present.
runSeedDefaultProfileFields();

// Start scheduled notification dispatcher (runs every 60 s)
const notificationTask = startNotificationScheduler({
  getDb: makeGetDb(),
  redisUrl: process.env.REDIS_URL,
  // Enables dispatch of scheduled admin campaigns, whose recipients are
  // resolved from Neo4j enrollments.
  neo4jRun: runNeo4j,
});

const httpServer = createServer(app);
const verifyToken = createTokenVerifier();
const { broadcast, close: closeRecommendationWs } =
  createRecommendationWsServer(httpServer, { verifyToken });
// Mounted directly on `app` (not on the CSRF-checking `router` below), and
// before both the catch-all 404 and `router` itself. This is
// service-to-service traffic from the Python API service (WebSocket push
// notifications), authenticated by its own shared-secret check
// (X-Internal-Secret — see internalRouter.js), not browser traffic — so the
// double-submit CSRF cookie check below doesn't apply and shouldn't be
// forced onto it. Previously this was registered *after* `router`, the 404
// catch-all, and the error handler, which made /api/internal/* completely
// unreachable: every request was intercepted by the CSRF check (403) or the
// 404 handler (both mounted first).
app.use('/api/internal', express.json(), createInternalRouter({ broadcast }));

app.use(contextPath, router);

// Catch-all route for unmatched routes
app.use((req, res) => {
  res.status(404).send('404 - Not Found');
});

// Central error handler — logs, reports to Sentry (if configured), returns 500.
app.use(errorReportingMiddleware());

if (!process.env.API_SERVICE_SECRET) {
  log.warn(
    'API_SERVICE_SECRET is not set — Python API service is unauthenticated'
  );
}

httpServer.listen(port, () => {
  log.info('Server is running on http://app.localhost');
});

// Internal-only metrics server — not exposed via Traefik.
// Prometheus scrapes http://app:9091/metrics from the Docker network.
const metricsApp = express();
metricsApp.get('/metrics', async (_req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});
const metricsPort = process.env.METRICS_PORT ?? 9091;
const metricsServer = createServer(metricsApp).listen(metricsPort, () => {
  log.info({ metricsPort }, 'Metrics server is running');
});

// Graceful shutdown — stop accepting new connections, let in-flight requests
// drain, then close outbound connections (Mongo, Redis/BullMQ, WS) before
// exiting. Without this, a rolling deploy's SIGTERM hard-kills the process
// mid-request and leaves connection-pool sockets dangling.
let shuttingDown = false;
async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  log.info({ signal }, 'Shutting down gracefully');

  const forceExitTimer = setTimeout(() => {
    log.error('Graceful shutdown timed out — forcing exit');
    process.exit(1);
  }, 10_000);
  forceExitTimer.unref();

  try {
    notificationTask?.stop();
    closeRecommendationWs?.();
    await Promise.all([
      new Promise((resolve) => httpServer.close(resolve)),
      new Promise((resolve) => metricsServer.close(resolve)),
      closeHabitQueue(),
      closeAllNeo4jDrivers(),
      disconnectMongo(),
    ]);
    log.info('Shutdown complete');
    clearTimeout(forceExitTimer);
    process.exit(0);
  } catch (err) {
    log.error({ err }, 'Error during graceful shutdown');
    clearTimeout(forceExitTimer);
    process.exit(1);
  }
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
