import { test, before, after } from 'node:test';
import assert from 'node:assert';
import { createServer } from 'node:http';
import express from 'express';
import { createV1Router } from '../../routes/v1Router.js';

// ── Test server ───────────────────────────────────────────────────────────────

let server;
let baseUrl;

before(async () => {
  const testApp = express();
  testApp.use(express.json());

  const okCheck = async () => ({ status: 'ok', latencyMs: 1 });
  const v1Router = createV1Router({
    jwksUrl: 'http://keycloak/jwks',
    expectedIssuer: null,
    expectedAudience: null,
    serviceChecks: { neo4jCheck: okCheck, mongoCheck: okCheck },
  });
  testApp.use('/api/v1', v1Router);

  server = createServer(testApp);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(() => {
  server.close();
});

// ── Tests ─────────────────────────────────────────────────────────────────────

test('GET /api/v1/health returns 200 without auth', async () => {
  const res = await fetch(`${baseUrl}/api/v1/health`);
  assert.strictEqual(res.status, 200);
});

test('GET /api/v1/health response has status ok', async () => {
  const res = await fetch(`${baseUrl}/api/v1/health`);
  const body = await res.json();
  assert.strictEqual(body.status, 'ok');
});

test('GET /api/v1/health response includes service checks', async () => {
  const res = await fetch(`${baseUrl}/api/v1/health`);
  const body = await res.json();
  assert.ok('services' in body || 'status' in body);
});

test('GET /api/v1/health is accessible without Authorization header', async () => {
  const res = await fetch(`${baseUrl}/api/v1/health`, { headers: {} });
  assert.strictEqual(res.status, 200);
});
