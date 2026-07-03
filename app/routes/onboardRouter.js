import express from 'express';
import { randomUUID, randomBytes } from 'node:crypto';
import { rateLimit, ipKeyGenerator } from 'express-rate-limit';
import { createKeycloakAdminClient } from '../services/keycloakAdminClient.js';
import { ROLES } from '../middleware/auth.js';
import { makeGetDb } from '../utils/getDb.js';
import {
  recoveryPhraseFromCredentials,
  recoveryPhrasesEnabled,
} from '../utils/recoveryPhrase.js';
import { logger } from '../utils/logger.js';

const log = logger.child({ module: 'onboardRouter' });

const onboardRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator(req) {
    return ipKeyGenerator(req);
  },
  handler(_req, res) {
    res
      .status(429)
      .json({ error: 'Too many requests, please try again later.' });
  },
});

export function createOnboardRouter({ keycloak, db } = {}) {
  const router = express.Router();
  const getDb = makeGetDb(db);

  // Resolve Keycloak config once (from injected client or env)
  const base = process.env.KEYCLOAK_URL || 'http://keycloak:8080';
  const realm = process.env.KEYCLOAK_REALM || 'hhh';
  const clientId = process.env.KEYCLOAK_CLIENT_ID || 'hhh-flutter';

  // Use injected keycloak client (must have getAdminToken()) in tests,
  // or the shared admin client in production.
  const kcAdmin =
    keycloak && typeof keycloak.getAdminToken === 'function'
      ? keycloak
      : createKeycloakAdminClient();

  router.post('/', onboardRateLimiter, async (req, res) => {
    const userId = randomUUID();
    const username = randomUUID();
    // 16 bytes (32 hex chars). MUST stay 16 bytes: the 24-word recovery phrase
    // encodes 12 words for the username UUID and 12 words for the password,
    // and 12 words hold exactly 16 bytes. A longer password would be truncated
    // by the phrase, breaking account restore on a new device.
    const password = randomBytes(16).toString('hex');

    try {
      // Keycloak assigns realm roles via a separate admin API call.
      const keycloakUserId = await kcAdmin.createUser({
        userId,
        username,
        password,
      });
      await kcAdmin.assignRole(keycloakUserId || userId, ROLES.USER);

      // Step 2: direct-grant token exchange
      const tokenRes = await fetch(
        `${base}/realms/${realm}/protocol/openid-connect/token`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            grant_type: 'password',
            client_id: clientId,
            username,
            password,
            scope: 'openid profile email',
          }),
        }
      );

      if (!tokenRes.ok) {
        return res
          .status(502)
          .json({ error: 'Failed to obtain token after account creation.' });
      }

      const tokenData = await tokenRes.json();

      // Persist a participant record so self-onboarded users appear in the
      // admin portal, along with the derived recovery phrase (the same 24
      // words the app shows the user) for verification/support. Best-effort:
      // account creation must still succeed if the DB write fails.
      try {
        const database = await getDb();
        await database.collection('participants').updateOne(
          { userId },
          {
            $setOnInsert: {
              userId,
              username,
              group: null,
              enrolledAt: new Date(),
              surveyCompletionPct: 0,
              source: 'self-onboarded',
              // Only persist the phrase when explicitly enabled — it's an
              // account secret. Off in production.
              recoveryPhrase: recoveryPhrasesEnabled()
                ? recoveryPhraseFromCredentials(username, password)
                : null,
            },
          },
          { upsert: true }
        );
      } catch (dbErr) {
        log.warn(
          { err: dbErr?.message },
          'onboard: failed to persist participant record',
        );
      }

      return res.status(201).json({
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        expires_in: tokenData.expires_in,
        username,
        password,
      });
    } catch (err) {
      log.error({ err: err }, 'unhandled route error');
      if (String(err?.message || '').includes('Keycloak create user failed')) {
        return res
          .status(502)
          .json({ error: 'Failed to create account. Please try again.' });
      }
      return res
        .status(502)
        .json({ error: 'Keycloak is unreachable. Please try again later.' });
    }
  });

  return router;
}

export default createOnboardRouter;
