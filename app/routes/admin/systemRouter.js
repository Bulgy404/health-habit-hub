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
import { logger } from '../../utils/logger.js';

const log = logger.child({ module: 'systemRouter' });

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

  return router;
}

export default createSystemRouter;
