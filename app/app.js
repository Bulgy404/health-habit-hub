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
import {
  getLanguageCodes,
  getLanguageMessages,
  loadLanguageFiles,
} from './utils/localization.js';

// Express config — public legal pages (rendered by the Flutter app)
import imprintRouter from './routes/imprintRouter.js';
import privacyRouter from './routes/privacyRouter.js';
import accessibilityRouter from './routes/accessibilityRouter.js';

const app = express();
app.use(metricsMiddleware);
app.use(securityHeaders);
app.set('trust proxy', 1);
const port = config.port;
const contextPath = process.env.APP_BASE_PATH || '/';
console.log('ContextPath: ', contextPath);
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

// Versioned API routes (JWT-protected)
import createV1Router from './routes/index.js';
import { createInternalRouter } from './routes/internalRouter.js';
import { createRecommendationWsServer } from './ws/recommendationWs.js';
import { createTokenVerifier } from './middleware/auth.js';
import { startNotificationScheduler } from './services/notificationService.js';
import { makeGetDb } from './utils/getDb.js';
import { connect as connectMongo, ensureIndexes } from './models/survey.js';
app.use('/api/v1', express.json(), createV1Router());

// Ensure required MongoDB indexes exist (idempotent — no-op if already present).
connectMongo()
  .then((db) => ensureIndexes(db))
  .catch((err) =>
    console.error('[startup] Failed to ensure MongoDB indexes:', err)
  );

// Start scheduled notification dispatcher (runs every 60 s)
startNotificationScheduler({
  getDb: makeGetDb(),
  redisUrl: process.env.REDIS_URL,
});

app.use(contextPath, router);

// Catch-all route for unmatched routes
app.use((req, res) => {
  res.status(404).send('404 - Not Found');
});

const httpServer = createServer(app);
const verifyToken = createTokenVerifier();
const { broadcast } = createRecommendationWsServer(httpServer, { verifyToken });
app.use('/api/internal', express.json(), createInternalRouter({ broadcast }));

if (!process.env.API_SERVICE_SECRET) {
  console.warn(
    '[startup] API_SERVICE_SECRET is not set — Python API service is unauthenticated'
  );
}

httpServer.listen(port, () => {
  console.log(`Server is running on http://app.localhost`);
});

// Internal-only metrics server — not exposed via Traefik.
// Prometheus scrapes http://app:9091/metrics from the Docker network.
const metricsApp = express();
metricsApp.get('/metrics', async (_req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});
const metricsPort = process.env.METRICS_PORT ?? 9091;
createServer(metricsApp).listen(metricsPort, () => {
  console.log(`Metrics server is running on port ${metricsPort}`);
});
