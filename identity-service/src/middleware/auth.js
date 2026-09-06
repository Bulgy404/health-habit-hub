/**
 * Keycloak JWT verification.
 *
 * Mirrors app/middleware/auth.js so there is one idiom across the platform:
 * fetch JWKS, cache it, verify RS256 manually, re-fetch once on an unknown
 * key id (rotation), and FAIL CLOSED on anything unexpected.
 *
 * The issuer is an allow-LIST rather than a single value from day one. If the
 * register is ever relocated to university hosting, tokens may come from a
 * different Keycloak, and retrofitting that is harder than allowing for it now.
 */

import { createVerify, createPublicKey } from 'node:crypto';

const JWKS_TTL_MS = 24 * 60 * 60 * 1000;

function b64urlToBuffer(s) {
  return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

function decodeSegment(seg) {
  return JSON.parse(b64urlToBuffer(seg).toString('utf8'));
}

export function createAuthMiddleware(config) {
  let jwks = null;
  let fetchedAt = 0;

  async function loadJwks(force = false) {
    if (!force && jwks && Date.now() - fetchedAt < JWKS_TTL_MS) return jwks;
    const res = await fetch(config.keycloak.jwksUrl);
    if (!res.ok) throw new Error(`JWKS fetch failed: ${res.status}`);
    const body = await res.json();
    jwks = body.keys ?? [];
    fetchedAt = Date.now();
    return jwks;
  }

  function keyFor(keys, kid) {
    const jwk = keys.find(
      (k) => k.kid === kid && (k.alg ?? 'RS256') === 'RS256'
    );
    return jwk ? createPublicKey({ key: jwk, format: 'jwk' }) : null;
  }

  return async function authenticate(req, res, next) {
    try {
      const header = req.get('Authorization') ?? '';
      if (!header.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'missing_token' });
      }
      const token = header.slice(7).trim();
      const [h, p, s] = token.split('.');
      if (!h || !p || !s)
        return res.status(401).json({ error: 'malformed_token' });

      const head = decodeSegment(h);
      if (head.alg !== 'RS256') {
        return res.status(401).json({ error: 'unsupported_algorithm' });
      }
      let key = keyFor(await loadJwks(), head.kid);
      // One forced refresh covers key rotation without hammering Keycloak.
      if (!key) key = keyFor(await loadJwks(true), head.kid);
      if (!key) return res.status(401).json({ error: 'unknown_key' });

      const verifier = createVerify('RSA-SHA256');
      verifier.update(`${h}.${p}`);
      verifier.end();
      if (!verifier.verify(key, b64urlToBuffer(s))) {
        return res.status(401).json({ error: 'bad_signature' });
      }

      const claims = decodeSegment(p);
      if (!Number.isFinite(claims.exp)) {
        return res.status(401).json({ error: 'missing_expiration' });
      }
      if (claims.exp * 1000 <= Date.now()) {
        return res.status(401).json({ error: 'token_expired' });
      }
      if (!config.keycloak.issuers.includes(claims.iss)) {
        return res.status(401).json({ error: 'bad_issuer' });
      }
      if (config.keycloak.audience) {
        const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
        if (!aud.includes(config.keycloak.audience)) {
          return res.status(401).json({ error: 'bad_audience' });
        }
      }
      // Anti-impersonation: a token without a subject identifies nobody, and
      // every audit row depends on this being present.
      if (!claims.sub)
        return res.status(401).json({ error: 'missing_subject' });

      req.user = claims;
      return next();
    } catch {
      // Fail closed, and never echo the reason — it would help an attacker
      // distinguish "wrong key" from "expired" from "malformed".
      return res.status(401).json({ error: 'unauthenticated' });
    }
  };
}
