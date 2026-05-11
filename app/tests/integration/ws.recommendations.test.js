import { test, before, after } from 'node:test';
import assert from 'node:assert';
import { createServer } from 'node:http';
import { generateKeyPairSync, createSign } from 'node:crypto';
import express from 'express';
import { WebSocket } from 'ws';
import { createRecommendationWsServer } from '../../ws/recommendationWs.js';
import { createInternalRouter } from '../../routes/internalRouter.js';

// ── Key material ─────────────────────────────────────────────────────────────

const { privateKey, publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
});
const pubKeyJwk = publicKey.export({ format: 'jwk' });
pubKeyJwk.kid = 'ws-key-1';
pubKeyJwk.use = 'sig';

// ── JWT helpers ───────────────────────────────────────────────────────────────

function base64urlEncode(buf) {
  return buf
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

function createJwt(payload) {
  const header = { alg: 'RS256', kid: 'ws-key-1', typ: 'JWT' };
  const h = base64urlEncode(Buffer.from(JSON.stringify(header)));
  const p = base64urlEncode(Buffer.from(JSON.stringify(payload)));
  const signingInput = `${h}.${p}`;
  const sign = createSign('RSA-SHA256');
  sign.update(signingInput);
  return `${signingInput}.${base64urlEncode(sign.sign(privateKey))}`;
}

function makeToken(sub = 'user-ws-test', roles = ['user']) {
  const now = Math.floor(Date.now() / 1000);
  return createJwt({
    sub,
    exp: now + 3600,
    iat: now,
    realm_access: { roles },
  });
}

// ── verifyToken mock (no JWKS fetch needed) ───────────────────────────────────

function base64urlDecode(str) {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) str += '=';
  return Buffer.from(str, 'base64');
}

import { createPublicKey, createVerify } from 'node:crypto';

async function verifyToken(token) {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('Invalid JWT');
  const header = JSON.parse(base64urlDecode(parts[0]).toString('utf8'));
  const payload = JSON.parse(base64urlDecode(parts[1]).toString('utf8'));
  const signingInput = `${parts[0]}.${parts[1]}`;
  const signature = parts[2];
  const now = Math.floor(Date.now() / 1000);
  if (payload.exp && payload.exp < now) throw new Error('Expired');
  if (header.kid !== pubKeyJwk.kid) throw new Error('Unknown key');
  const pk = createPublicKey({ key: pubKeyJwk, format: 'jwk' });
  const v = createVerify('RSA-SHA256');
  v.update(signingInput);
  if (!v.verify(pk, base64urlDecode(signature))) throw new Error('Bad sig');
  return payload;
}

// ── Test server ───────────────────────────────────────────────────────────────

const TEST_INTERNAL_SECRET = 'test-internal-secret';

let httpServer;
let baseUrl;
let wsUrl;
let closeWsServer;

before(async () => {
  const app = express();
  app.use(express.json());

  const srv = createServer(app);
  const { broadcast, close } = createRecommendationWsServer(srv, {
    verifyToken,
  });
  closeWsServer = close;
  app.use(
    '/api/internal',
    createInternalRouter({ broadcast, internalSecret: TEST_INTERNAL_SECRET })
  );

  httpServer = srv;
  await new Promise((resolve) => srv.listen(0, '127.0.0.1', resolve));
  const { port } = srv.address();
  baseUrl = `http://127.0.0.1:${port}`;
  wsUrl = `ws://127.0.0.1:${port}`;
});

after(async () => {
  await closeWsServer();
  await new Promise((resolve) => httpServer.close(resolve));
});

// ── Helper ────────────────────────────────────────────────────────────────────

function connectWs() {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`${wsUrl}/ws/recommendations`);
    ws.on('open', () => resolve(ws));
    ws.on('error', reject);
  });
}

function waitForMessage(ws) {
  return new Promise((resolve) => {
    ws.once('message', (data) => resolve(JSON.parse(data.toString())));
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test(
  'unauthenticated socket is disconnected after 5s timeout',
  async () => {
    const ws = await connectWs();
    // Don't send a token — wait for server to close
    await new Promise((resolve) => ws.on('close', resolve));
    assert.notStrictEqual(ws.readyState, WebSocket.OPEN);
  },
  { timeout: 8000 }
);

test('invalid token causes immediate disconnect', async () => {
  const ws = await connectWs();
  ws.send('not-a-valid-jwt');
  await new Promise((resolve) => ws.on('close', resolve));
  assert.notStrictEqual(ws.readyState, WebSocket.OPEN);
});

test('authenticated socket receives broadcast message', async () => {
  const userId = 'user-broadcast-test';
  const token = makeToken(userId);
  const ws = await connectWs();
  ws.send(token);

  // Wait briefly for auth to complete
  await new Promise((r) => setTimeout(r, 100));

  const FIXTURE = {
    id: 'rec-1',
    habitName: 'Drink water',
    category: 'hydration',
    confidenceScore: 0.9,
    rationale: 'test',
  };
  const msgPromise = waitForMessage(ws);

  const res = await fetch(`${baseUrl}/api/internal/recommendations`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Internal-Secret': TEST_INTERNAL_SECRET,
    },
    body: JSON.stringify({ userId, recommendation: FIXTURE }),
  });
  assert.strictEqual(res.status, 200);

  const msg = await msgPromise;
  assert.strictEqual(msg.type, 'new_recommendation');
  assert.deepStrictEqual(msg.data, FIXTURE);

  ws.close();
});

test('POST /api/internal/recommendations returns 400 without userId', async () => {
  const res = await fetch(`${baseUrl}/api/internal/recommendations`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Internal-Secret': TEST_INTERNAL_SECRET,
    },
    body: JSON.stringify({ recommendation: { id: 'x' } }),
  });
  assert.strictEqual(res.status, 400);
});

test('POST /api/internal/recommendations returns 403 without secret', async () => {
  const res = await fetch(`${baseUrl}/api/internal/recommendations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId: 'user1', recommendation: { id: 'x' } }),
  });
  assert.strictEqual(res.status, 403);
});

test('broadcast to unknown userId is a no-op', async () => {
  const res = await fetch(`${baseUrl}/api/internal/recommendations`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Internal-Secret': TEST_INTERNAL_SECRET,
    },
    body: JSON.stringify({ userId: 'nobody', recommendation: { id: 'x' } }),
  });
  assert.strictEqual(res.status, 200);
  const body = await res.json();
  assert.strictEqual(body.ok, true);
});

test('WS upgrade to unknown path is rejected', async () => {
  // Server destroys socket for unknown paths — results in a connection error
  await assert.rejects(
    () =>
      new Promise((resolve, reject) => {
        const ws = new WebSocket(`${wsUrl}/ws/other`);
        ws.on('open', resolve);
        ws.on('error', reject);
      })
  );
});
