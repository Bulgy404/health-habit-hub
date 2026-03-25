import express from 'express';
import { randomUUID, randomBytes } from 'node:crypto';
import { rateLimit, ipKeyGenerator } from 'express-rate-limit';
import { createKeycloakAdminClient } from '../services/keycloakAdminClient.js';

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

export function createOnboardRouter({ keycloak } = {}) {
  const router = express.Router();

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
    const password = randomBytes(32).toString('hex');

    try {
      // Keycloak assigns realm roles via a separate admin API call.
      const keycloakUserId = await kcAdmin.createUser({
        userId,
        username,
        password,
      });
      await kcAdmin.assignRole(keycloakUserId || userId, 'participant');

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
          }),
        }
      );

      if (!tokenRes.ok) {
        return res
          .status(502)
          .json({ error: 'Failed to obtain token after account creation.' });
      }

      const tokenData = await tokenRes.json();
      return res.status(201).json({
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        expires_in: tokenData.expires_in,
        username,
        password,
      });
    } catch (err) {
      console.error('[route] Error:', err);
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
