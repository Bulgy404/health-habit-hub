import express from 'express';
import { makeGetDb } from '../../utils/getDb.js';
import { requireRole } from '../../middleware/requireRole.js';
import { ROLES } from '../../middleware/auth.js';
import { logger } from '../../utils/logger.js';
import { COLLECTION } from '../../models/adminAuditLog.js';

const log = logger.child({ module: 'auditLogRouter' });

/**
 * @param {{ db?: import('mongodb').Db }} deps
 */
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
      const query = {};
      if (req.query.resourceType) query.resourceType = req.query.resourceType;
      if (req.query.byUserId) query.byUserId = req.query.byUserId;
      if (req.query.action) query.action = req.query.action;

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

  return router;
}

export default createAuditLogRouter;
