import express from 'express';
import { makeGetDb } from '../../utils/getDb.js';
import { requireRole } from '../../middleware/requireRole.js';
import { ROLES } from '../../middleware/auth.js';
import { logger } from '../../utils/logger.js';
import { COLLECTION } from '../../models/restoreAttempt.js';

const log = logger.child({ module: 'restoreAttemptsRouter' });

// An IP with this many non-success attempts inside FLAG_WINDOW_MS is
// surfaced as "flagged" in the admin panel — a signal worth a human look
// even though it's still under the route's own 5/hour rate-limit threshold
// (e.g. 3-4 failed attempts, or a mix of failures across the window).
const FLAG_THRESHOLD = 3;
const FLAG_WINDOW_MS = 60 * 60 * 1000;

/**
 * @param {{ db?: import('mongodb').Db }} deps
 */
export function createRestoreAttemptsRouter({ db } = {}) {
  const router = express.Router();
  const getDb = makeGetDb(db);

  /**
   * @swagger
   * /admin/restore-attempts:
   *   get:
   *     summary: List passphrase-based account-restore attempts
   *     description: >
   *       Paginated, newest first. Security-monitoring view over every
   *       POST /restore call (success and failure), plus a list of IPs
   *       currently flagged for repeated non-success attempts in the last
   *       hour — a signal the per-IP rate limiter alone doesn't surface.
   *     tags: [Admin]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: query
   *         name: page
   *         schema: { type: integer, default: 1 }
   *       - in: query
   *         name: limit
   *         schema: { type: integer, default: 50, maximum: 200 }
   *       - in: query
   *         name: outcome
   *         schema: { type: string }
   *       - in: query
   *         name: ip
   *         schema: { type: string }
   *     responses:
   *       200:
   *         description: Paginated restore attempts, plus currently flagged IPs
   *       403:
   *         description: Caller does not have admin role
   */
  router.get(
    '/restore-attempts',
    requireRole(ROLES.ADMIN),
    async (req, res) => {
      try {
        const database = await getDb();
        const col = database.collection(COLLECTION);

        const page = Math.max(1, parseInt(req.query.page, 10) || 1);
        const limit = Math.min(
          200,
          Math.max(1, parseInt(req.query.limit, 10) || 50)
        );
        const query = {};
        if (req.query.outcome) query.outcome = String(req.query.outcome);
        if (req.query.ip) query.ip = String(req.query.ip);

        const [entries, total, flaggedIps] = await Promise.all([
          col
            .find(query)
            .sort({ createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(limit)
            .toArray(),
          col.countDocuments(query),
          col
            .aggregate([
              {
                $match: {
                  outcome: { $ne: 'success' },
                  createdAt: { $gte: new Date(Date.now() - FLAG_WINDOW_MS) },
                },
              },
              {
                $group: {
                  _id: '$ip',
                  failCount: { $sum: 1 },
                  lastAttemptAt: { $max: '$createdAt' },
                },
              },
              { $match: { failCount: { $gte: FLAG_THRESHOLD } } },
              { $sort: { failCount: -1 } },
              { $limit: 20 },
            ])
            .toArray(),
        ]);

        res.json({
          entries: entries.map((e) => ({
            id: e._id.toString(),
            ip: e.ip,
            usernameAttempted: e.usernameAttempted ?? null,
            outcome: e.outcome,
            createdAt: e.createdAt,
          })),
          total,
          page,
          limit,
          flaggedIps: flaggedIps.map((f) => ({
            ip: f._id,
            failCount: f.failCount,
            lastAttemptAt: f.lastAttemptAt,
          })),
        });
      } catch (err) {
        log.error({ err }, 'failed to list restore attempts');
        res.status(500).json({ error: 'Internal server error' });
      }
    }
  );

  return router;
}

export default createRestoreAttemptsRouter;
