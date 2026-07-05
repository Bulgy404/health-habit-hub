/**
 * Maintenance-mode guard: while a backup restore is in flight, the rest of
 * the API refuses writes/reads with 503 so nothing races the database being
 * dropped and reloaded underneath it. Only the Backups admin routes
 * themselves (status/job polling) stay reachable so the admin UI can keep
 * showing progress.
 *
 * The flag lives in the existing `admin_settings` collection under a key
 * that is intentionally NOT in the generic settings API's editable-key
 * allowlist (`app/services/adminStatsService.js`) — it must only ever be
 * set by the restore orchestration in `backupsRouter.js`, never directly by
 * an admin via `PUT /admin/settings/:key`.
 */

const MAINTENANCE_KEY = 'maintenanceMode';
const EXEMPT_PREFIX = '/admin/backups';

/** Sets or clears the maintenance flag. */
export async function setMaintenanceMode(db, on) {
  await db
    .collection('admin_settings')
    .updateOne(
      { key: MAINTENANCE_KEY },
      { $set: { value: !!on, updatedAt: new Date() } },
      { upsert: true }
    );
}

/**
 * Express middleware factory. Mount after JWT auth so unauthenticated
 * requests still get 401 rather than a misleading 503.
 * @param {{ getDb: () => Promise<object> }} deps
 */
export function maintenanceModeGuard({ getDb }) {
  return async (req, res, next) => {
    if (req.path.startsWith(EXEMPT_PREFIX)) return next();
    try {
      const database = await getDb();
      const setting = await database
        .collection('admin_settings')
        .findOne({ key: MAINTENANCE_KEY });
      if (setting?.value === true) {
        return res.status(503).json({
          error:
            'The system is restoring from a backup. Please try again shortly.',
        });
      }
    } catch {
      // If the flag lookup itself fails, fail open — a broken settings read
      // must not take the whole API down on top of it.
    }
    next();
  };
}
