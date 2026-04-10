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
      if (issuer && payload.iss !== issuer) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      // Validate audience if configured
      if (audience) {
        const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
        if (!aud.includes(audience)) {
          return res.status(401).json({ error: 'Unauthorized' });
        }
      }

      req.user = payload;
      next();
    } catch {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  return authMiddleware;
}
