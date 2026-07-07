/**
 * Admin “System health” data source.
 *
 * Combines two things the admin portal needs to render a live system-health
 * dashboard without exposing internal services to the browser:
 *
 *   1. Downstream service health (neo4j / mongo / keycloak / recommender) via
 *      the same checks used by the public /health endpoint.
 *   2. A curated set of Prometheus metrics, fetched server-side. Prometheus is
 *      internal-only (never published to the host), so the browser cannot query
 *      it directly — this router proxies a handful of instant queries.
 *
 * Mounted under /api/v1/admin (admin-role protected). See adminRouter.js.
 */
import express from 'express';
import { checkAllServices } from '../../utils/healthCheck.js';
import { getHabitQueue } from '../../lib/habitQueue.js';
import { logger } from '../../utils/logger.js';

const log = logger.child({ module: 'systemRouter' });

// ── Redis (for the Bull/Redis pipeline view) ────────────────────────────────
// A lazily-created, reused client so polling the dashboard doesn't churn
// connections. Mirrors the connection approach in app/lib/jsonCache.js.
let _redis = null;
async function getRedis() {
  if (_redis) return _redis;
  const { createClient } = await import('redis');
  const url = process.env.REDIS_URL || 'redis://localhost:6379';
  const client = createClient({ url });
  client.on('error', (err) => log.warn({ err }, 'redis client error'));
  await client.connect();
  _redis = client;
  return _redis;
}

function parseRedisInfo(infoStr) {
  const out = {};
  for (const raw of infoStr.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    out[line.slice(0, idx)] = line.slice(idx + 1);
  }
  return out;
}

async function getRedisStats() {
  try {
    const client = await getRedis();
    const info = parseRedisInfo(await client.info());
    const hits = Number(info.keyspace_hits ?? 0);
    const misses = Number(info.keyspace_misses ?? 0);
    let totalKeys = 0;
    for (const [k, v] of Object.entries(info)) {
      if (/^db\d+$/.test(k)) {
        const m = /keys=(\d+)/.exec(v);
        if (m) totalKeys += Number(m[1]);
      }
    }
    return {
      connected: true,
      usedMemoryMB: Number(info.used_memory ?? 0) / 1024 / 1024,
      keyspaceHits: hits,
      keyspaceMisses: misses,
      hitRatePct: hits + misses > 0 ? (100 * hits) / (hits + misses) : null,
      totalKeys,
      connectedClients: Number(info.connected_clients ?? 0),
      uptimeSeconds: Number(info.uptime_in_seconds ?? 0),
    };
  } catch (err) {
    log.warn({ err }, 'redis stats failed');
    return { connected: false };
  }
}

async function getQueueStats() {
  try {
    const queue = getHabitQueue();
    const counts = await queue.getJobCounts(
      'waiting',
      'active',
      'completed',
      'failed',
      'delayed',
      'paused'
    );
    return [{ name: 'habit-donations', counts }];
  } catch (err) {
    log.warn({ err }, 'queue stats failed');
    return [];
  }
}

function prometheusUrl() {
  return process.env.PROMETHEUS_URL ?? 'http://prometheus:9090';
}

// Curated instant queries. Each resolves to a single scalar the dashboard
// renders as a stat card. `null` means Prometheus had no sample (e.g. no
// traffic yet) — the UI shows that distinctly from an error.
const QUERIES = {
  appUp: 'up{job="hhh-app"}',
  requestsPerSec: 'sum(rate(http_request_duration_seconds_count[5m]))',
  errorRatePct:
    '100 * (sum(rate(http_request_duration_seconds_count{status_code=~"5.."}[5m])) or vector(0)) / clamp_min(sum(rate(http_request_duration_seconds_count[5m])), 1)',
  p95LatencyMs:
    '1000 * histogram_quantile(0.95, sum(rate(http_request_duration_seconds_bucket[5m])) by (le))',
  residentMemoryMB: 'process_resident_memory_bytes{job="hhh-app"} / 1024 / 1024',
  cpuPercent: '100 * rate(process_cpu_seconds_total{job="hhh-app"}[5m])',
  eventLoopLagMs: '1000 * nodejs_eventloop_lag_seconds{job="hhh-app"}',
  heapUsedMB: 'nodejs_heap_size_used_bytes{job="hhh-app"} / 1024 / 1024',
};

async function promInstant(query, signal) {
  const url = `${prometheusUrl()}/api/v1/query?query=${encodeURIComponent(query)}`;
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`Prometheus HTTP ${res.status}`);
  const body = await res.json();
  if (body.status !== 'success') {
    throw new Error(`Prometheus query error: ${body.error ?? 'unknown'}`);
  }
  const first = body.data?.result?.[0];
  if (!first) return null; // no sample
  const value = Number(first.value?.[1]);
  return Number.isFinite(value) ? value : null;
}

async function collectMetrics(signal) {
  const entries = await Promise.all(
    Object.entries(QUERIES).map(async ([key, query]) => {
      try {
        return [key, await promInstant(query, signal)];
      } catch (err) {
        log.warn({ err, key }, 'Prometheus query failed');
        return [key, null];
      }
    })
  );
  return Object.fromEntries(entries);
}

export function createSystemRouter({ serviceChecks = {} } = {}) {
  const router = express.Router();

  /**
   * GET /system/overview
   * One call for the whole dashboard: downstream service health + Prometheus
   * metrics. Never 500s on a Prometheus outage — it reports reachability so the
   * UI can degrade gracefully.
   */
  router.get('/system/overview', async (_req, res) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    try {
      const [health, metrics] = await Promise.all([
        checkAllServices(serviceChecks),
        collectMetrics(controller.signal).then(
          (m) => ({ reachable: true, values: m }),
          (err) => {
            log.warn({ err }, 'Prometheus unreachable');
            return { reachable: false, values: {} };
          }
        ),
      ]);
      res.json({
        generatedAt: new Date().toISOString(),
        health,
        prometheus: metrics,
      });
    } catch (err) {
      log.error({ err }, 'system overview failed');
      res.status(500).json({ error: 'Failed to collect system overview.' });
    } finally {
      clearTimeout(timer);
    }
  });

  /**
   * GET /system/queues
   * BullMQ job counts (the habit-donations pipeline) plus Redis stats used for
   * caching. Powers the "Queues & cache" panel on the admin System page.
   */
  router.get('/system/queues', async (_req, res) => {
    try {
      const [queues, redis] = await Promise.all([
        getQueueStats(),
        getRedisStats(),
      ]);
      res.json({ generatedAt: new Date().toISOString(), queues, redis });
    } catch (err) {
      log.error({ err }, 'system queues failed');
      res.status(500).json({ error: 'Failed to collect queue/cache stats.' });
    }
  });

  return router;
}

export default createSystemRouter;
