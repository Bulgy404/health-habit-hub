import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';

// Overridable only for local/CI smoke testing outside the container, where
// /backups doesn't exist — production always uses the real mounted path.
export const BACKUP_DIR = process.env.BACKUP_DIR_OVERRIDE || '/backups';

/**
 * Join a filename to BACKUP_DIR, refusing separators or anything resolving
 * outside the directory (path-traversal barrier for manifest writes).
 * @throws {Error} when the resulting path would escape BACKUP_DIR
 */
function backupDirPath(name) {
  if (
    typeof name !== 'string' ||
    !name ||
    name.includes('/') ||
    name.includes('\\') ||
    name.includes('\0')
  ) {
    throw new Error('Invalid backup filename.');
  }
  const base = resolve(BACKUP_DIR) + sep;
  const resolved = resolve(BACKUP_DIR, name);
  if (!resolved.startsWith(base)) throw new Error('Invalid backup filename.');
  return resolved;
}

/**
 * Reads every `*.manifest.json` sidecar in /backups, newest first.
 * Manifests are always written by our own code (backup.sh or the upload
 * validator below) — never by an uploader's archive contents — so nothing
 * here is attacker-forgeable.
 */
export function listManifests() {
  let entries;
  try {
    entries = readdirSync(BACKUP_DIR);
  } catch {
    return [];
  }
  const manifests = [];
  for (const name of entries) {
    if (!name.endsWith('.manifest.json')) continue;
    try {
      const data = JSON.parse(readFileSync(join(BACKUP_DIR, name), 'utf8'));
      manifests.push(data);
    } catch {
      // Skip unreadable/corrupt manifest files rather than failing the whole list.
    }
  }
  manifests.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  return manifests;
}

/** Finds the manifest for one specific backup filename, or null. */
export function getManifestForFile(filename) {
  return listManifests().find((m) => m.file === filename) ?? null;
}

/**
 * Locates the on-disk manifest sidecar(s) for a backup archive, by matching
 * each manifest's own `file` field rather than assuming a naming convention —
 * scheduled/manual backups are named `backup_<stamp>.manifest[.json]` while
 * uploaded ones are named `<filename>.manifest.json` (see backup.sh and
 * writeUploadedManifest below), so the two can't be derived from `filename`
 * by string manipulation alone.
 * @returns {{ jsonName: string, textName: string|null }|null}
 */
export function findManifestFilenames(filename) {
  let entries;
  try {
    entries = readdirSync(BACKUP_DIR);
  } catch {
    return null;
  }
  for (const name of entries) {
    if (!name.endsWith('.manifest.json')) continue;
    let data;
    try {
      data = JSON.parse(readFileSync(join(BACKUP_DIR, name), 'utf8'));
    } catch {
      continue; // skip unreadable/corrupt manifest
    }
    if (data.file !== filename) continue;
    const textName = name.slice(0, -'.json'.length); // "<x>.manifest.json" -> "<x>.manifest"
    return {
      jsonName: name,
      textName: entries.includes(textName) ? textName : null,
    };
  }
  return null;
}

/**
 * Writes a manifest for an uploaded backup archive. Uses the same field
 * names as backup.sh's manifest (`mongoOk`/`lightragOk`/`audioOk`/`neo4jOk`/
 * `keycloakOk`) so the restore endpoint's "don't restore a known-bad backup"
 * check works identically for both sources — for an upload these flags mean
 * "component present in the archive", which is the strongest signal
 * available without actually performing a trial restore.
 */
export function writeUploadedManifest({ filename, sizeBytes, presence }) {
  const manifest = {
    date: new Date().toISOString(),
    file: filename,
    source: 'uploaded',
    trigger: 'uploaded',
    sizeBytes,
    mongoOk: presence.mongo,
    lightragOk: presence.lightrag,
    audioOk: presence.audio,
    neo4jOk: presence.neo4j,
    keycloakOk: presence.keycloak,
    keycloakSkipped: !presence.keycloak,
    retentionDays: null,
    errors: 0,
    errorLog: '',
    durationSeconds: null,
    note: 'Flags reflect components detected in the uploaded archive, not verified backup integrity.',
  };
  writeFileSync(
    backupDirPath(`${filename}.manifest.json`),
    JSON.stringify(manifest, null, 2)
  );
  return manifest;
}
