// app/lib/jsonCache.js
//
// Generic Redis JSON cache with TTL and force-refresh. Used by admin "insights"
// so expensive cross-database aggregations are computed on demand, cached, and
// only recomputed when the TTL lapses or a refresh is explicitly requested.
//
// Redis is optional: if unavailable, values are always recomputed.

import { logger } from '../utils/logger.js';

const log = logger.child({ module: 'jsonCache' });

let cachedClient;
let redisDisabled = false;

async function getRedis() {
  if (redisDisabled) return null;
  if (cachedClient) return cachedClient;
  try {
    const { createClient } = await import('redis');
    const url = process.env.REDIS_URL || 'redis://localhost:6379';
    const client = createClient({ url });
    client.on('error', (err) =>
      log.warn({ err: err.message }, 'redis client error')
    );
    await client.connect();
    cachedClient = client;
    return client;
  } catch (err) {
    log.warn({ err: err?.message }, 'redis unavailable — json cache disabled');
    redisDisabled = true;
    return null;
  }
}

/**
 * Return a cached JSON value or compute + cache it.
 *
 * @template T
 * @param {string} key - Cache key (namespace it yourself, e.g. "insights:v1:x").
 * @param {() => Promise<T>} compute - Invoked on a miss / refresh.
 * @param {{ ttlSeconds?: number, refresh?: boolean }} [opts]
 * @returns {Promise<{ data: T, computedAt: string, cached: boolean }>}
 */
export async function getOrComputeJson(
  key,
  compute,
  { ttlSeconds = 300, refresh = false } = {}
) {
  const redis = await getRedis();

  if (redis && !refresh) {
    try {
      const hit = await redis.get(key);
      if (hit != null) {
        const env = JSON.parse(hit);
        return { ...env, cached: true };
      }
    } catch (err) {
      log.warn({ err: err?.message }, 'json cache read failed');
    }
  }

  const data = await compute();
  const env = { data, computedAt: new Date().toISOString() };
  if (redis) {
    try {
      await redis.set(key, JSON.stringify(env), { EX: ttlSeconds });
    } catch (err) {
      log.warn({ err: err?.message }, 'json cache write failed');
    }
  }
  return { ...env, cached: false };
}
