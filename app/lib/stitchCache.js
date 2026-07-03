// app/lib/stitchCache.js
//
// Caching layer for the LLM "stitch-intention" step.
//
// The stitch call is an expensive synchronous LLM proxy. When many users
// donate/create habits at the same time, identical or repeated inputs would
// each trigger their own upstream request. This module adds two cheap wins:
//
//   1. A Redis result cache keyed on (language, action, cues). Identical
//      requests within the TTL are served from Redis with no upstream call.
//   2. An in-process in-flight map so concurrent identical requests on the
//      same node share a single upstream promise (request coalescing) instead
//      of firing N times before the first result is cached.
//
// Redis is optional: if it is unavailable the module degrades gracefully and
// simply always calls the upstream function.

import crypto from 'node:crypto';
import { logger } from '../utils/logger.js';

const log = logger.child({ module: 'stitchCache' });

const KEY_PREFIX = 'stitch:v1:';
const DEFAULT_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days — stitched sentences are stable

// In-process coalescing map: cacheKey -> Promise<string|null>
const inFlight = new Map();

let cachedClient;
let redisDisabled = false;

/**
 * Build a stable cache key from the stitch inputs. Cues are normalised
 * (trimmed, lowercased) and joined so that trivially different casing/spacing
 * still hits the same cache entry.
 */
export function stitchCacheKey({ action, cues, language = 'en' }) {
  const normCues = (Array.isArray(cues) ? cues : [])
    .map((c) => String(c).trim().toLowerCase())
    .filter(Boolean);
  const payload = JSON.stringify({
    a: String(action).trim().toLowerCase(),
    c: normCues,
    l: String(language).slice(0, 5).toLowerCase(),
  });
  const hash = crypto.createHash('sha1').update(payload).digest('hex');
  return `${KEY_PREFIX}${hash}`;
}

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
    // Disable for the rest of the process lifetime after a hard failure so we
    // don't pay the connect() timeout on every request.
    log.warn({ err: err?.message }, 'redis unavailable — stitch cache disabled');
    redisDisabled = true;
    return null;
  }
}

/**
 * Resolve a stitched sentence with caching + request coalescing.
 *
 * @param {{ action: string, cues: string[], language?: string }} input
 * @param {() => Promise<string|null>} compute - upstream call, invoked only on
 *   a cache miss. Should resolve to the stitched sentence, or null on failure.
 * @param {number} [ttlSeconds]
 * @returns {Promise<{ sentence: string|null, cached: boolean }>}
 */
export async function getOrComputeStitch(input, compute, ttlSeconds = DEFAULT_TTL_SECONDS) {
  const key = stitchCacheKey(input);
  const redis = await getRedis();

  // 1. Redis hit
  if (redis) {
    try {
      const hit = await redis.get(key);
      if (hit != null) return { sentence: hit, cached: true };
    } catch (err) {
      log.warn({ err: err?.message }, 'stitch cache read failed');
    }
  }

  // 2. Coalesce concurrent identical requests on this node.
  if (inFlight.has(key)) {
    const sentence = await inFlight.get(key);
    return { sentence, cached: true };
  }

  const promise = (async () => {
    const sentence = await compute();
    // Only cache successful, non-empty sentences.
    if (redis && typeof sentence === 'string' && sentence.trim()) {
      try {
        await redis.set(key, sentence, { EX: ttlSeconds });
      } catch (err) {
        log.warn({ err: err?.message }, 'stitch cache write failed');
      }
    }
    return sentence;
  })();

  inFlight.set(key, promise);
  try {
    const sentence = await promise;
    return { sentence, cached: false };
  } finally {
    inFlight.delete(key);
  }
}
