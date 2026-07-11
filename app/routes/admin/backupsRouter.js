import express from 'express';
import multer from 'multer';
import { randomBytes } from 'node:crypto';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { makeGetDb } from '../../utils/getDb.js';
import { requireRole } from '../../middleware/requireRole.js';
import { ROLES } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import {
  restoreBackupSchema,
  triggerBackupSchema,
} from '../../schemas/adminSchemas.js';
import { setMaintenanceMode } from '../../middleware/maintenanceMode.js';
import {
  COLLECTION as RESTORE_TOKENS_COLLECTION,
  TOKEN_TTL_MS,
} from '../../models/restoreConfirmationToken.js';
import { COLLECTION as BACKUP_AUDIT_COLLECTION } from '../../models/backupAuditLog.js';
import {
  getBackupStatus,
  getCurrentBackupJob,
  triggerBackupNow,
  triggerRestore,
  uploadBackup,
  downloadBackup,
  deleteBackup,
} from '../../services/backupService.js';
import { logger } from '../../utils/logger.js';

const log = logger.child({ module: 'backupsRouter' });

const UPLOAD_MAX_MB = parseInt(process.env.BACKUP_UPLOAD_MAX_MB ?? '2048', 10);
const RESTORE_WATCH_MAX_MS = 30 * 60 * 1000; // safety cap: never leave maintenance mode stuck on

function actorFrom(req) {
  return {
    byUserId: req.user?.sub ?? 'unknown',
    byUsername: req.user?.preferred_username ?? req.user?.sub ?? 'unknown',
  };
}

async function writeAudit(db, { req, action, filename, result, detail }) {
  try {
    await db.collection(BACKUP_AUDIT_COLLECTION).insertOne({
      ...actorFrom(req),
      action,
      filename: filename ?? null,
      result,
      detail: detail ?? null,
      createdAt: new Date(),
    });
  } catch (err) {
    // The audit write failing must never block the actual backup/restore
    // action from being reported to the caller — log and move on.
    log.error({ err }, 'failed to write backup audit log entry');
  }
}

/**
 * Polls the backup-api job status until the restore reaches a terminal
 * phase, then writes a follow-up audit entry (the initial "requested" entry
 * is never mutated — see backupAuditLog.js) and clears maintenance mode. A
 * hard deadline guarantees maintenance mode is never left stuck on if the
 * app process loses track of the job for any reason.
 */
function watchRestoreJob({
  db,
  filename,
  deadline = Date.now() + RESTORE_WATCH_MAX_MS,
}) {
  setTimeout(async () => {
    let job = null;
    try {
      job = await getCurrentBackupJob();
    } catch (err) {
      log.error(
        { err },
        'failed to poll backup job status while watching restore'
      );
    }

    const isTargetJob =
      job?.type === 'restore' && job.targetFilename === filename;
    const isTerminal = isTargetJob && ['done', 'failed'].includes(job.phase);

    if (isTerminal || Date.now() > deadline) {
      if (isTerminal) {
        await writeAudit(db, {
          req: {
            user: {
              sub: 'system',
              preferred_username: 'system (restore watcher)',
            },
          },
          action: 'restore',
          filename,
          result: job.phase === 'done' ? 'succeeded' : 'failed',
          detail: job.error ?? JSON.stringify(job.result ?? {}),
        });
      } else {
        log.error(
          { filename },
          'restore watch deadline exceeded — force-clearing maintenance mode'
        );
      }
      await setMaintenanceMode(db, false);
      return;
    }

    watchRestoreJob({ db, filename, deadline });
  }, 3000).unref?.();
}

export function createBackupsRouter({ db } = {}) {
  const router = express.Router();
  const getDb = makeGetDb(db);
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: UPLOAD_MAX_MB * 1024 * 1024 },
  });

  // Every route here is admin-only — backups are considered too sensitive
  // for the researcher role, unlike most other admin data. Scoped to
  // '/backups' (not a bare router.use(...)): this router is mounted at '/'
  // in adminRouter.js, so an unscoped gate would run for every request that
  // falls through to this mount point — including sibling admin sub-resources
  // mounted separately in apiRouter.js (e.g. /admin/cue-pools) — wrongly
  // 403ing non-admin roles for paths this router doesn't even own.
  router.use('/backups', requireRole(ROLES.ADMIN));

  router.get('/backups/status', async (_req, res) => {
    try {
      res.json(await getBackupStatus());
    } catch (err) {
      log.error({ err }, 'failed to fetch backup status');
      res.status(err.status ?? 502).json({ error: err.message });
    }
  });

  router.get('/backups/jobs/current', async (_req, res) => {
    try {
      res.json(await getCurrentBackupJob());
    } catch (err) {
      log.error({ err }, 'failed to fetch current backup job');
      res.status(err.status ?? 502).json({ error: err.message });
    }
  });

  router.get('/backups/:filename/download', async (req, res) => {
    const { filename } = req.params;
    try {
      const upstream = await downloadBackup(filename);
      res.set({
        'Content-Type': 'application/gzip',
        'Content-Disposition': `attachment; filename="${filename}"`,
      });
      const contentLength = upstream.headers.get('content-length');
      if (contentLength) res.set('Content-Length', contentLength);
      const database = await getDb();
      await writeAudit(database, {
        req,
        action: 'download',
        filename,
        result: 'succeeded',
      });
      await pipeline(Readable.fromWeb(upstream.body), res);
    } catch (err) {
      log.error({ err, filename }, 'failed to download backup');
      if (!res.headersSent) {
        res.status(err.status ?? 502).json({ error: err.message });
      } else {
        res.destroy(err);
      }
    }
  });

  router.delete('/backups/:filename', async (req, res) => {
    const { filename } = req.params;
    const database = await getDb();
    await writeAudit(database, {
      req,
      action: 'delete',
      filename,
      result: 'requested',
    });
    try {
      const result = await deleteBackup(filename);
      await writeAudit(database, {
        req,
        action: 'delete',
        filename,
        result: 'succeeded',
      });
      res.json(result);
    } catch (err) {
      await writeAudit(database, {
        req,
        action: 'delete',
        filename,
        result: 'failed',
        detail: err.message,
      });
      res.status(err.status ?? 502).json({ error: err.message });
    }
  });

  router.post('/backups/trigger', async (req, res) => {
    const database = await getDb();
    await writeAudit(database, { req, action: 'trigger', result: 'requested' });
    try {
      const result = await triggerBackupNow();
      await writeAudit(database, {
        req,
        action: 'trigger',
        result: 'succeeded',
      });
      res.status(202).json(result);
    } catch (err) {
      await writeAudit(database, {
        req,
        action: 'trigger',
        result: 'failed',
        detail: err.message,
      });
      res.status(err.status ?? 502).json({ error: err.message });
    }
  });

  router.post('/backups/upload', upload.single('file'), async (req, res) => {
    const database = await getDb();
    const file = req.file;
    if (!file) return res.status(400).json({ error: 'No file uploaded.' });
    if (!/\.(tar\.gz|tgz)$/i.test(file.originalname)) {
      return res
        .status(400)
        .json({ error: 'Only .tar.gz backup archives are accepted.' });
    }

    await writeAudit(database, {
      req,
      action: 'upload',
      filename: file.originalname,
      result: 'requested',
    });
    try {
      const result = await uploadBackup({
        fileBuffer: file.buffer,
        originalName: file.originalname,
      });
      await writeAudit(database, {
        req,
        action: 'upload',
        filename: result.filename,
        result: 'succeeded',
      });
      res.status(201).json(result);
    } catch (err) {
      await writeAudit(database, {
        req,
        action: 'upload',
        filename: file.originalname,
        result: 'failed',
        detail: err.message,
      });
      res.status(err.status ?? 400).json({ error: err.message });
    }
  });

  router.post('/backups/:filename/restore-token', async (req, res) => {
    try {
      const database = await getDb();
      const { filename } = req.params;
      const token = randomBytes(24).toString('hex');
      const now = new Date();
      const expiresAt = new Date(now.getTime() + TOKEN_TTL_MS);
      await database.collection(RESTORE_TOKENS_COLLECTION).insertOne({
        token,
        filename,
        byUserId: req.user.sub,
        createdAt: now,
        expiresAt,
      });
      res.status(201).json({ token, expiresAt });
    } catch (err) {
      log.error({ err }, 'failed to issue restore confirmation token');
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  router.post(
    '/backups/:filename/restore',
    validate(restoreBackupSchema),
    async (req, res) => {
      const { filename } = req.params;
      const {
        confirmFilename,
        restoreToken,
        acknowledgeWarnings,
        restoreKeycloak,
      } = req.body;

      if (confirmFilename !== filename) {
        return res.status(400).json({
          error: 'confirmFilename must exactly match the target filename.',
        });
      }

      const database = await getDb();
      // Coerce every user-derived value to a string so a JSON body can't smuggle
      // a query operator (e.g. { "$ne": null }) into the lookup (NoSQL injection).
      const tokenDoc = await database
        .collection(RESTORE_TOKENS_COLLECTION)
        .findOne({
          token: String(restoreToken),
          filename: String(filename),
          byUserId: String(req.user.sub),
          expiresAt: { $gt: new Date() },
        });
      if (!tokenDoc) {
        return res.status(400).json({
          error:
            'Invalid or expired restore confirmation token — request a new one and retry.',
        });
      }
      await database
        .collection(RESTORE_TOKENS_COLLECTION)
        .deleteOne({ _id: tokenDoc._id }); // single-use

      await writeAudit(database, {
        req,
        action: 'restore',
        filename,
        result: 'requested',
      });
      try {
        const result = await triggerRestore({
          filename,
          acknowledgeWarnings,
          restoreKeycloak,
        });
        await setMaintenanceMode(database, true);
        watchRestoreJob({ db: database, filename });
        res.status(202).json(result);
      } catch (err) {
        await writeAudit(database, {
          req,
          action: 'restore',
          filename,
          result: 'failed',
          detail: err.message,
        });
        res
          .status(err.status ?? 502)
          .json({ error: err.message, warnings: err.warnings });
      }
    }
  );

  router.get('/backups/audit-log', async (req, res) => {
    try {
      const database = await getDb();
      const limit = Math.min(
        200,
        Math.max(1, parseInt(req.query.limit, 10) || 50)
      );
      const entries = await database
        .collection(BACKUP_AUDIT_COLLECTION)
        .find({})
        .sort({ createdAt: -1 })
        .limit(limit)
        .toArray();
      res.json({
        entries: entries.map((e) => ({
          id: e._id.toString(),
          byUsername: e.byUsername,
          action: e.action,
          filename: e.filename,
          result: e.result,
          detail: e.detail,
          createdAt: e.createdAt,
        })),
      });
    } catch (err) {
      log.error({ err }, 'failed to list backup audit log');
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Multer throws for oversized uploads before our route handler runs — give
  // a specific, actionable message instead of falling through to a generic
  // 500 from whatever error handler is mounted further up the stack.
  router.use((err, _req, res, next) => {
    if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
      return res
        .status(413)
        .json({ error: `File exceeds the ${UPLOAD_MAX_MB}MB upload limit.` });
    }
    next(err);
  });

  return router;
}
