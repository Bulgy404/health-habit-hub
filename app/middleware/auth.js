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

      // Some local/dev token flows may omit `sub` but still carry a stable
      // user identifier in `preferred_username`. Normalize here so downstream
      // routes can reliably use req.user.sub.
      if (
        (payload.sub == null || payload.sub === '') &&
        typeof payload.preferred_username === 'string' &&
        payload.preferred_username.trim()
      ) {
        payload.sub = payload.preferred_username.trim();
      } else if (
        (payload.sub == null || payload.sub === '') &&
        typeof payload.email === 'string' &&
        payload.email.trim()
      ) {
        payload.sub = payload.email.trim();
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
