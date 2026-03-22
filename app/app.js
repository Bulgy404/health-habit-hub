import { createServer } from 'node:http';
import bodyParser from 'body-parser';
import express from 'express';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import cookieParser from 'cookie-parser';

import { jsonBodyParser } from './middleware/requestParser.js';
import { staticFileMiddleware } from './middleware/staticFileMiddleware.js';
import { config } from './utils/config.js';
import {
  getLanguageCodes,
  getLanguageMessages,
  loadLanguageFiles,
} from './utils/localization.js';

// Express config
import aboutRouter from './routes/aboutRouter.js';
import demoRouter from './routes/demoRouter.js';
import donateRouter from './routes/donateRouter.js';
import thanksRouter from './routes/thanksRouter.js';
import contactRouter from './routes/contactRouter.js';
import rewardRouter from './routes/rewardRouter.js';
import imprintRouter from './routes/imprintRouter.js';
import privacyRouter from './routes/privacyRouter.js';
import accessibilityRouter from './routes/accessibilityRouter.js';

const app = express();
app.set('trust proxy', 1);
const port = config.port;
const contextPath = process.env.APP_BASE_PATH || '/';
console.log('ContextPath: ', contextPath);
// Serve static files from the public directory
const publicPath = path.join(process.cwd(), 'app/public');
app.use(express.static(publicPath));

// Serve survey js core and ui files
const vendorSurveyCoreLangMount = path.join(
  contextPath,
  ':lng',
  'vendor',
  'survey-core'
);
const vendorSurveyJsUiLangMount = path.join(
  contextPath,
  ':lng',
  'vendor',
  'survey-js-ui'
);

app.use(
  vendorSurveyCoreLangMount,
  express.static(path.join(process.cwd(), 'node_modules/survey-core'))
);
app.use(
  vendorSurveyJsUiLangMount,
  express.static(path.join(process.cwd(), 'node_modules/survey-js-ui'))
);

const router = express.Router();

app.set('basepath', contextPath);
router.use((req, res, next) => {
  res.locals.contextPath = contextPath;
  next();
});

// Enable language functions
loadLanguageFiles();
const validLanguageCodes = getLanguageCodes().join('|');

// Use bodyParser and express-recaptcha module
router.use(bodyParser.urlencoded({ extended: true }));
router.use(bodyParser.json()); // Added to parse JSON bodies

router.use(cookieParser());

// Middleware for parsing form data in the request body
router.use(jsonBodyParser);

// Middleware for reading/writing of user IDs in cookies
router.use((req, res, next) => {
  let userId = req.cookies.userId;

  if (!userId) {
    userId = uuidv4();
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

import { requireAgeConsent } from './middleware/ageGateMiddleware.js';
import disclaimerRouter from './routes/disclaimerRouter.js';

// Public routes (no age check)
router.use('/:lng(' + validLanguageCodes + ')/disclaimer', disclaimerRouter);
router.use('/:lng(' + validLanguageCodes + ')/imprint', imprintRouter);
router.use('/:lng(' + validLanguageCodes + ')/privacy', privacyRouter);
router.use(
  '/:lng(' + validLanguageCodes + ')/accessibility',
  accessibilityRouter
);

// Routes
// Redirects all requests to '/donate' if the language parameter (lng) is already set
router.get('/:lng(' + validLanguageCodes + ')?/', (req, res) => {
  const targetPath = path.join(contextPath, req.lang, 'donate');
  res.redirect(301, targetPath);
});

// Enforce age confirmation for all other routes
router.use(requireAgeConsent);

router.use('/:lng(' + validLanguageCodes + ')/reward', rewardRouter);
router.use('/:lng(' + validLanguageCodes + ')/contact', contactRouter);
router.use('/:lng(' + validLanguageCodes + ')/donate', donateRouter);
router.use('/:lng(' + validLanguageCodes + ')/about', aboutRouter);
router.use('/:lng(' + validLanguageCodes + ')/demo', demoRouter); //Probably needs to be changed like the ones on the top
router.use('/:lng(' + validLanguageCodes + ')/thanks', thanksRouter);
router.use('/:lng(' + validLanguageCodes + ')/imprint', imprintRouter);
router.use('/:lng(' + validLanguageCodes + ')/privacy', privacyRouter);
router.use(
  '/:lng(' + validLanguageCodes + ')/accessibility',
  accessibilityRouter
);
// Intercepts all calls of '/' and checks whether a language (req.lang) is already set. If not, this parameter is set.
router.use((req, res, next) => {
  if (req.url.startsWith('/' + req.lang + '/')) {
    next();
  } else {
    res.redirect(307, path.join(contextPath, req.lang, req.url));
  }
});

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
app.use('/api/v1', createV1Router());

// Start scheduled notification dispatcher (runs every 60 s)
startNotificationScheduler({ getDb: makeGetDb() });

app.use(cookieParser());
app.use(contextPath, router);

// Catch-all route for unmatched routes
app.use((req, res) => {
  res.status(404).send('404 - Not Found');
});

const httpServer = createServer(app);
const verifyToken = createTokenVerifier();
const { broadcast } = createRecommendationWsServer(httpServer, { verifyToken });
app.use('/api/internal', express.json(), createInternalRouter({ broadcast }));

httpServer.listen(port, () => {
  console.log(`Server is running on http://app.localhost`);
});
