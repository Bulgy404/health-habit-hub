import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createSign, generateKeyPairSync } from 'node:crypto';
import { createAuthMiddleware } from '../src/middleware/auth.js';

const ISSUER = 'https://identity.example/realms/hhh';
const AUDIENCE = 'hhh-admin';
const { privateKey, publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
});
const jwk = {
  ...publicKey.export({ format: 'jwk' }),
  kid: 'test-key',
  alg: 'RS256',
  use: 'sig',
};

function encode(value) {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function token(claims, header = { alg: 'RS256', kid: jwk.kid, typ: 'JWT' }) {
  const signingInput = `${encode(header)}.${encode(claims)}`;
  const signer = createSign('RSA-SHA256');
  signer.update(signingInput);
  signer.end();
  return `${signingInput}.${signer.sign(privateKey).toString('base64url')}`;
}

async function authenticate(middleware, jwt) {
  const result = { status: null, body: null, next: false };
  const req = {
    get(name) {
      return name === 'Authorization' ? `Bearer ${jwt}` : undefined;
    },
  };
  const res = {
    status(code) {
      result.status = code;
      return this;
    },
    json(body) {
      result.body = body;
      return this;
    },
  };
  await middleware(req, res, () => {
    result.next = true;
  });
  result.user = req.user;
  return result;
}

describe('Keycloak bearer authentication', () => {
  let originalFetch;
  let middleware;

  before(() => {
    originalFetch = globalThis.fetch;
    globalThis.fetch = async () =>
      new Response(JSON.stringify({ keys: [jwk] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    middleware = createAuthMiddleware({
      keycloak: {
        jwksUrl: 'https://identity.example/jwks',
        issuers: [ISSUER],
        audience: AUDIENCE,
      },
    });
  });

  after(() => {
    globalThis.fetch = originalFetch;
  });

  it('accepts a signed, scoped, unexpired token', async () => {
    const claims = {
      sub: 'manager-1',
      iss: ISSUER,
      aud: AUDIENCE,
      exp: Math.floor(Date.now() / 1000) + 60,
    };
    const result = await authenticate(middleware, token(claims));
    assert.equal(result.next, true);
    assert.equal(result.user.sub, claims.sub);
  });

  it('rejects a signed token with no expiration', async () => {
    const result = await authenticate(
      middleware,
      token({ sub: 'manager-1', iss: ISSUER, aud: AUDIENCE })
    );
    assert.equal(result.status, 401);
    assert.equal(result.body.error, 'missing_expiration');
    assert.equal(result.next, false);
  });

  it('rejects an expired token', async () => {
    const result = await authenticate(
      middleware,
      token({
        sub: 'manager-1',
        iss: ISSUER,
        aud: AUDIENCE,
        exp: Math.floor(Date.now() / 1000) - 1,
      })
    );
    assert.equal(result.status, 401);
    assert.equal(result.body.error, 'token_expired');
  });

  it('rejects a token that advertises another algorithm', async () => {
    const result = await authenticate(
      middleware,
      token(
        {
          sub: 'manager-1',
          iss: ISSUER,
          aud: AUDIENCE,
          exp: Math.floor(Date.now() / 1000) + 60,
        },
        { alg: 'RS512', kid: jwk.kid, typ: 'JWT' }
      )
    );
    assert.equal(result.status, 401);
    assert.equal(result.body.error, 'unsupported_algorithm');
  });
});
