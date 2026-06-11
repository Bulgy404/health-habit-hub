import { logger } from './logger.js';

const log = logger.child({ module: 'errorReporting' });

let _sentry = null;

/**
 * Initialise Sentry error reporting when `SENTRY_DSN` is set; a silent no-op
 * otherwise (local dev, CI). Import is dynamic so the SDK is never loaded —
 * and adds zero overhead — without a DSN.
 *
 * Privacy: `sendDefaultPii` stays false and request bodies are never attached
 * — only the error, stack trace, route, and release reach Sentry. Participant
 * data must not leave the TU Dresden infrastructure unless the DSN points at
 * a self-hosted Sentry instance (recommended; see DEPLOYMENT.md).
 *
 * @returns {Promise<object|null>} the Sentry module, or null when disabled.
 */
export async function initErrorReporting() {
  const dsn = (process.env.SENTRY_DSN ?? '').trim();
  if (!dsn) {
    log.info('SENTRY_DSN not set — error reporting disabled');
    return null;
  }
  try {
    const Sentry = await import('@sentry/node');
    Sentry.init({
      dsn,
      environment: process.env.NODE_ENV || 'development',
      release: process.env.APP_RELEASE || undefined,
      sendDefaultPii: false,
      tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0),
      beforeSend(event) {
        // Defense-in-depth: strip anything request-body-like.
        if (event.request) {
          delete event.request.data;
          delete event.request.cookies;
        }
        return event;
      },
    });
    _sentry = Sentry;
    log.info('Sentry error reporting initialised');
    return Sentry;
  } catch (err) {
    log.warn({ err }, 'Sentry init failed — continuing without reporting');
    return null;
  }
}

/**
 * Express error-handling middleware: reports unexpected errors to Sentry
 * (when enabled) and returns a generic 500. Mount AFTER all routes.
 */
export function errorReportingMiddleware() {
  // eslint-disable-next-line no-unused-vars -- Express identifies error middleware by arity
  return (err, req, res, next) => {
    log.error({ err, path: req.path }, 'unhandled error');
    if (_sentry) {
      _sentry.captureException(err, {
        tags: { path: req.path, method: req.method },
      });
    }
    if (res.headersSent) return;
    res.status(500).json({ error: 'Internal server error' });
  };
}

/** Report a caught exception manually (no-op when Sentry is disabled). */
export function captureException(err, context = {}) {
  if (_sentry) _sentry.captureException(err, { extra: context });
}
