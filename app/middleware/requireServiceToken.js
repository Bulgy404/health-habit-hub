import { timingSafeEqual } from 'node:crypto';

/**
 * Middleware guarding internal service-to-service routes authenticated via
 * the X-Service-Auth-Token header (used instead of a Keycloak JWT — see
 * questionnaireResponsesRouter.js / userProfileRouter.js). Compares the
 * token in constant time to avoid a timing side-channel against
 * API_SERVICE_SECRET.
 * @returns {import('express').RequestHandler} Middleware that responds 401 if the token is missing or wrong.
 */
export function requireServiceToken() {
  return (req, res, next) => {
    const token = req.headers['x-service-auth-token'];
    const expected = process.env.API_SERVICE_SECRET;
    if (
      typeof token !== 'string' ||
      !expected ||
      token.length !== expected.length ||
      !timingSafeEqual(Buffer.from(token), Buffer.from(expected))
    ) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    next();
  };
}
