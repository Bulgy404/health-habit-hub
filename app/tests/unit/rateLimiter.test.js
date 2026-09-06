import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import express from 'express';
import { rateLimit, ipKeyGenerator } from 'express-rate-limit';
import { apiRateLimiter } from '../../middleware/rateLimiter.js';

/**
 * These test that the limiters LIMIT, which sounds too obvious to be worth
 * writing until you learn how they failed.
 *
 * `ipKeyGenerator` takes an IP **string**. Every call site in this repository
 * passed the whole request object instead. That does not throw and does not
 * warn — it returns the object, which express-rate-limit then uses as the
 * bucket key. Object identity differs per request, so every request got its
 * own bucket and **no IP-keyed limiter in the backend limited anything**.
 *
 * The endpoints that relied on it were the pre-auth, credential-adjacent ones
 * where the limit *is* the control: `POST /onboard` (account creation) and
 * `POST /restore` (passphrase recovery, documented as 5/hour and the only
 * defence against walking the username space).
 *
 * A unit test asserting `keyGenerator` returns a string would have caught it.
 * These drive real requests instead, because that is the property that
 * matters and it cannot be satisfied by a plausible-looking key.
 */

/** Stand up one limiter on a throwaway app and fire `n` requests at it. */
async function hammer(limiter, n, { headers = {} } = {}) {
  const app = express();
  // Mirrors app.js. Without it `req.ip` is the proxy's address, which would
  // collapse every caller onto one bucket — a limiter that looks like it works
  // and actually rate-limits the whole internet as a single client.
  app.set('trust proxy', 1);
  app.use(limiter);
  app.get('/x', (_req, res) => res.json({ ok: true }));

  const server = createServer(app);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;

  let allowed = 0;
  let limited = 0;
  try {
    for (let i = 0; i < n; i++) {
      const res = await fetch(`${base}/x`, { headers });
      if (res.status === 200) allowed += 1;
      else if (res.status === 429) limited += 1;
    }
  } finally {
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
  }
  return { allowed, limited };
}

describe('rate limiting actually limits', () => {
  test('an IP-keyed limiter stops at its budget', async () => {
    const limiter = rateLimit({
      windowMs: 60_000,
      max: 3,
      keyGenerator: (req) => ipKeyGenerator(req.ip),
      handler: (_req, res) => res.status(429).json({ error: 'limited' }),
    });

    const { allowed, limited } = await hammer(limiter, 10);
    assert.equal(allowed, 3, 'the limiter let more than its budget through');
    assert.equal(limited, 7);
  });

  test('ipKeyGenerator returns a string — passing it a request does not', () => {
    // The exact defect, pinned. `ipKeyGenerator(req)` returns the request,
    // and an object key is unique per request, so nothing is ever limited.
    assert.equal(typeof ipKeyGenerator('203.0.113.7'), 'string');
    assert.notEqual(
      typeof ipKeyGenerator({ ip: '203.0.113.7' }),
      'string',
      'if this ever returns a string the guard below is no longer needed'
    );
  });

  test('the shared apiRateLimiter keys unauthenticated callers by IP, not per request', async () => {
    // 100/15min. Only the first 100 may pass; the 101st must not.
    const { allowed, limited } = await hammer(apiRateLimiter, 105);
    assert.equal(allowed, 100);
    assert.equal(limited, 5);
  });

  test('the shared apiRateLimiter exempts admin system-health polling', async () => {
    // The dashboard polls on a timer; counting that against the abuse budget
    // would 429 the whole portal.
    const app = express();
    app.set('trust proxy', 1);
    app.use(apiRateLimiter);
    app.get('/admin/system/health', (_req, res) => res.json({ ok: true }));

    const server = createServer(app);
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    const base = `http://127.0.0.1:${server.address().port}`;
    try {
      for (let i = 0; i < 150; i++) {
        const res = await fetch(`${base}/admin/system/health`);
        assert.equal(res.status, 200, `poll ${i} was limited`);
      }
    } finally {
      server.closeAllConnections();
      await new Promise((r) => server.close(r));
    }
  });
});
