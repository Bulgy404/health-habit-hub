import express from 'express';
import { rateLimit, ipKeyGenerator } from 'express-rate-limit';
import {
  refreshTokenForUser,
  revokeRefreshTokenForUser,
} from '../services/keycloakRopcClient.js';
import { logger } from '../utils/logger.js';

const log = logger.child({ module: 'authRouter' });

export function createAuthRouter() {
  const router = express.Router();

  // Legitimate clients refresh at most once per access-token lifespan
  // (minutes apart), so this budget is far above normal use even for several
  // devices behind one NAT — it only trips on scripted brute-forcing of the
  // endpoint. Deliberately looser than onboard/restore: possession of a valid
  // refresh token is already proof of an authenticated session, so this route
  // is not credential-guessing surface the way those are.
  const refreshRateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 60,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator(req) {
      return ipKeyGenerator(req.ip);
    },
  });

  /**
   * @openapi
   * /auth/refresh:
   *   post:
   *     summary: Refresh a token pair minted via the backend's hhh-ropc client
   *     description: >
   *       Exchanges a refresh token issued to the confidential hhh-ropc client
   *       (onboarding, restore, credential rotation) for a fresh token pair.
   *       Keycloak rejects refresh tokens presented by a different client than
   *       the one that issued them, so the mobile app cannot refresh these
   *       directly — it must come through this endpoint, which holds the
   *       client secret.
   *     tags: [Auth]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [refresh_token]
   *             properties:
   *               refresh_token:
   *                 type: string
   *     responses:
   *       200:
   *         description: Fresh token pair.
   *       400:
   *         description: Missing refresh_token.
   *       401:
   *         description: Keycloak rejected the refresh token.
   *       502:
   *         description: Keycloak unreachable.
   */
  router.post('/refresh', refreshRateLimiter, async (req, res) => {
    const refreshToken = req.body?.refresh_token;
    if (typeof refreshToken !== 'string' || refreshToken.length === 0) {
      return res.status(400).json({ error: 'refresh_token is required.' });
    }

    try {
      const result = await refreshTokenForUser({ refreshToken });
      if (!result.ok) {
        // 400/401 from Keycloak means the token is expired/revoked/foreign —
        // normalise to 401 so the app's "token rejected" detection fires,
        // and never echo Keycloak's body (it distinguishes rejection reasons).
        log.info({ status: result.status }, 'auth: refresh rejected');
        return res.status(401).json({ error: 'Invalid refresh token.' });
      }
      const { access_token, refresh_token, expires_in } = result.data;
      return res.status(200).json({ access_token, refresh_token, expires_in });
    } catch (err) {
      log.error({ err }, 'auth: unhandled refresh error');
      return res
        .status(502)
        .json({ error: 'Keycloak is unreachable. Please try again later.' });
    }
  });

  /**
   * @openapi
   * /auth/revoke:
   *   post:
   *     summary: Revoke a refresh token minted via the backend's hhh-ropc client
   *     description: >
   *       RFC 7009 revocation for refresh tokens issued to the confidential
   *       hhh-ropc client. Keycloak ignores revocation requests from a
   *       different client than the token's issuer, so the mobile app routes
   *       sign-out revocation of ROPC-minted tokens through this endpoint.
   *       Always returns 200 for a well-formed request — per RFC 7009 a
   *       revocation of an already-invalid token is a success.
   *     tags: [Auth]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [refresh_token]
   *             properties:
   *               refresh_token:
   *                 type: string
   *     responses:
   *       200:
   *         description: Token revoked (or was already invalid).
   *       400:
   *         description: Missing refresh_token.
   *       502:
   *         description: Keycloak unreachable.
   */
  router.post('/revoke', refreshRateLimiter, async (req, res) => {
    const refreshToken = req.body?.refresh_token;
    if (typeof refreshToken !== 'string' || refreshToken.length === 0) {
      return res.status(400).json({ error: 'refresh_token is required.' });
    }

    try {
      const result = await revokeRefreshTokenForUser({ refreshToken });
      if (!result.ok) {
        log.info({ status: result.status }, 'auth: revoke rejected');
      }
      // RFC 7009: revoking an invalid/expired token is still a success from
      // the client's point of view — the session it named is not alive.
      return res.status(200).json({ ok: true });
    } catch (err) {
      log.error({ err }, 'auth: unhandled revoke error');
      return res
        .status(502)
        .json({ error: 'Keycloak is unreachable. Please try again later.' });
    }
  });

  return router;
}

export default createAuthRouter;
