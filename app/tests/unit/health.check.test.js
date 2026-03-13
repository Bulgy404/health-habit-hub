import { test } from 'node:test';
import assert from 'node:assert';
import { checkAllServices } from '../../utils/healthCheck.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

const okCheck = async () => ({ status: 'ok', latencyMs: 1 });
const errCheck = async () => ({ status: 'error', latencyMs: 1 });

function withMockFetch(fn) {
  const saved = global.fetch;
  global.fetch = async (url) => {
    if (typeof url === 'string' && url.endsWith('/health')) {
      return { status: 200, ok: true };
    }
    return { status: 200, ok: true };
  };
  return fn().finally(() => {
    global.fetch = saved;
  });
}

function withErrorFetch(fn) {
  const saved = global.fetch;
  global.fetch = async () => {
    throw new Error('ECONNREFUSED');
  };
  return fn().finally(() => {
    global.fetch = saved;
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test('checkAllServices returns ok when all services up', async () => {
  await withMockFetch(async () => {
    const result = await checkAllServices({
      neo4jCheck: okCheck,
      mongoCheck: okCheck,
    });
    assert.strictEqual(result.status, 'ok');
    assert.ok(result.services.neo4j);
    assert.ok(result.services.mongo);
    assert.ok(result.services.fuseki);
    assert.ok(result.services.keycloak);
    assert.ok(result.services.recommender);
    assert.strictEqual(result.services.neo4j.status, 'ok');
    assert.strictEqual(result.services.mongo.status, 'ok');
  });
});

test('checkAllServices returns error when neo4j is down', async () => {
  await withMockFetch(async () => {
    const result = await checkAllServices({
      neo4jCheck: errCheck,
      mongoCheck: okCheck,
    });
    assert.strictEqual(result.status, 'error');
    assert.strictEqual(result.services.neo4j.status, 'error');
    assert.strictEqual(result.services.mongo.status, 'ok');
  });
});

test('checkAllServices returns error when mongo is down', async () => {
  await withMockFetch(async () => {
    const result = await checkAllServices({
      neo4jCheck: okCheck,
      mongoCheck: errCheck,
    });
    assert.strictEqual(result.status, 'error');
    assert.strictEqual(result.services.mongo.status, 'error');
    assert.strictEqual(result.services.neo4j.status, 'ok');
  });
});

test('checkAllServices returns ok when only non-critical services are down', async () => {
  await withErrorFetch(async () => {
    const result = await checkAllServices({
      neo4jCheck: okCheck,
      mongoCheck: okCheck,
    });
    assert.strictEqual(result.status, 'ok');
    assert.strictEqual(result.services.neo4j.status, 'ok');
    assert.strictEqual(result.services.mongo.status, 'ok');
    assert.strictEqual(result.services.fuseki.status, 'error');
    assert.strictEqual(result.services.keycloak.status, 'error');
    assert.strictEqual(result.services.recommender.status, 'error');
  });
});

test('each service entry has status and latencyMs fields', async () => {
  await withMockFetch(async () => {
    const result = await checkAllServices({
      neo4jCheck: okCheck,
      mongoCheck: okCheck,
    });
    for (const [, svc] of Object.entries(result.services)) {
      assert.ok(
        svc.status === 'ok' || svc.status === 'error',
        `status should be ok or error, got ${svc.status}`
      );
      assert.ok(
        typeof svc.latencyMs === 'number',
        'latencyMs should be number'
      );
    }
  });
});
