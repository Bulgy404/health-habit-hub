import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Backup service paths
const BACKUP_SCRIPT_PATH = resolve(__dirname, '../../backup-service/backup.sh');
const RESTORE_SCRIPT_PATH = resolve(
  __dirname,
  '../../backup-service/restore.sh'
);
const BACKUP_DOCKERFILE_PATH = resolve(
  __dirname,
  '../../backup-service/Dockerfile'
);
const DOCKER_COMPOSE_PATH = resolve(__dirname, '../../docker-compose.yml');
const BACKUP_LIB_PATH = resolve(__dirname, '../../backup-service/lib.sh');

// Helper to read file content
const readFile = (path) => {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return null;
  }
};

test('Backup script file exists', () => {
  assert.strictEqual(
    existsSync(BACKUP_SCRIPT_PATH),
    true,
    'backup.sh should exist'
  );
});

test('Restore script file exists', () => {
  assert.strictEqual(
    existsSync(RESTORE_SCRIPT_PATH),
    true,
    'restore.sh should exist'
  );
});

test('Backup Dockerfile exists', () => {
  assert.strictEqual(
    existsSync(BACKUP_DOCKERFILE_PATH),
    true,
    'Dockerfile should exist in backup-service directory'
  );
});

test('Backup script has correct shebang', () => {
  const content = readFile(BACKUP_SCRIPT_PATH);
  assert(content !== null, 'backup.sh should be readable');
  assert(
    content.startsWith('#!/bin/bash'),
    'backup.sh should start with #!/bin/bash'
  );
});

test('Backup script uses environment variables correctly', () => {
  const content = readFile(BACKUP_SCRIPT_PATH);
  assert(content !== null, 'backup.sh should be readable');

  // Check for required environment variables
  assert(
    content.includes('BACKUP_RETENTION_DAYS'),
    'Should use BACKUP_RETENTION_DAYS environment variable'
  );
  assert(
    content.includes('ALERT_WEBHOOK_URL'),
    'Should use ALERT_WEBHOOK_URL environment variable'
  );
  assert(
    content.includes('ALERT_EMAIL'),
    'Should use ALERT_EMAIL environment variable'
  );
  assert(
    content.includes('BACKUP_EMAIL'),
    'Should support BACKUP_EMAIL as a backward-compatible alias'
  );

  // Check default values
  assert(
    content.includes('RETENTION_DAYS=${BACKUP_RETENTION_DAYS:-14}'),
    'Should have default retention of 14 days'
  );
});

test('Backup script includes error tracking', () => {
  const content = readFile(BACKUP_SCRIPT_PATH);
  assert(content !== null, 'backup.sh should be readable');

  // Check for error tracking variables
  assert(
    content.includes('BACKUP_ERRORS=0'),
    'Should initialize error counter'
  );
  assert(content.includes('ERROR_LOG='), 'Should initialize error log');
  assert(content.includes('log_error'), 'Should have log_error function');
});

test('Backup script includes alert functionality', () => {
  const content = readFile(BACKUP_SCRIPT_PATH);
  assert(content !== null, 'backup.sh should be readable');

  // Check for alert function
  assert(content.includes('send_alert'), 'Should have send_alert function');

  // Check for webhook support
  assert(
    content.includes('curl -X POST "$ALERT_WEBHOOK_URL"'),
    'Should send webhook alerts'
  );

  // Check for generic-SMTP email support (no vendor-specific API)
  assert(
    content.includes('send_smtp_mail'),
    'Should support email notifications via the shared send_smtp_mail() helper'
  );
  assert(
    !content.includes('mailjet.com'),
    'Should not reference the removed Mailjet integration'
  );
});

test('Backup lib provides a generic SMTP mail helper', () => {
  const content = readFile(BACKUP_LIB_PATH);
  assert(content !== null, 'lib.sh should be readable');

  assert(
    content.includes('send_smtp_mail()'),
    'Should define send_smtp_mail()'
  );
  assert(
    content.includes('SMTP_HOST') &&
      content.includes('SMTP_USER') &&
      content.includes('SMTP_PASS'),
    'Should gate email alerts on generic SMTP credentials'
  );
  assert(
    content.includes('--mail-from') && content.includes('--mail-rcpt'),
    "Should send via curl's built-in SMTP support"
  );
});

test('Backup script includes all database backups', () => {
  const content = readFile(BACKUP_SCRIPT_PATH);
  assert(content !== null, 'backup.sh should be readable');

  // Check for MongoDB backup
  assert(content.includes('mongodump'), 'Should include MongoDB backup');

  // Check for LightRAG backup
  assert(
    content.includes('Backing up LightRAG') ||
      content.includes('lightrag-data.tar.gz'),
    'Should include LightRAG backup'
  );

  // Check for Neo4j backup
  assert(
    content.includes('neo4j-admin database dump'),
    'Should use Neo4j native dump'
  );
});

test('Backup script handles Neo4j restart', () => {
  const content = readFile(BACKUP_SCRIPT_PATH);
  assert(content !== null, 'backup.sh should be readable');

  // Container name must match the actual container_name in docker-compose.yml
  // (hhh-neo4j) — a prior mismatch (h3-neo4j) meant the stop/dump/restart
  // sequence silently failed every night, so this is asserted explicitly.
  assert(
    !content.includes('h3-neo4j'),
    'Should not reference the stale h3-neo4j container name'
  );

  // Check Neo4j is stopped before backup
  assert(
    content.includes('docker stop hhh-neo4j'),
    'Should stop the actual hhh-neo4j container before backup'
  );

  // Check Neo4j is restarted after backup
  assert(
    content.includes('docker start hhh-neo4j'),
    'Should restart the actual hhh-neo4j container after backup'
  );

  // Check for restart verification
  assert(
    content.includes('Restarting Neo4j') || content.includes('Neo4j restarted'),
    'Should verify Neo4j restart'
  );
});

test('Backup script and restore script share a filesystem lock', () => {
  assert(
    existsSync(BACKUP_LIB_PATH),
    'backup-service/lib.sh should exist with the shared lock helpers'
  );
  const libContent = readFile(BACKUP_LIB_PATH);
  assert(
    libContent.includes('acquire_lock') && libContent.includes('release_lock'),
    'lib.sh should define acquire_lock/release_lock'
  );

  const backupContent = readFile(BACKUP_SCRIPT_PATH);
  const restoreContent = readFile(RESTORE_SCRIPT_PATH);
  for (const [name, content] of [
    ['backup.sh', backupContent],
    ['restore.sh', restoreContent],
  ]) {
    assert(content !== null, `${name} should be readable`);
    assert(
      content.includes('source') && content.includes('lib.sh'),
      `${name} should source lib.sh`
    );
    assert(
      content.includes('acquire_lock'),
      `${name} should call acquire_lock before doing destructive work`
    );
  }
});

test('Backup manifest reflects per-component success, not a shared global flag', () => {
  const content = readFile(BACKUP_SCRIPT_PATH);
  assert(content !== null, 'backup.sh should be readable');

  for (const flag of ['MONGO_OK', 'LIGHTRAG_OK', 'NEO4J_OK', 'KEYCLOAK_OK']) {
    assert(
      content.includes(flag),
      `Should track a dedicated ${flag} flag for the manifest`
    );
  }

  // The manifest lines must read from the per-component flags, not the
  // shared error counter (which previously made every line lie whenever any
  // other component failed).
  assert(
    !content.includes('MongoDB: $([ $BACKUP_ERRORS -eq 0 ]'),
    'MongoDB manifest line should not be derived from the global error counter'
  );
});

test('Backup script writes a structured JSON manifest', () => {
  const content = readFile(BACKUP_SCRIPT_PATH);
  assert(content !== null, 'backup.sh should be readable');

  assert(
    content.includes('.manifest.json'),
    'Should write a backup_<DATE>.manifest.json sidecar'
  );
  assert(content.includes('jq -n'), 'Should build the JSON manifest with jq');
  assert(
    content.includes('BACKUP_TRIGGER'),
    'Should record which trigger (scheduled/manual/pre_restore_safety) started the run'
  );
});

test('Backup script includes retention cleanup', () => {
  const content = readFile(BACKUP_SCRIPT_PATH);
  assert(content !== null, 'backup.sh should be readable');

  // Check for cleanup logic
  assert(
    content.includes('find') && content.includes('-mtime'),
    'Should include find command with mtime for cleanup'
  );

  // Check cleanup uses retention days
  assert(
    content.includes('+$RETENTION_DAYS') ||
      content.includes('+${RETENTION_DAYS}'),
    'Should use retention days in cleanup'
  );
});

test('Backup script exits with error code on failure', () => {
  const content = readFile(BACKUP_SCRIPT_PATH);
  assert(content !== null, 'backup.sh should be readable');

  // Check for exit with error code
  assert(
    content.includes('exit $BACKUP_ERRORS'),
    'Should exit with error count for monitoring'
  );
});

test('Restore script exits with error code on failure', () => {
  const content = readFile(RESTORE_SCRIPT_PATH);
  assert(content !== null, 'restore.sh should be readable');

  // restore.sh previously tracked RESTORE_ERRORS but never exited non-zero
  // with it, so a partially-failed restore (e.g. Mongo restored, Neo4j load
  // failed) would be reported as a success by anything checking exit status.
  assert(
    content.includes('exit $RESTORE_ERRORS'),
    'Should exit with the restore error count so callers can detect partial failures'
  );
});

test('Restore script handles Neo4j dump format', () => {
  const content = readFile(RESTORE_SCRIPT_PATH);
  assert(content !== null, 'restore.sh should be readable');

  // Check for Neo4j dump file handling
  assert(content.includes('neo4j.dump'), 'Should handle neo4j.dump format');

  // Check for neo4j-admin load command
  assert(
    content.includes('neo4j-admin database load'),
    'Should use neo4j-admin database load for restore'
  );
});

test('Backup Dockerfile includes required tools', () => {
  const content = readFile(BACKUP_DOCKERFILE_PATH);
  assert(content !== null, 'Dockerfile should be readable');

  // Check for Alpine base image
  assert(content.includes('FROM alpine'), 'Should use Alpine Linux as base');

  // Check for required tools
  assert(content.includes('mongodb-tools'), 'Should install mongodb-tools');
  assert(content.includes('curl'), 'Should install curl for webhooks');
  assert(
    content.includes('docker-cli'),
    'Should install docker-cli for container management'
  );
  assert(content.includes('bash'), 'Should install bash');

  // Check scripts are copied and made executable
  assert(
    content.includes('COPY backup.sh') && content.includes('COPY restore.sh'),
    'Should copy backup and restore scripts'
  );
  assert(content.includes('chmod +x'), 'Should make scripts executable');
});

test('Docker Compose includes backup service with correct configuration', () => {
  const content = readFile(DOCKER_COMPOSE_PATH);
  assert(content !== null, 'docker-compose.yml should be readable');

  // Check backup service is defined
  assert(content.includes('backup:'), 'Should include backup service');

  // Check Docker socket mount
  assert(
    content.includes('/var/run/docker.sock') &&
      content.includes('/var/run/docker.sock'),
    'Should mount Docker socket for container management'
  );

  // Check backup directory mount
  assert(
    content.includes('./backups:/backups') ||
      content.includes('- ./backups:/backups'),
    'Should mount backups directory'
  );

  // Check environment variables
  assert(
    content.includes('BACKUP_RETENTION_DAYS') ||
      content.includes('RETENTION_DAYS'),
    'Should pass retention days environment variable'
  );
});

test('Backup script creates backup directory structure', () => {
  const content = readFile(BACKUP_SCRIPT_PATH);
  assert(content !== null, 'backup.sh should be readable');

  // Check for directory creation
  assert(
    content.includes('mkdir -p'),
    'Should create backup directory with mkdir -p'
  );

  // Check for timestamped directories
  assert(
    content.includes('DATE=') && content.includes('date'),
    'Should use timestamps for backup directories'
  );
});

test('Backup script includes backup size reporting', () => {
  const content = readFile(BACKUP_SCRIPT_PATH);
  assert(content !== null, 'backup.sh should be readable');

  // Check for size calculation
  assert(
    content.includes('du -sh') || content.includes('BACKUP_SIZE'),
    'Should calculate and report backup size'
  );
});

test('Backup retention defaults to 14 days', () => {
  const content = readFile(BACKUP_SCRIPT_PATH);
  assert(content !== null, 'backup.sh should be readable');

  // Check default retention value
  assert(
    content.includes('RETENTION_DAYS=${BACKUP_RETENTION_DAYS:-14}'),
    'Should default to 14 days retention'
  );
});

test('Backup script supports quiet operation', () => {
  const content = readFile(BACKUP_SCRIPT_PATH);
  assert(content !== null, 'backup.sh should be readable');

  // Check for quiet flags to reduce log noise
  assert(
    content.includes('--quiet') ||
      content.includes('2>/dev/null') ||
      content.includes('>/dev/null'),
    'Should support quiet operation to reduce log verbosity'
  );
});

test('Restore script validates backup directory exists', () => {
  const content = readFile(RESTORE_SCRIPT_PATH);
  assert(content !== null, 'restore.sh should be readable');

  // Check for directory validation
  assert(
    content.includes('-d') || content.includes('if [ '),
    'Should validate backup directory exists'
  );
});

test('Backup configuration supports both new and old Neo4j formats', () => {
  const restoreContent = readFile(RESTORE_SCRIPT_PATH);
  assert(restoreContent !== null, 'restore.sh should be readable');

  // Check for backward compatibility
  assert(
    restoreContent.includes('neo4j.dump') ||
      restoreContent.includes('neo4j-data.tar.gz'),
    'Should handle both new (dump) and old (tar.gz) Neo4j formats'
  );
});

test('Environment variables are properly documented', () => {
  const content = readFile(BACKUP_SCRIPT_PATH);
  assert(content !== null, 'backup.sh should be readable');

  // Check that critical env vars are used
  const requiredEnvVars = [
    'BACKUP_RETENTION_DAYS',
    'ALERT_WEBHOOK_URL',
    'BACKUP_EMAIL',
    'ALERT_EMAIL',
  ];

  requiredEnvVars.forEach((envVar) => {
    assert(
      content.includes(envVar),
      `Should reference ${envVar} environment variable`
    );
  });
});

test('Backup script has proper error messages', () => {
  const content = readFile(BACKUP_SCRIPT_PATH);
  assert(content !== null, 'backup.sh should be readable');

  // Check for error messages
  assert(
    content.includes('ERROR:') || content.includes('log_error'),
    'Should include error messages'
  );

  // Check for success messages
  assert(
    content.includes('✓') || content.includes('completed'),
    'Should include success messages'
  );

  // Check for warning messages
  assert(
    content.includes('⚠') || content.includes('Warning'),
    'Should include warning messages'
  );
});

test('Backup creates unified archive', () => {
  const content = readFile(BACKUP_SCRIPT_PATH);
  assert(content !== null, 'backup.sh should be readable');

  // Check for unified backup archive creation
  assert(
    content.includes('full_backup_') && content.includes('.tar.gz'),
    'Should create unified full_backup_*.tar.gz archive'
  );
});

test('Backup generates manifest file', () => {
  const content = readFile(BACKUP_SCRIPT_PATH);
  assert(content !== null, 'backup.sh should be readable');

  // Check for manifest file generation
  assert(
    content.includes('.manifest') || content.includes('backup_manifest'),
    'Should generate backup manifest file'
  );

  // Check manifest includes important information
  assert(
    content.includes('Backup Date') || content.includes('date'),
    'Manifest should include backup date'
  );
});

test('Backup script lists current backups', () => {
  const content = readFile(BACKUP_SCRIPT_PATH);
  assert(content !== null, 'backup.sh should be readable');

  // Check for backup listing
  assert(
    content.includes('ls -lh') || content.includes('Current backups'),
    'Should list current backups at the end'
  );
});
