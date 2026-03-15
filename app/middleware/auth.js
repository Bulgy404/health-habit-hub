import { createPublicKey, createVerify } from 'node:crypto';

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

  async function fetchJwks() {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to fetch JWKS: ${res.status}`);
    const { keys } = await res.json();
    cachedKeys = keys;
    return keys;
  }

  return async function verifyToken(token) {
    const { header, payload, signature, signingInput } = parseJwt(token);
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < now) throw new Error('Token expired');
    const keys = cachedKeys || (await fetchJwks());
    const key = keys.find(
      (k) => k.kid === header.kid || (!header.kid && k.use === 'sig')
    );
    if (!key) throw new Error('Key not found');
    const valid = verifyJwtSignature(signingInput, signature, key);
    if (!valid) throw new Error('Invalid signature');
    return payload;
  };
}

export function createAuthMiddleware({ jwksUrl } = {}) {
  const url = jwksUrl || process.env.KEYCLOAK_JWKS_URL;
  let cachedKeys = null;

  async function fetchJwks() {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to fetch JWKS: ${res.status}`);
    const { keys } = await res.json();
    cachedKeys = keys;
    return keys;
  }

  const ready = fetchJwks().catch((err) =>
    console.warn('JWKS prefetch failed:', err.message)
  );

  async function authMiddleware(req, res, next) {
    const authHeader = req.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const token = authHeader.slice(7);
    try {
      const { header, payload, signature, signingInput } = parseJwt(token);
      const keys = cachedKeys || (await fetchJwks());
      const key = keys.find(
        (k) => k.kid === header.kid || (!header.kid && k.use === 'sig')
      );
      if (!key) return res.status(401).json({ error: 'Unauthorized' });

      const valid = verifyJwtSignature(signingInput, signature, key);
      if (!valid) return res.status(401).json({ error: 'Unauthorized' });

      const now = Math.floor(Date.now() / 1000);
      if (payload.exp && payload.exp < now) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      req.user = payload;
      next();
    } catch {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  authMiddleware.ready = ready;
  return authMiddleware;
}
