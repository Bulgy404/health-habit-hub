import { test, before, after } from 'node:test';
import assert from 'node:assert';
import { generateKeyPairSync, createSign } from 'node:crypto';
import { createTokenVerifier } from '../../middleware/auth.js';

const { privateKey, publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
});

const pubKeyJwk = publicKey.export({ format: 'jwk' });
pubKeyJwk.kid = 'verifier-key-1';
pubKeyJwk.use = 'sig';
const mockJwks = { keys: [pubKeyJwk] };

function base64urlEncode(buf) {
  return buf
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

function createJwt(payload, key = privateKey, kid = 'verifier-key-1') {
  const header = { alg: 'RS256', kid, typ: 'JWT' };
  const h = base64urlEncode(Buffer.from(JSON.stringify(header)));
  const p = base64urlEncode(Buffer.from(JSON.stringify(payload)));
  const signingInput = `${h}.${p}`;
  const sign = createSign('RSA-SHA256');
  sign.update(signingInput);
  return `${signingInput}.${base64urlEncode(sign.sign(key))}`;
}

let verifyToken;
let realFetch;

before(async () => {
  realFetch = global.fetch;
  global.fetch = async () => ({ ok: true, json: async () => mockJwks });
  verifyToken = createTokenVerifier({ jwksUrl: 'http://localhost/jwks' });
});

after(() => {
  global.fetch = realFetch;
});

test('valid JWT returns decoded payload', async () => {
  const now = Math.floor(Date.now() / 1000);
  const payload = { sub: 'user-100', exp: now + 3600, iat: now };
  const token = createJwt(payload);

  const result = await verifyToken(token);
  assert.strictEqual(result.sub, 'user-100');
});

test('expired JWT throws Token expired error', async () => {
  const now = Math.floor(Date.now() / 1000);
  const payload = { sub: 'user-101', exp: now - 60, iat: now - 3660 };
  const token = createJwt(payload);

  await assert.rejects(
    () => verifyToken(token),
    (err) => {
      assert.ok(err.message.includes('Token expired'));
      return true;
    }
  );
});

test('JWT with invalid signature throws error', async () => {
  const { privateKey: otherKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
  });
  const now = Math.floor(Date.now() / 1000);
  const payload = { sub: 'user-102', exp: now + 3600 };
  const token = createJwt(payload, otherKey);

  await assert.rejects(() => verifyToken(token));
});

test('JWT with unknown kid throws Key not found', async () => {
  const now = Math.floor(Date.now() / 1000);
  const payload = { sub: 'user-103', exp: now + 3600 };
  const token = createJwt(payload, privateKey, 'unknown-kid');

  await assert.rejects(
    () => verifyToken(token),
    (err) => {
      assert.ok(err.message.includes('Key not found'));
      return true;
    }
  );
});

test('malformed token throws error', async () => {
  await assert.rejects(() => verifyToken('not.a.jwt'));
});
