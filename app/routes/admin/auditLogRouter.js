import express from 'express';
import { stringify } from 'csv-stringify/sync';
import { makeGetDb } from '../../utils/getDb.js';
import { requireRole } from '../../middleware/requireRole.js';
import { ROLES } from '../../middleware/auth.js';
import { logger } from '../../utils/logger.js';
import { COLLECTION } from '../../models/adminAuditLog.js';

const log = logger.child({ module: 'auditLogRouter' });

/**
 * @param {{ db?: import('mongodb').Db }} deps
 */
/** Hard ceiling on an export, so a stray request cannot pull an unbounded set. */
const EXPORT_MAX_ROWS = 50000;

/**
 * Build the Mongo filter shared by the list and export routes, so the CSV a
 * reviewer downloads always matches the rows they were looking at on screen.
 *
 * `from`/`to` bound `createdAt` — an audit log is normally read for a period
 * ("what happened while participant X was enrolled?"), and without them an
 * export is either everything or an arbitrary tail.
 *
 * @param {Record<string, unknown>} q Express `req.query`
 */
function buildAuditQuery(q) {
  const query = {};
  if (q.resourceType) query.resourceType = String(q.resourceType);
  if (q.byUserId) query.byUserId = String(q.byUserId);
  if (q.action) query.action = String(q.action);

  const range = {};
  const from = q.from ? new Date(String(q.from)) : null;
  const to = q.to ? new Date(String(q.to)) : null;
  if (from && !Number.isNaN(from.getTime())) range.$gte = from;
  if (to && !Number.isNaN(to.getTime())) range.$lte = to;
  if (Object.keys(range).length) query.createdAt = range;

  return query;
}

export function createAuditLogRouter({ db } = {}) {
  const router = express.Router();
  const getDb = makeGetDb(db);

  /**
   * @swagger
   * /admin/audit-log:
   *   get:
   *     summary: List general admin action audit entries
   *     description: >
   *       Paginated, newest first. Covers every mutating admin request except
   *       /backups/* (which has its own dedicated audit log, see
   *       /backups/audit-log).
   *     tags: [Admin]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: query
   *         name: limit
   *         schema: { type: integer, default: 50, maximum: 200 }
   *       - in: query
   *         name: resourceType
   *         schema: { type: string }
   *       - in: query
   *         name: byUserId
   *         schema: { type: string }
   *       - in: query
   *         name: action
   *         schema: { type: string }
   *     responses:
   *       200:
   *         description: Paginated audit entries
   *       403:
   *         description: Caller does not have admin role
   */
  router.get('/audit-log', requireRole(ROLES.ADMIN), async (req, res) => {
    try {
      const database = await getDb();
      const limit = Math.min(
        200,
        Math.max(1, parseInt(req.query.limit, 10) || 50)
      );
      const query = buildAuditQuery(req.query);

      const entries = await database
        .collection(COLLECTION)
        .find(query)
        .sort({ createdAt: -1 })
        .limit(limit)
        .toArray();
      res.json({
        entries: entries.map((e) => ({
          id: e._id.toString(),
          byUsername: e.byUsername,
          method: e.method,
          action: e.action,
          resourceType: e.resourceType,
          resourceId: e.resourceId,
          statusCode: e.statusCode,
          result: e.result,
          detail: e.detail,
          createdAt: e.createdAt,
        })),
      });
    } catch (err) {
      log.error({ err }, 'failed to list admin audit log');
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  /**
   * @swagger
   * /admin/audit-log/export:
   *   get:
   *     summary: Export admin action audit entries as CSV
   *     description: >
   *       Same filters as GET /admin/audit-log, but returns the full matching
   *       set as CSV (capped at 50000 rows) rather than a page. Intended for
   *       compliance review and archival, where the 200-row list cap is not
   *       usable.
   *     tags: [Admin]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: query
   *         name: from
   *         schema: { type: string, format: date-time }
   *       - in: query
   *         name: to
   *         schema: { type: string, format: date-time }
   *       - in: query
   *         name: resourceType
   *         schema: { type: string }
   *       - in: query
   *         name: byUserId
   *         schema: { type: string }
   *       - in: query
   *         name: action
   *         schema: { type: string }
   *     responses:
   *       200:
   *         description: CSV export
   *         content:
   *           text/csv: {}
   *       403:
   *         description: Caller does not have admin role
   */
  router.get(
    '/audit-log/export',
    requireRole(ROLES.ADMIN),
    async (req, res) => {
      try {
        const database = await getDb();
        const entries = await database
          .collection(COLLECTION)
          .find(buildAuditQuery(req.query))
          .sort({ createdAt: -1 })
          .limit(EXPORT_MAX_ROWS)
          .toArray();

        // `byUserId` is included here but not in the JSON list: an archived
        // audit trail needs a stable identifier to join on, whereas the
        // on-screen list only needs something human-readable.
        const records = entries.map((e) => ({
          createdAt: e.createdAt?.toISOString() ?? '',
          byUsername: e.byUsername ?? '',
          byUserId: e.byUserId ?? '',
          method: e.method ?? '',
          action: e.action ?? '',
          resourceType: e.resourceType ?? '',
          resourceId: e.resourceId ?? '',
          statusCode: e.statusCode ?? '',
          result: e.result ?? '',
          detail:
            typeof e.detail === 'string'
              ? e.detail
              : e.detail
                ? JSON.stringify(e.detail)
                : '',
        }));

        const stamp = new Date().toISOString().slice(0, 10);
        res.set({
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="admin-audit-log-${stamp}.csv"`,
        });
        res.send(stringify(records, { header: true }));
      } catch (err) {
        log.error({ err }, 'failed to export admin audit log');
        res.status(500).json({ error: 'Internal server error' });
      }
    }
  );

  return router;
}

export default createAuditLogRouter;
