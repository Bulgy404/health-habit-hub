import { createPublicKey, createVerify } from 'node:crypto';

// JWKS keys are refreshed every 24 hours (TTL) or on verification failure
const JWKS_TTL_MS = 24 * 60 * 60 * 1000;

function base64urlDecode(str) {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) str += '=';
  return Buffer.from(str, 'base64');
}

function parseJwt(token) {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('Invalid JWT format');
  const header = JSON.parse(base64urlDecode(parts[0]).toString('utf8'));
  const payload = JSON.parse(base64urlDecode(parts[1]).toString('utf8'));
  return {
    header,
    payload,
    signature: parts[2],
    signingInput: `${parts[0]}.${parts[1]}`,
  };
}

function verifyJwtSignature(signingInput, signature, jwk) {
  const publicKey = createPublicKey({ key: jwk, format: 'jwk' });
  const verify = createVerify('RSA-SHA256');
  verify.update(signingInput);
  return verify.verify(publicKey, base64urlDecode(signature));
}

/**
 * Create a JWT verifier that fetches and caches JWKS keys with a 24-hour TTL.
 * @param {{ jwksUrl?: string }} [opts]
 * @returns {function(string): Promise<object>} Async function that verifies a JWT and returns its payload.
 * @throws {Error} If the token is expired, the signing key is not found, or the signature is invalid.
 */
export function createTokenVerifier({ jwksUrl } = {}) {
  const url = jwksUrl || process.env.KEYCLOAK_JWKS_URL;
  let cachedKeys = null;
  let lastFetchedAt = 0;

  async function fetchJwks() {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to fetch JWKS: ${res.status}`);
    const { keys } = await res.json();
    cachedKeys = keys;
    lastFetchedAt = Date.now();
    return keys;
  }

  async function getKeys(forceRefresh = false) {
    const expired = Date.now() - lastFetchedAt > JWKS_TTL_MS;
    if (!cachedKeys || expired || forceRefresh) return fetchJwks();
    return cachedKeys;
  }

  return async function verifyToken(token) {
    const { header, payload, signature, signingInput } = parseJwt(token);
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < now) throw new Error('Token expired');
    let keys = await getKeys();
    let key = keys.find(
      (k) => k.kid === header.kid || (!header.kid && k.use === 'sig')
    );
    // On key-not-found, try a fresh JWKS fetch (Keycloak may have rotated keys)
    if (!key) {
      keys = await getKeys(true);
      key = keys.find(
        (k) => k.kid === header.kid || (!header.kid && k.use === 'sig')
      );
    }
    if (!key) throw new Error('Key not found');
    const valid = verifyJwtSignature(signingInput, signature, key);
    if (!valid) throw new Error('Invalid signature');
    return payload;
  };
}

/**
 * Create an Express middleware that validates Bearer JWTs against Keycloak JWKS.
 * Attaches the decoded payload to req.user on success; responds 401 on failure.
 * @param {{ jwksUrl?: string, expectedIssuer?: string|string[], expectedAudience?: string|string[] }} [opts]
 * @returns {import('express').RequestHandler}
 */
export function createAuthMiddleware({
  jwksUrl,
  expectedIssuer,
  expectedAudience,
} = {}) {
  const issuer =
    expectedIssuer === undefined
      ? process.env.KEYCLOAK_JWT_ISSUER || null
      : expectedIssuer;
  const audience =
    expectedAudience === undefined
      ? process.env.KEYCLOAK_JWT_AUDIENCE || null
      : expectedAudience;
  const issuers = Array.isArray(issuer)
    ? issuer.filter(Boolean)
    : typeof issuer === 'string'
      ? issuer
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      : [];
  const audiences = Array.isArray(audience)
    ? audience.filter(Boolean)
    : typeof audience === 'string'
      ? audience
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      : [];

  // Reuse createTokenVerifier for all JWKS caching and signature verification.
  // JWKS keys are fetched lazily on the first request.
  const verifyToken = createTokenVerifier({ jwksUrl });

  async function authMiddleware(req, res, next) {
    const authHeader = req.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const token = authHeader.slice(7);
    try {
      const payload = await verifyToken(token);

      // Validate issuer if configured
      if (issuers.length > 0 && !issuers.includes(payload.iss)) {
        if (process.env.NODE_ENV !== 'production') {
          console.warn(
            `[auth] issuer mismatch: got="${payload.iss}" expected one of=${JSON.stringify(issuers)}`
          );
        }
        return res.status(401).json({ error: 'Unauthorized' });
      }

      // Validate audience if configured
      if (audiences.length > 0) {
        const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
        const matches = audiences.some((allowed) => aud.includes(allowed));
        if (!matches) {
          if (process.env.NODE_ENV !== 'production') {
            console.warn(
              `[auth] audience mismatch: got=${JSON.stringify(aud)} expected one of=${JSON.stringify(audiences)}`
            );
          }
          return res.status(401).json({ error: 'Unauthorized' });
        }
      }

      // Require a non-empty `sub` claim. Keycloak always provides it; a
      // token without `sub` is malformed or from an untrusted source.
      // Falling back to attacker-controllable fields like preferred_username
      // or email would allow impersonation, so we fail closed instead.
      if (!payload.sub || typeof payload.sub !== 'string') {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      req.user = payload;
      next();
    } catch (err) {
      if (process.env.NODE_ENV !== 'production') {
        const message = err instanceof Error ? err.message : String(err);
        console.warn(`[auth] token verification failed: ${message}`);
      }
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  return authMiddleware;
}

export { requireRole } from './requireRole.js';
export { ROLES, isPrivileged } from './roles.js';
