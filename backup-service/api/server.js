import express from 'express';
import multer from 'multer';
import rateLimit from 'express-rate-limit';
import {
  renameSync,
  unlinkSync,
  statSync,
  mkdirSync,
  existsSync,
} from 'node:fs';
import { join, extname, resolve, sep } from 'node:path';
import {
  BACKUP_DIR,
  listManifests,
  getManifestForFile,
  writeUploadedManifest,
} from './manifests.js';
import { resolveBackupPath, inspectUploadedArchive } from './validate.js';
import {
  getCurrentJob,
  isJobRunning,
  triggerBackup,
  triggerRestore,
  reconcileJobStateOnBoot,
} from './jobs.js';

const PORT = process.env.BACKUP_API_PORT || 4100;
const AUTH_TOKEN = process.env.BACKUP_API_SECRET;
const UPLOAD_MAX_MB = parseInt(process.env.BACKUP_UPLOAD_MAX_MB || '2048', 10);

if (!AUTH_TOKEN) {
  // Fail loudly rather than silently serving an unauthenticated backup/restore
  // API on the internal network — this endpoint can wipe the database.
  console.error(
    'FATAL: BACKUP_API_SECRET is not set. Refusing to start the backup API.'
  );
  process.exit(1);
}

reconcileJobStateOnBoot();

const UPLOAD_TMP_DIR = join(BACKUP_DIR, '.tmp-uploads');
mkdirSync(UPLOAD_TMP_DIR, { recursive: true });

const app = express();
app.use(express.json());

app.get('/health', (_req, res) => res.json({ ok: true }));

app.use((req, res, next) => {
  if (req.headers['x-service-auth-token'] !== AUTH_TOKEN) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
});

// Rate limiter for the sensitive, expensive, state-changing endpoints
// (backup/restore/upload). These do heavy I/O and can wipe or overwrite data,
// so cap the request rate even though the API is already auth-gated.
const writeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests — please slow down.' },
});

app.get('/status', (_req, res) => {
  const history = listManifests().slice(0, 30);
  res.json({
    lastBackup: history[0] ?? null,
    history,
    running: isJobRunning(),
  });
});

app.get('/jobs/current', (_req, res) => {
  res.json(getCurrentJob());
});

app.post('/trigger', writeLimiter, (_req, res) => {
  try {
    const jobId = triggerBackup({ reason: 'manual' });
    res.status(202).json({ jobId });
  } catch (err) {
    res.status(err.status ?? 500).json({ error: err.message });
  }
});

app.post('/restore', writeLimiter, (req, res) => {
  const { filename, confirmFilename, acknowledgeWarnings, restoreKeycloak } =
    req.body ?? {};

  if (confirmFilename !== filename) {
    return res
      .status(400)
      .json({ error: 'confirmFilename must exactly match filename.' });
  }

  const absPath = resolveBackupPath(filename);
  if (!absPath || !existsSync(absPath)) {
    return res
      .status(400)
      .json({ error: 'Unknown or invalid backup filename.' });
  }

  const manifest = getManifestForFile(filename);
  if (manifest && !acknowledgeWarnings) {
    const failedComponents = ['mongo', 'lightrag', 'neo4j', 'keycloak'].filter(
      (c) => manifest[`${c}Ok`] === false
    );
    if (failedComponents.length > 0) {
      return res.status(409).json({
        error: 'This backup has known failed/missing components.',
        warnings: failedComponents,
      });
    }
  }

  try {
    const jobId = triggerRestore({
      absPath,
      filename,
      // Default: restore Keycloak for system-generated backups, skip it for
      // uploaded/foreign ones unless explicitly requested.
      restoreKeycloak:
        restoreKeycloak !== undefined
          ? !!restoreKeycloak
          : manifest?.source !== 'uploaded',
    });
    res.status(202).json({ jobId });
  } catch (err) {
    res.status(err.status ?? 500).json({ error: err.message });
  }
});

const upload = multer({
  dest: UPLOAD_TMP_DIR,
  limits: { fileSize: UPLOAD_MAX_MB * 1024 * 1024 },
});

app.post('/upload', writeLimiter, upload.single('file'), (req, res) => {
  const file = req.file;
  if (!file) return res.status(400).json({ error: 'No file uploaded.' });

  // Path barrier (source): multer wrote the upload to a temp path. Resolve it
  // and require it to stay inside UPLOAD_TMP_DIR, so every fs op below uses a
  // path proven not to escape that directory. Inlined (not a helper) because
  // static analysis only recognises the resolve()+startsWith() guard in place.
  const tmpBase = resolve(UPLOAD_TMP_DIR) + sep;
  const srcPath = resolve(file.path);
  if (!srcPath.startsWith(tmpBase)) {
    return res.status(400).json({ error: 'Invalid upload path.' });
  }

  const cleanup = () => {
    try {
      unlinkSync(srcPath);
    } catch {
      // already removed
    }
  };

  const originalExt = extname(file.originalname).toLowerCase();
  if (
    !file.originalname.toLowerCase().endsWith('.tar.gz') &&
    originalExt !== '.tgz'
  ) {
    cleanup();
    return res
      .status(400)
      .json({ error: 'Only .tar.gz backup archives are accepted.' });
  }

  let presence;
  try {
    presence = inspectUploadedArchive(srcPath);
  } catch (err) {
    cleanup();
    return res.status(400).json({ error: err.message });
  }

  const sanitizedName = file.originalname
    .replace(/[^A-Za-z0-9._-]/g, '_')
    .replace(/\.{2,}/g, '_') // collapse any ".." runs so the name can't traverse
    .slice(0, 100);
  const filename = `uploaded_${Date.now()}_${sanitizedName}`.replace(
    /(?:\.tar\.gz|\.tgz)?$/i,
    '.tar.gz'
  );
  // Path barrier (destination): resolve inside BACKUP_DIR and confirm the
  // result stays within it before writing (inlined for the same reason).
  const destBase = resolve(BACKUP_DIR) + sep;
  const finalPath = resolve(BACKUP_DIR, filename);
  if (!finalPath.startsWith(destBase)) {
    cleanup();
    return res.status(400).json({ error: 'Invalid backup filename.' });
  }
  renameSync(srcPath, finalPath);

  const manifest = writeUploadedManifest({
    filename,
    sizeBytes: statSync(finalPath).size,
    presence,
  });

  res.status(201).json({ filename, manifest });
});

app.use((err, _req, res, _next) => {
  if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
    return res
      .status(413)
      .json({ error: `File exceeds the ${UPLOAD_MAX_MB}MB upload limit.` });
  }
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`backup-api listening on :${PORT}`);
});
