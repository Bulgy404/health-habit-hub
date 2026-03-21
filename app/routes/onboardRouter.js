import express from 'express';
import { randomUUID, randomBytes } from 'node:crypto';
import { rateLimit, ipKeyGenerator } from 'express-rate-limit';

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

  async function getAdminToken(kc) {
    if (kc && typeof kc.getAdminToken === 'function') {
      return kc.getAdminToken();
    }
    const adminClientId = process.env.KEYCLOAK_ADMIN_CLIENT_ID || 'hhh-backend';
    const adminClientSecret = process.env.KEYCLOAK_ADMIN_CLIENT_SECRET || '';
    const res = await fetch(
      `${base}/realms/${realm}/protocol/openid-connect/token`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'client_credentials',
          client_id: adminClientId,
          client_secret: adminClientSecret,
        }),
      }
    );
    if (!res.ok)
      throw new Error(`Keycloak admin token fetch failed: ${res.status}`);
    const data = await res.json();
    return data.access_token;
  }

  router.post('/', onboardRateLimiter, async (req, res) => {
    const username = randomUUID();
    const password = randomBytes(32).toString('hex');

    try {
      // Step 1: get admin token and create user
      const adminToken = await getAdminToken(keycloak);

      const createRes = await fetch(`${base}/admin/realms/${realm}/users`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          username,
          enabled: true,
          credentials: [
            { type: 'password', value: password, temporary: false },
          ],
          realmRoles: ['participant'],
        }),
      });

      if (!createRes.ok) {
        return res
          .status(502)
          .json({ error: 'Failed to create account. Please try again.' });
      }

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
      return res
        .status(502)
        .json({ error: 'Keycloak is unreachable. Please try again later.' });
    }
  });

  return router;
}

export default createOnboardRouter;
