/**
 * Two Express apps on two ports.
 *
 * The public app (Traefik-routed, Keycloak bearer) and the internal app (HHH
 * only, shared secret, no Traefik label) are separate LISTENERS, not separate
 * path prefixes on one. A Traefik misconfiguration can then never expose the
 * internal API — separation is structural rather than a routing rule someone
 * could get wrong.
 */

import express from 'express';
import pg from 'pg';
import { readFileSync } from 'node:fs';
import pino from 'pino';
import { loadConfig } from './config.js';
import { createAuthMiddleware } from './middleware/auth.js';
import { createAuditor } from './middleware/audit.js';
import { createMailer } from './services/mailer.js';
import { createInternalRouter } from './routes/internal.js';
import { publicLimiter, internalLimiter } from './middleware/rateLimit.js';
import { createPublicRouter } from './routes/public.js';
import { sweepStaleReservations } from './services/linkService.js';
import { expireStaleApprovals } from './services/reidentificationService.js';

/**
 * Request-BODY logging is disabled outright rather than redacted.
 *
 * Redaction lists rot — someone adds a field and forgets the list. Not logging
 * bodies cannot rot. Note also that Sentry is deliberately NOT wired into this
 * service: stack traces capture local variables, which here would mean patient
 * names leaving the trust boundary.
 */
const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  base: { service: 'identity' },
  redact: {
    paths: ['req.headers.authorization', 'req.headers["x-service-auth-token"]'],
    censor: '[redacted]',
  },
});

export async function start() {
  const config = loadConfig();

  const pool = new pg.Pool({
    connectionString: config.databaseUrl,
    max: 10,
    idleTimeoutMillis: 30_000,
  });

  await pool.query('SELECT 1');
  logger.info('identity database reachable');

  const schema = readFileSync(
    new URL('./db/schema.sql', import.meta.url),
    'utf8'
  );
  await pool.query(schema);
  logger.info('identity schema ensured');

  const auditor = createAuditor({ db: pool, keys: config.keys, logger });
  const mailer = createMailer({ smtp: config.smtp, logger });

  /* Public app */
  const publicApp = express();
  publicApp.disable('x-powered-by');
  publicApp.set('trust proxy', 1);
  publicApp.get('/api/v1/health', (_req, res) => res.json({ status: 'ok' }));
  // Before authentication on purpose: a caller with no valid token can still
  // reach token verification, and that must not be the one unlimited path.
  publicApp.use(publicLimiter);
  publicApp.use(createAuthMiddleware(config));
  publicApp.use(auditor.middleware);
  publicApp.use(
    '/api',
    createPublicRouter({ db: pool, keys: config.keys, config, auditor, mailer })
  );

  /* Internal app */
  const internalApp = express();
  internalApp.disable('x-powered-by');
  internalApp.set('trust proxy', 1);
  internalApp.get('/internal/v1/health', (_req, res) =>
    res.json({ status: 'ok' })
  );
  internalApp.use(internalLimiter);
  internalApp.use(
    '/internal',
    createInternalRouter({ db: pool, keys: config.keys, config, auditor })
  );

  // Central error handler on both. Errors are mapped to a code and NEVER echo
  // err.message: a Postgres unique-violation embeds the offending value, which
  // for a blind index is a digest but for anything else could be a name.
  const errorHandler = (err, _req, res, _next) => {
    logger.error(
      { err: { message: err.message, stack: err.stack } },
      'unhandled error'
    );
    if (res.headersSent) return;
    res.status(500).json({ error: 'internal_error' });
  };
  publicApp.use(errorHandler);
  internalApp.use(errorHandler);

  const publicServer = publicApp.listen(config.publicPort, () =>
    logger.info({ port: config.publicPort }, 'public API listening')
  );
  const internalServer = internalApp.listen(config.internalPort, () =>
    logger.info({ port: config.internalPort }, 'internal API listening')
  );

  /**
   * Sweepers. The reservation sweeper is not optional — without it a crash
   * between reserve and confirm burns a code permanently and the participant
   * needs a nurse to issue a replacement.
   */
  const sweeper = setInterval(async () => {
    try {
      const { reclaimed } = await sweepStaleReservations({
        db: pool,
        ttlMinutes: config.reservationTtlMinutes,
      });
      if (reclaimed > 0)
        logger.warn({ reclaimed }, 'reclaimed stale reservations');
      const { expired } = await expireStaleApprovals({ db: pool });
      if (expired > 0)
        logger.info({ expired }, 'expired re-identification grants');
    } catch (err) {
      logger.error({ err }, 'sweeper failed');
    }
  }, 60_000);
  sweeper.unref?.();

  async function shutdown() {
    clearInterval(sweeper);
    await new Promise((r) => publicServer.close(r));
    await new Promise((r) => internalServer.close(r));
    await pool.end();
  }

  process.on('SIGTERM', () => void shutdown().then(() => process.exit(0)));
  process.on('SIGINT', () => void shutdown().then(() => process.exit(0)));

  return { publicApp, internalApp, pool, shutdown };
}

// Only start when run directly, so tests can import without listening.
if (
  process.argv[1] &&
  import.meta.url.endsWith(process.argv[1].split('/').pop())
) {
  start().catch((err) => {
    logger.fatal({ err: { message: err.message } }, 'failed to start');
    process.exit(1);
  });
}
