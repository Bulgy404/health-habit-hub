import cookieParser from 'cookie-parser';
import express from 'express';
import { RecaptchaV2 as Recaptcha } from 'express-recaptcha'; // Import the express-recaptcha module
import { randomUUID } from 'node:crypto';
import {
  saveDonateData,
  showDonateForm,
} from '../controllers/donateController.js';
import { config } from '../utils/config.js';

const router = express.Router();

// Required for remembering the experiment setting during a browser session
// and for the user ID. It must come before any middleware that uses cookies.
router.use(cookieParser());

// Middleware to ensure a user ID exists for the session.
// This runs for all routes in this router.
router.use((req, res, next) => {
  let userId = req.cookies.userId;
  if (!userId) {
    userId = randomUUID();
    // Set a cookie that expires in a year. httpOnly for security.
    res.cookie('userId', userId, {
      maxAge: 365 * 24 * 60 * 60 * 1000,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
    });
  }
  // Make userId available on the request object for subsequent handlers
  req.userId = userId;
  next();
});

const recaptcha = new Recaptcha(
  config.recaptcha.siteKey,
  config.recaptcha.secretKey,
  {
    useRecaptchaDomain: config.recaptcha.useRecaptchaDomain,
  }
);
// Add reCAPTCHA display to the context
router.use(recaptcha.middleware.render, (req, res, next) => {
  res.locals.recaptcha = res.recaptcha;
  next();
});

router.get('/', showDonateForm);

// The controller function `saveDonateData` will now have access to `req.userId`
// thanks to the middleware above. The previous attempt to pass it as a third
// argument was incorrect as the function only accepts (req, res).
router.post(
  '/data',
  recaptcha.middleware.verify,
  (req, res, next) => {
    if (!req.recaptcha.error) {
      next();
    } else {
      console.warn(
        '[donateRouter] reCAPTCHA verification failed:',
        req.recaptcha.error
      );
      res.status(400).json({
        error: 'Captcha verification failed. Please try again.',
        details: req.recaptcha.error,
      });
    }
  },
  saveDonateData
);

export default router;
