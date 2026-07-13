import {
  Registry,
  collectDefaultMetrics,
  Histogram,
  Counter,
} from 'prom-client';

export const register = new Registry();

collectDefaultMetrics({ register });

export const httpRequestDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request latency in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [register],
});

// Terminal (retries-exhausted) BullMQ job failures only — see
// app/lib/habitQueue.js's worker.on('failed', ...) handler. BullMQ fires
// 'failed' on every failed attempt, not just the last one, so a job that
// fails once then succeeds on retry must not increment this — otherwise a
// critical-alert rule on this metric would fire on routine, self-healing
// retries instead of genuine outages.
export const bullmqJobsFailedTotal = new Counter({
  name: 'bullmq_jobs_failed_total',
  help: 'Count of BullMQ jobs that exhausted all retry attempts',
  labelNames: ['queue'],
  registers: [register],
});

export function metricsMiddleware(req, res, next) {
  const end = httpRequestDuration.startTimer();
  res.on('finish', () => {
    end({
      method: req.method,
      route: req.route?.path ?? req.path,
      status_code: res.statusCode,
    });
  });
  next();
}
