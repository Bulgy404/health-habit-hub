import { test } from 'node:test';
import assert from 'node:assert';
import { createServer } from 'node:http';
import express from 'express';
import { rateLimit } from 'express-rate-limit';

// Build a minimal app with a tight rate limiter for testing
function buildApp(max = 3) {
  const app = express();
  app.set('trust proxy', false);

  const limiter = rateLimit({
    windowMs: 60 * 1000,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator(req) {
      return req.user?.sub || 'anonymous-test-client';
    },
    handler(_req, res) {
      res
        .status(429)
        .json({ error: 'Too many requests, please try again later.' });
    },
  });

  app.use(limiter);
  app.get('/ping', (_req, res) => res.json({ ok: true }));
  return app;
}

test('rate limiter: allows requests under the limit', async () => {
  const app = buildApp(5);
  const server = createServer(app);
  await new Promise((r) => server.listen(0, r));
  const { port } = server.address();

  const res = await fetch(`http://127.0.0.1:${port}/ping`);
  assert.strictEqual(res.status, 200);

  server.close();
});

test('rate limiter: returns 429 after limit exceeded', async () => {
  const app = buildApp(2);
  const server = createServer(app);
  await new Promise((r) => server.listen(0, r));
  const { port } = server.address();

  // Exhaust the limit
  await fetch(`http://127.0.0.1:${port}/ping`);
  await fetch(`http://127.0.0.1:${port}/ping`);
  // Third request should be rejected
  const res = await fetch(`http://127.0.0.1:${port}/ping`);
  assert.strictEqual(res.status, 429);

  const body = await res.json();
  assert.ok(body.error, 'response should have error field');

  server.close();
});

test('rate limiter: 429 response has JSON content-type', async () => {
  const app = buildApp(1);
  const server = createServer(app);
  await new Promise((r) => server.listen(0, r));
  const { port } = server.address();

  await fetch(`http://127.0.0.1:${port}/ping`);
  const res = await fetch(`http://127.0.0.1:${port}/ping`);
  assert.strictEqual(res.status, 429);
  assert.ok(res.headers.get('content-type')?.includes('application/json'));

  server.close();
});
