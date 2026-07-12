import express from 'express';
import { rateLimit, ipKeyGenerator } from 'express-rate-limit';
import { mintTokenForUser } from '../services/keycloakRopcClient.js';
import { credentialsFromRecoveryPhrase } from '../utils/recoveryPhrase.js';
import { makeGetDb } from '../utils/getDb.js';
import { COLLECTION as RESTORE_ATTEMPTS } from '../models/restoreAttempt.js';
import { logger } from '../utils/logger.js';

const log = logger.child({ module: 'restoreRouter' });

const GENERIC_ERROR = { error: 'Invalid passphrase or account not found.' };

export function createRestoreRouter({ db } = {}) {
  const router = express.Router();
  const getDb = makeGetDb(db);

  // Best-effort record of every attempt's outcome, for the admin panel's
  // restore-attempts security view — never blocks or fails the response.
  async function recordAttempt({ ip, usernameAttempted = null, outcome }) {
    try {
      const database = await getDb();
      await database.collection(RESTORE_ATTEMPTS).insertOne({
        ip,
        usernameAttempted,
        outcome,
        createdAt: new Date(),
      });
    } catch (err) {
      log.warn({ err: err?.message }, 'restore: failed to record attempt');
    }
  }

  // Recovery phrases are pure re-encodings of a random (UUID, 16-byte) pair —
  // no KDF, no server-side secret slows down a guess. Keycloak's own
  // brute-force protection is per-username (i.e. only kicks in once an
  // attacker has already guessed a real UUID), so this endpoint's own per-IP
  // limit is the only defense against enumerating the username space. Matches
  // onboardRateLimiter's budget (also a pre-auth, credential-adjacent route).
  const restoreRateLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator(req) {
      return ipKeyGenerator(req);
    },
    handler(req, res) {
      recordAttempt({ ip: ipKeyGenerator(req), outcome: 'rate_limited' });
      res
        .status(429)
        .json({ error: 'Too many requests, please try again later.' });
    },
  });

  router.post('/', restoreRateLimiter, async (req, res) => {
    const ip = ipKeyGenerator(req);
    const phrase = req.body?.phrase;
    const credentials = credentialsFromRecoveryPhrase(phrase);
    if (!credentials) {
      recordAttempt({ ip, outcome: 'invalid_phrase' });
      return res.status(400).json(GENERIC_ERROR);
    }

    const { username, password } = credentials;

    try {
      const tokenResult = await mintTokenForUser({ username, password });

      if (!tokenResult.ok) {
        // Keycloak returns 401 for a wrong/unknown username+password (the
        // expected case for a mistyped or bogus phrase) — log at info, not
        // error, and never echo Keycloak's own response body back to the
        // client since it can distinguish "invalid_grant" reasons.
        log.info(
          { status: tokenResult.status },
          'restore: token exchange rejected'
        );
        recordAttempt({
          ip,
          usernameAttempted: username,
          outcome: 'invalid_credentials',
        });
        return res.status(401).json(GENERIC_ERROR);
      }

      const { access_token, refresh_token, expires_in } = tokenResult.data;
      log.info({ username }, 'restore: account restored on new device');
      recordAttempt({ ip, usernameAttempted: username, outcome: 'success' });
      return res.status(200).json({
        username,
        access_token,
        refresh_token,
        expires_in,
      });
    } catch (err) {
      log.error({ err }, 'restore: unhandled route error');
      recordAttempt({
        ip,
        usernameAttempted: username,
        outcome: 'keycloak_unreachable',
      });
      return res
        .status(502)
        .json({ error: 'Keycloak is unreachable. Please try again later.' });
    }
  });

  return router;
}

export default createRestoreRouter;
