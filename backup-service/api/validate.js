import { execFileSync } from 'node:child_process';
import { resolve, sep, join } from 'node:path';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { BACKUP_DIR } from './manifests.js';

// No "/" in the character classes below by design — see resolveBackupPath,
// which rejects any path separator outright before this ever runs. (An
// earlier version of this regex used ".*" here, which — being unanchored to
// "no slashes" — would have matched straight through a "../" segment.)
const FILENAME_RE = /^(full_backup|uploaded)_[0-9_]+[A-Za-z0-9._-]*\.tar\.gz$/;

/**
 * Resolves a backup filename to an absolute path, refusing anything that
 * doesn't match the expected naming convention or that would resolve outside
 * /backups (path traversal). Returns null if invalid.
 */
export function resolveBackupPath(filename) {
  if (typeof filename !== 'string') return null;
  // Reject any path separator outright — this must be a bare filename, not a
  // path. Without this, a single-segment traversal like ".." could still
  // slip through a permissive regex.
  if (filename.includes('/') || filename.includes('\\')) return null;
  if (!FILENAME_RE.test(filename)) return null;

  const base = resolve(BACKUP_DIR) + sep;
  const resolved = resolve(BACKUP_DIR, filename);
  if (!resolved.startsWith(base)) return null; // defense in depth
  return resolved;
}

const EXPECTED_ENTRIES = [
  { prefix: 'mongo/', key: 'mongo' },
  { prefix: 'neo4j/neo4j.dump', key: 'neo4j' },
  { prefix: 'lightrag-data.tar.gz', key: 'lightrag' },
  { prefix: 'keycloak/hhh-realm.json', key: 'keycloak' },
];

function listTarEntries(tarPath, { errorMessage } = {}) {
  let listing;
  try {
    listing = execFileSync('tar', ['-tzf', tarPath], {
      encoding: 'utf8',
      timeout: 30_000,
    });
  } catch {
    throw new Error(
      errorMessage ?? 'File is not a readable gzip-compressed tar archive.'
    );
  }
  return listing.split('\n').filter(Boolean);
}

function assertSafeEntries(entries, archiveLabel) {
  for (const entry of entries) {
    if (entry.startsWith('/') || entry.split('/').includes('..')) {
      throw new Error(
        `${archiveLabel} contains an unsafe path entry ("${entry}") — refusing to accept it.`
      );
    }
  }
}

// `tar -czf out.tar.gz -C dir .` (used by backup.sh, and thus present in
// every real backup archive) produces entries prefixed with "./" — strip it
// before matching against expected component names.
const normalizeEntry = (entry) => entry.replace(/^\.\//, '');

/**
 * Lists the entries of an uploaded .tar.gz without ever extracting it onto a
 * real filesystem path, and checks: (1) no entry is an absolute path or
 * contains a ".." traversal segment, (2) at least one of the expected backup
 * components is present. Because `lightrag-data.tar.gz` is itself a nested
 * tar that restore.sh extracts independently into the LightRAG volume, its
 * inner entries are inspected too — checking only the outer archive would
 * miss a traversal payload hidden inside that nested file. Throws with a
 * user-facing message on any validation failure.
 */
export function inspectUploadedArchive(absPath) {
  const entries = listTarEntries(absPath);
  assertSafeEntries(entries, 'Archive');

  const normalized = entries.map(normalizeEntry);
  const presence = {
    mongo: false,
    lightrag: false,
    neo4j: false,
    keycloak: false,
  };
  let lightragEntryName = null;
  for (const { prefix, key } of EXPECTED_ENTRIES) {
    const match = normalized.find((e) => e === prefix || e.startsWith(prefix));
    if (match !== undefined) {
      presence[key] = true;
      if (key === 'lightrag') {
        // Extract by the archive's actual entry name (e.g. "./lightrag-data.tar.gz"),
        // not an assumed bare name, so member extraction below always finds it.
        lightragEntryName = entries[normalized.indexOf(match)];
      }
    }
  }
  if (!Object.values(presence).some(Boolean)) {
    throw new Error(
      'Archive does not contain any recognizable backup component (mongo/, neo4j/neo4j.dump, lightrag-data.tar.gz, keycloak/hhh-realm.json).'
    );
  }

  if (presence.lightrag) {
    const scratchDir = mkdtempSync(join(tmpdir(), 'hhh-backup-inspect-'));
    try {
      // Separate short flags (not the bundled "-xzOf") for portability across
      // GNU tar, BSD/libarchive tar (macOS dev machines), and BusyBox tar
      // (the actual Alpine container) — bundled-flag argument ordering isn't
      // consistent across all three.
      const nested = execFileSync(
        'tar',
        ['-x', '-z', '-O', '-f', absPath, lightragEntryName],
        { timeout: 30_000, maxBuffer: 1024 * 1024 * 1024 }
      );
      const nestedPath = join(scratchDir, 'lightrag-data.tar.gz');
      writeFileSync(nestedPath, nested);
      const nestedEntries = listTarEntries(nestedPath, {
        errorMessage:
          'lightrag-data.tar.gz inside the archive is not a valid tar file.',
      });
      assertSafeEntries(nestedEntries, 'lightrag-data.tar.gz');
    } finally {
      rmSync(scratchDir, { recursive: true, force: true });
    }
  }

  return presence;
}
