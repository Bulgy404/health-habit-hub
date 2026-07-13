import { test, before, after } from 'node:test';
import assert from 'node:assert';
import { generateKeyPairSync, createSign } from 'node:crypto';
import { createAuthMiddleware } from '../../middleware/auth.js';

const { privateKey, publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
});

const pubKeyJwk = publicKey.export({ format: 'jwk' });
pubKeyJwk.kid = 'test-key-1';
pubKeyJwk.use = 'sig';
const mockJwks = { keys: [pubKeyJwk] };

function base64urlEncode(buf) {
  return buf
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

function createJwt(payload, key, kid = 'test-key-1') {
  const header = { alg: 'RS256', kid, typ: 'JWT' };
  const h = base64urlEncode(Buffer.from(JSON.stringify(header)));
  const p = base64urlEncode(Buffer.from(JSON.stringify(payload)));
  const signingInput = `${h}.${p}`;
  const sign = createSign('RSA-SHA256');
  sign.update(signingInput);
  const sig = base64urlEncode(sign.sign(key));
  return `${signingInput}.${sig}`;
}

function makeFetchMock(jwks) {
  return async () => ({ ok: true, json: async () => jwks });
}

function makeRes() {
  const res = { statusCode: null, body: null };
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (body) => {
    res.body = body;
    return res;
  };
  return res;
}

let middleware;
let realFetch;

before(async () => {
  realFetch = global.fetch;
  global.fetch = makeFetchMock(mockJwks);
  middleware = createAuthMiddleware({ jwksUrl: 'http://localhost/jwks' });
  await middleware.ready;
});

after(() => {
  global.fetch = realFetch;
});

test('valid JWT attaches decoded payload to req.user', async () => {
  const now = Math.floor(Date.now() / 1000);
  const payload = { sub: 'user-123', exp: now + 3600, iat: now };
  const token = createJwt(payload, privateKey);

  const req = { headers: { authorization: `Bearer ${token}` } };
  const res = makeRes();
  let nextCalled = false;

  await middleware(req, res, () => {
    nextCalled = true;
  });

  assert.strictEqual(nextCalled, true, 'next() should be called');
  assert.strictEqual(req.user.sub, 'user-123');
});

test('missing Authorization header returns 401', async () => {
  const req = { headers: {} };
  const res = makeRes();

  await middleware(req, res, () => {});

  assert.strictEqual(res.statusCode, 401);
  assert.deepStrictEqual(res.body, { error: 'Unauthorized' });
});

test('non-Bearer Authorization header returns 401', async () => {
  const req = { headers: { authorization: 'Basic dXNlcjpwYXNz' } };
  const res = makeRes();

  await middleware(req, res, () => {});

  assert.strictEqual(res.statusCode, 401);
  assert.deepStrictEqual(res.body, { error: 'Unauthorized' });
});

test('expired JWT returns 401', async () => {
  const now = Math.floor(Date.now() / 1000);
  const payload = { sub: 'user-456', exp: now - 60, iat: now - 3660 };
  const token = createJwt(payload, privateKey);

  const req = { headers: { authorization: `Bearer ${token}` } };
  const res = makeRes();

  await middleware(req, res, () => {});

  assert.strictEqual(res.statusCode, 401);
  assert.deepStrictEqual(res.body, { error: 'Unauthorized' });
});

test('JWT with invalid signature returns 401', async () => {
  const now = Math.floor(Date.now() / 1000);
  const payload = { sub: 'user-789', exp: now + 3600 };
  const token = createJwt(payload, privateKey);

  // Tamper with the payload
  const parts = token.split('.');
  const tamperedPayload = base64urlEncode(
    Buffer.from(JSON.stringify({ sub: 'attacker', exp: now + 3600 }))
  );
  const tamperedToken = `${parts[0]}.${tamperedPayload}.${parts[2]}`;

  const req = { headers: { authorization: `Bearer ${tamperedToken}` } };
  const res = makeRes();

  await middleware(req, res, () => {});

  assert.strictEqual(res.statusCode, 401);
  assert.deepStrictEqual(res.body, { error: 'Unauthorized' });
});

test('malformed token returns 401', async () => {
  const req = { headers: { authorization: 'Bearer not.a.valid.jwt.here' } };
  const res = makeRes();

  await middleware(req, res, () => {});

  assert.strictEqual(res.statusCode, 401);
  assert.deepStrictEqual(res.body, { error: 'Unauthorized' });
});
