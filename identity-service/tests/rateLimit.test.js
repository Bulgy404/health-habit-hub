import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import express from 'express';
import {
  publicLimiter,
  revealLimiter,
  internalLimiter,
} from '../src/middleware/rateLimit.js';

/**
 * Mounts one limiter on a throwaway app and returns a caller for it.
 *
 * `trust proxy` mirrors server.js, because the key generator reads the client
 * address and getting that wrong behind Traefik would collapse every caller
 * onto one bucket — the failure mode where a limiter looks like it works and
 * actually rate-limits the whole institute as a single user.
 */
async function mount(limiter, { withUser = null } = {}) {
  const app = express();
  app.set('trust proxy', 1);
  app.get('/api/v1/health', (_req, res) => res.json({ status: 'ok' }));
  app.get('/internal/v1/health', (_req, res) => res.json({ status: 'ok' }));
  if (withUser) {
    app.use((req, _res, next) => {
      req.user = { sub: req.get('x-test-sub') ?? withUser };
      next();
    });
  }
  app.use(limiter);
  app.get('/thing', (_req, res) => res.json({ ok: true }));

  const server = createServer(app);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  return {
    get: (path, headers = {}) => fetch(`${base}${path}`, { headers }),
    async close() {
      server.closeAllConnections();
      await new Promise((r) => server.close(r));
    },
  };
}

describe('reveal limiter', () => {
  let app;
  before(async () => {
    app = await mount(revealLimiter, { withUser: 'monitor-1' });
  });
  after(() => app.close());

  test('allows a plausible day of legitimate re-identification, then stops', async () => {
    // 30/hour. A study site working a serious adverse event does not need
    // thirty in an hour, and something that does is a conversation, not a
    // threshold to raise quietly.
    let lastOk = 0;
    for (let i = 0; i < 30; i++) {
      const res = await app.get('/thing', { 'x-test-sub': 'monitor-1' });
      if (res.status === 200) lastOk += 1;
    }
    assert.equal(lastOk, 30);

    const blocked = await app.get('/thing', { 'x-test-sub': 'monitor-1' });
    assert.equal(blocked.status, 429);
    const body = await blocked.json();
    assert.equal(body.error, 'rate_limited');
    // The message must say why the limit exists, not merely that it exists.
    assert.match(body.message, /data protection officer/i);
  });

  test('one exhausted actor does not lock out a different one', async () => {
    // Study sites sit behind institutional NAT, so several nurses share an
    // address. Keying on the IP alone would let one busy colleague spend
    // everyone else's budget.
    const other = await app.get('/thing', {
      'x-test-sub': 'monitor-elsewhere',
    });
    assert.equal(other.status, 200);
  });
});

describe('public limiter', () => {
  let app;
  before(async () => {
    app = await mount(publicLimiter);
  });
  after(() => app.close());

  test('never limits the health endpoint', async () => {
    // Prometheus polls it on a timer. Counting a monitoring probe against an
    // abuse budget would 429 the register during an incident — precisely when
    // it needs to be reachable.
    for (let i = 0; i < 350; i++) {
      const res = await app.get('/api/v1/health');
      assert.equal(res.status, 200, `health request ${i} was limited`);
    }
  });
});

describe('internal limiter', () => {
  let app;
  before(async () => {
    app = await mount(internalLimiter);
  });
  after(() => app.close());

  test('bounds a walk of the enrolment-code keyspace', async () => {
    // The internal API is reachable only with the service token, so this is
    // not the primary control. It is the one that matters if that token
    // leaks: codes/reserve looks a code up by keyed digest, and a code enrols
    // someone AS A SPECIFIC IDENTIFIED SUBJECT.
    let allowed = 0;
    let limited = 0;
    for (let i = 0; i < 130; i++) {
      const res = await app.get('/thing');
      if (res.status === 200) allowed += 1;
      else if (res.status === 429) limited += 1;
    }
    assert.equal(allowed, 120);
    assert.equal(limited, 10);
  });

  test('never limits the internal health endpoint', async () => {
    const res = await app.get('/internal/v1/health');
    assert.equal(res.status, 200);
  });
});
