import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, createWriteStream } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { BACKUP_DIR } from './manifests.js';

const JOB_STATE_FILE = join(BACKUP_DIR, '.job_state.json');
const MAX_CAPTURED_OUTPUT = 200_000; // cap in-memory output kept for parsing

function readJobState() {
  try {
    return JSON.parse(readFileSync(JOB_STATE_FILE, 'utf8'));
  } catch {
    return null;
  }
}

function writeJobState(state) {
  writeFileSync(JOB_STATE_FILE, JSON.stringify(state, null, 2));
}

function isPidAlive(pid) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * On boot, if the last recorded job claims to still be running but its PID
 * is dead (the container was killed/restarted mid-job), mark it interrupted
 * rather than leaving the UI showing a job that will never finish.
 */
export function reconcileJobStateOnBoot() {
  const state = readJobState();
  if (!state) return;
  if (['running', 'pre_restore_safety', 'restoring'].includes(state.phase)) {
    if (!isPidAlive(state.pid)) {
      state.phase = 'failed';
      state.error = 'Interrupted — the backup container restarted mid-job.';
      state.finishedAt = new Date().toISOString();
      writeJobState(state);
    }
  }
}

/** Returns the current job state, or null if none has ever run. */
export function getCurrentJob() {
  return readJobState();
}

/** True if a job is currently in an in-progress phase with a live process. */
export function isJobRunning() {
  const state = readJobState();
  if (!state) return false;
  return (
    ['running', 'pre_restore_safety', 'restoring'].includes(state.phase) &&
    isPidAlive(state.pid)
  );
}

// backup.sh logs each stage as "[<timestamp>] N/5 <description>..." (see
// log() in backup.sh) — reused here to drive a live progress bar instead of
// parsing anything script-specific to this API.
const STEP_MARKER_RE = /\]\s+(\d+)\/(\d+)\s+([^\n]+)/g;

/** Returns the last (step, totalSteps, label) marker found in `output`, or null. */
function extractLatestStep(output) {
  let match;
  let last = null;
  STEP_MARKER_RE.lastIndex = 0;
  while ((match = STEP_MARKER_RE.exec(output))) {
    last = {
      step: Number(match[1]),
      totalSteps: Number(match[2]),
      stepLabel: match[3].trim().replace(/\.\.\.$/, ''),
    };
  }
  return last;
}

function runScript(scriptPath, args, env, { stdinPayload, onOutput } = {}) {
  const logStream = createWriteStream(
    join(BACKUP_DIR, `job_${Date.now()}.log`)
  );
  const child = spawn('bash', [scriptPath, ...args], {
    env: { ...process.env, ...env },
    stdio: [stdinPayload !== undefined ? 'pipe' : 'ignore', 'pipe', 'pipe'],
  });

  let output = '';
  const capture = (chunk) => {
    logStream.write(chunk);
    output += chunk.toString('utf8');
    if (output.length > MAX_CAPTURED_OUTPUT) {
      output = output.slice(output.length - MAX_CAPTURED_OUTPUT);
    }
    onOutput?.(output);
  };
  child.stdout.on('data', capture);
  child.stderr.on('data', capture);

  if (stdinPayload !== undefined) {
    child.stdin.write(stdinPayload);
    child.stdin.end();
  }

  const donePromise = new Promise((resolve) => {
    child.on('close', (exitCode) => {
      logStream.end();
      resolve({ exitCode: exitCode ?? 1, output });
    });
  });

  return { pid: child.pid, donePromise };
}

/** Parses backup.sh's stdout for the archive filename it just created. */
function extractCreatedFilename(output) {
  const match = output.match(/File:\s+(full_backup_[0-9_]+\.tar\.gz)/);
  return match ? match[1] : null;
}

/**
 * Parses restore.sh's stdout for a per-component ✓/ERROR outcome. Never
 * trust the bare exit code alone for something this destructive — restore.sh
 * prints one of "✓ <thing> restored"/"ERROR: <Component> - ..." per step.
 */
function parseRestoreResult(output) {
  const check = (label) => {
    if (new RegExp(`ERROR:\\s*${label}\\s*-`, 'i').test(output)) return false;
    if (new RegExp(`✓\\s*${label}`, 'i').test(output)) return true;
    return null; // not present in the archive / not attempted
  };
  return {
    mongo: check('MongoDB'),
    lightrag: check('LightRAG'),
    neo4j: check('Neo4j'),
    keycloak: check('Keycloak'),
  };
}

/**
 * Maps a { mongo, neo4j, lightrag, keycloak } services-selection object (any
 * key may be omitted — omitted means "include") to the BACKUP_INCLUDE_* env
 * vars backup.sh reads. Absent by default: every component included, same as
 * before this option existed.
 */
function includeEnvFromServices(services) {
  const include = (key) => (services?.[key] === false ? 'false' : 'true');
  return {
    BACKUP_INCLUDE_MONGO: include('mongo'),
    BACKUP_INCLUDE_NEO4J: include('neo4j'),
    BACKUP_INCLUDE_LIGHTRAG: include('lightrag'),
    BACKUP_INCLUDE_KEYCLOAK: include('keycloak'),
  };
}

/** Triggers a backup.sh run in the background. Throws if one is already running. */
export function triggerBackup({ reason = 'manual', services } = {}) {
  if (isJobRunning()) {
    const err = new Error('A backup or restore is already running.');
    err.status = 409;
    throw err;
  }
  const jobId = randomUUID();
  let lastStep = 0;
  const { pid, donePromise } = runScript(
    '/backup.sh',
    [],
    { BACKUP_TRIGGER: reason, ...includeEnvFromServices(services) },
    {
      onOutput: (output) => {
        const progress = extractLatestStep(output);
        if (!progress || progress.step === lastStep) return;
        lastStep = progress.step;
        const latest = readJobState();
        if (!latest || latest.jobId !== jobId) return; // superseded
        writeJobState({ ...latest, ...progress });
      },
    }
  );
  const state = {
    jobId,
    type: 'backup',
    reason,
    services: services ?? null,
    phase: 'running',
    pid,
    startedAt: new Date().toISOString(),
  };
  writeJobState(state);

  donePromise.then(({ exitCode, output }) => {
    const latest = readJobState();
    if (!latest || latest.jobId !== jobId) return; // superseded
    latest.phase = exitCode === 0 ? 'done' : 'failed';
    latest.exitCode = exitCode;
    latest.createdFile = extractCreatedFilename(output);
    latest.finishedAt = new Date().toISOString();
    writeJobState(latest);
  });

  return jobId;
}

/**
 * Runs a safety backup, then (only if it succeeds) restores from the given
 * absolute backup path — as one sequential background job so the UI can
 * follow it as a single unit of work with clear phases.
 */
export function triggerRestore({ absPath, filename, restoreKeycloak }) {
  if (isJobRunning()) {
    const err = new Error('A backup or restore is already running.');
    err.status = 409;
    throw err;
  }
  const jobId = randomUUID();
  const state = {
    jobId,
    type: 'restore',
    targetFilename: filename,
    phase: 'pre_restore_safety',
    pid: process.pid, // placeholder until the child spawns; keeps isJobRunning() true
    startedAt: new Date().toISOString(),
  };
  writeJobState(state);

  (async () => {
    let lastStep = 0;
    const safety = runScript(
      '/backup.sh',
      [],
      { BACKUP_TRIGGER: 'pre_restore_safety' },
      {
        onOutput: (output) => {
          const progress = extractLatestStep(output);
          if (!progress || progress.step === lastStep) return;
          lastStep = progress.step;
          const current = readJobState();
          if (!current || current.jobId !== jobId) return;
          writeJobState({ ...current, ...progress });
        },
      }
    );
    let latest = readJobState();
    if (!latest || latest.jobId !== jobId) return;
    latest.pid = safety.pid;
    writeJobState(latest);

    const safetyResult = await safety.donePromise;
    latest = readJobState();
    if (!latest || latest.jobId !== jobId) return;

    if (safetyResult.exitCode !== 0) {
      latest.phase = 'failed';
      latest.error =
        'Pre-restore safety backup failed — restore was NOT attempted. Check the safety backup logs before retrying.';
      latest.finishedAt = new Date().toISOString();
      writeJobState(latest);
      return;
    }
    latest.safetyBackupFile = extractCreatedFilename(safetyResult.output);
    latest.phase = 'restoring';
    // restore.sh has no step markers to parse — clear the safety backup's
    // progress so the UI doesn't keep showing a stale "5/5" during restore.
    delete latest.step;
    delete latest.totalSteps;
    delete latest.stepLabel;
    writeJobState(latest);

    const restoreArgs = restoreKeycloak === false ? [absPath, '--skip-keycloak'] : [absPath];
    const restore = runScript('/restore.sh', restoreArgs, {}, { stdinPayload: 'YES\n' });
    latest = readJobState();
    if (!latest || latest.jobId !== jobId) return;
    latest.pid = restore.pid;
    writeJobState(latest);

    const restoreResult = await restore.donePromise;
    latest = readJobState();
    if (!latest || latest.jobId !== jobId) return;
    latest.phase = restoreResult.exitCode === 0 ? 'done' : 'failed';
    latest.exitCode = restoreResult.exitCode;
    latest.result = parseRestoreResult(restoreResult.output);
    latest.finishedAt = new Date().toISOString();
    writeJobState(latest);
  })();

  return jobId;
}

export function jobStateFileExists() {
  return existsSync(JOB_STATE_FILE);
}
