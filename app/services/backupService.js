/**
 * Thin client for the internal backup-api HTTP service running inside the
 * `hhh-backup` container. Reachable only over the internal `hhh-proxy`
 * Docker network (never published to the host), authenticated with a shared
 * secret — mirrors the existing backend→API-service proxy pattern in
 * `app/routes/recommendRouter.js` (native fetch, AbortSignal.timeout,
 * X-Service-Auth-Token header).
 */

// Read lazily (not as module-level consts) so tests can point this client at
// a fake server by setting env vars before each call, and so a runtime env
// change is never masked by an import-time snapshot.
function backupApiUrl() {
  return process.env.BACKUP_API_URL ?? 'http://backup:4100';
}
function backupApiSecret() {
  return process.env.BACKUP_API_SECRET ?? '';
}
function timeoutMs() {
  return parseInt(process.env.BACKUP_API_TIMEOUT_MS ?? '10000', 10);
}

async function call(path, { method = 'GET', body } = {}) {
  const res = await fetch(`${backupApiUrl()}${path}`, {
    method,
    headers: {
      'X-Service-Auth-Token': backupApiSecret(),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(timeoutMs()),
  });
  const text = await res.text();
  let data = {};
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { error: 'backup-api returned a non-JSON response' };
    }
  }
  if (!res.ok) {
    const err = new Error(data.error ?? `backup-api HTTP ${res.status}`);
    err.status = res.status;
    err.warnings = data.warnings;
    throw err;
  }
  return data;
}

/**
 * Streams a backup archive from backup-api. Returns the raw fetch Response
 * (not parsed) so the caller can pipe its body straight through to the HTTP
 * response without buffering a potentially multi-GB file in memory.
 * @param {string} filename
 * @returns {Promise<Response>}
 */
export async function downloadBackup(filename) {
  const res = await fetch(
    `${backupApiUrl()}/download/${encodeURIComponent(filename)}`,
    {
      headers: { 'X-Service-Auth-Token': backupApiSecret() },
      // Large archives can take a while to transfer even internally —
      // give this a much longer floor than the other, small JSON calls.
      signal: AbortSignal.timeout(Math.max(timeoutMs(), 10 * 60_000)),
    }
  );
  if (!res.ok) {
    let message = `backup-api HTTP ${res.status}`;
    try {
      const data = await res.json();
      if (data.error) message = data.error;
    } catch {
      // non-JSON error body — keep the generic message
    }
    const err = new Error(message);
    err.status = res.status;
    throw err;
  }
  return res;
}

export function getBackupStatus() {
  return call('/status');
}

export function getCurrentBackupJob() {
  return call('/jobs/current');
}

export function triggerBackupNow() {
  return call('/trigger', { method: 'POST' });
}

export function deleteBackup(filename) {
  return call(`/${encodeURIComponent(filename)}`, { method: 'DELETE' });
}

export function triggerRestore({
  filename,
  acknowledgeWarnings,
  restoreKeycloak,
}) {
  return call(`/restore`, {
    method: 'POST',
    body: {
      filename,
      confirmFilename: filename,
      acknowledgeWarnings,
      restoreKeycloak,
    },
  });
}

/**
 * Forwards a browser-uploaded file to backup-api's /upload as multipart form
 * data. `fileBuffer` is a Node Buffer (from multer's memory storage).
 */
export async function uploadBackup({ fileBuffer, originalName }) {
  const form = new FormData();
  form.append(
    'file',
    new Blob([fileBuffer], { type: 'application/gzip' }),
    originalName
  );
  const res = await fetch(`${backupApiUrl()}/upload`, {
    method: 'POST',
    headers: { 'X-Service-Auth-Token': backupApiSecret() },
    body: form,
    signal: AbortSignal.timeout(Math.max(timeoutMs(), 60_000)),
  });
  const text = await res.text();
  let data = {};
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { error: 'backup-api returned a non-JSON response' };
    }
  }
  if (!res.ok) {
    const err = new Error(data.error ?? `backup-api HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return data;
}
