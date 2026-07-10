import { logger } from '../utils/logger.js';

const log = logger.child({ module: 'auditAdminActions' });

const AUDITED_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Express middleware that writes an `admin_audit_log` entry for every
 * mutating admin request, so admin actions have a trail beyond just Backups
 * (see backupAuditLog.js, which has its own richer job-lifecycle log this
 * middleware deliberately does not duplicate — /backups/* is skipped).
 *
 * Mount once, early, in createAdminRouter — before the domain sub-routers —
 * so every current and future admin route is covered without per-router
 * wiring. Listens on the 'finish' event so it captures the real outcome
 * (including failed/forbidden attempts, which are themselves a meaningful
 * audit signal), and never blocks or alters the response: a failed audit
 * write is logged and swallowed.
 *
 * A route handler can set `res.locals.auditAction`, `res.locals.auditResourceType`,
 * and `res.locals.auditResourceId` before responding for a human-readable
 * label; otherwise a generic "METHOD /path" label is used.
 *
 * @param {{ getDb: () => Promise<import('mongodb').Db> }} deps
 */
export function createAuditAdminActionsMiddleware({ getDb }) {
  return function auditAdminActions(req, res, next) {
    if (!AUDITED_METHODS.has(req.method) || req.path.startsWith('/backups')) {
      return next();
    }

    res.on('finish', () => {
      (async () => {
        try {
          const database = await getDb();
          await database.collection('admin_audit_log').insertOne({
            byUserId: req.user?.sub ?? 'unknown',
            byUsername: req.user?.preferred_username ?? req.user?.sub ?? 'unknown',
            method: req.method,
            action: res.locals.auditAction ?? `${req.method} ${req.path}`,
            resourceType: res.locals.auditResourceType ?? null,
            resourceId: res.locals.auditResourceId ?? null,
            statusCode: res.statusCode,
            result: res.statusCode < 400 ? 'succeeded' : 'failed',
            detail: res.statusCode >= 400 ? (res.locals.auditDetail ?? null) : null,
            createdAt: new Date(),
          });
        } catch (err) {
          // The audit write failing must never affect the already-sent
          // response — log and move on.
          log.error({ err }, 'failed to write admin audit log entry');
        }
      })();
    });

    next();
  };
}
