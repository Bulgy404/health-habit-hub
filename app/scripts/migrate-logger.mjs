/**
 * One-time migration: replace console.* calls with pino logger calls.
 *
 * For each file it:
 *  1. Adds the logger import (relative to the file's location).
 *  2. Replaces console.error / console.warn / console.log with log.error /
 *     log.warn / log.info using pino's structured style where an err object
 *     is present.
 *
 * Usage:  node scripts/migrate-logger.mjs  (run from app/)
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { relative, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dir, '..');

const targets = [
  'routes/admin/studiesRouter.js',
  'routes/admin/surveysRouter.js',
  'routes/admin/participantsRouter.js',
  'routes/admin/notificationsRouter.js',
  'routes/habits/habitsCrudRouter.js',
  'routes/habits/habitsGraphRouter.js',
  'routes/habits/habitsStatsRouter.js',
  'routes/adminRouter.js',
  'routes/cuePoolRouter.js',
  'routes/donateRouter.js',
  'routes/habitConfigRouter.js',
  'routes/intentionsRouter.js',
  'routes/internalRouter.js',
  'routes/kbRouter.js',
  'routes/notificationCampaignRouter.js',
  'routes/onboardRouter.js',
  'routes/participantRouter.js',
  'routes/profileFieldDefinitionsRouter.js',
  'routes/profileRouter.js',
  'routes/questionnaireResponsesRouter.js',
  'routes/questionnairesRouter.js',
  'routes/recommendationsRouter.js',
  'routes/srhiRouter.js',
  'routes/studyEnrollRouter.js',
  'routes/studyExportRouter.js',
  'routes/surveyRouter.js',
  'routes/userProfileRouter.js',
  'routes/usersRouter.js',
  'controllers/accessibilityController.js',
  'controllers/contactController.js',
  'controllers/demoController.js',
  'controllers/donateController.js',
  'controllers/imprintController.js',
  'controllers/privacyController.js',
  'controllers/surveyController.js',
  'services/adminStatsService.js',
  'services/notificationService.js',
  'utils/localization.js',
  'utils/Neo4jDatabase.js',
  'utils/translate.js',
];

function loggerImport(filePath) {
  // Compute relative path from the file to utils/logger.js
  const fileDir = dirname(resolve(root, filePath));
  const loggerPath = resolve(root, 'utils/logger.js');
  let rel = relative(fileDir, loggerPath).replace(/\\/g, '/');
  if (!rel.startsWith('.')) rel = './' + rel;
  return `import { logger } from '${rel}';\n`;
}

// Replace console.error('[route] Error:', err) and similar patterns
function transform(src, importLine, filePath) {
  let out = src;

  // Avoid double-import
  if (
    !out.includes("from '../utils/logger") &&
    !out.includes("from '../../utils/logger") &&
    !out.includes("from './utils/logger")
  ) {
    // Insert after the last existing import line
    const lastImport = out.lastIndexOf('\nimport ');
    const insertAt =
      lastImport >= 0 ? out.indexOf('\n', lastImport + 1) + 1 : 0;
    out = out.slice(0, insertAt) + importLine + out.slice(insertAt);
  }

  // Add `const log = logger.child(...)` after import block, before first export/const/function
  // Only if not already present
  if (!out.includes('const log = logger.child(')) {
    const firstCode = out.search(/\n(export|const|function|class|let|var)/);
    if (firstCode >= 0) {
      const insertAt = firstCode + 1;
      out =
        out.slice(0, insertAt) +
        `const log = logger.child({ module: '${filePath.replace(/.*\//, '').replace('.js', '')}' });\n\n` +
        out.slice(insertAt);
    }
  }

  // console.error('[route] Error:', err)  →  log.error({ err }, 'unhandled route error')
  out = out.replace(
    /console\.error\(\s*'\[route\]\s*Error:',\s*(\w+)\s*\)/g,
    "log.error({ err: $1 }, 'unhandled route error')"
  );

  // console.error('[startup]', ...) style
  out = out.replace(
    /console\.error\(\s*'(\[[\w/]+\])[^']*',\s*(\w+)\s*\)/g,
    (_, tag, variable) => `log.error({ err: ${variable} }, '${tag} error')`
  );

  // console.error('some message', err) → log.error({ err }, 'some message')
  out = out.replace(
    /console\.error\(\s*(`[^`]+`|'[^']+'|"[^"]+")\s*,\s*(\w+)\s*\)/g,
    (_, msg, variable) => `log.error({ err: ${variable} }, ${msg})`
  );

  // console.error('message') → log.error('message')
  out = out.replace(
    /console\.error\(\s*(`[^`]+`|'[^']+'|"[^"]+")\s*\)/g,
    (_, msg) => `log.error(${msg})`
  );

  // console.warn('...', val) → log.warn({ val }, '...')
  out = out.replace(
    /console\.warn\(\s*(`[^`]+`|'[^']+'|"[^"]+")\s*,\s*(\w+)\s*\)/g,
    (_, msg, variable) => `log.warn({ ${variable} }, ${msg})`
  );

  // console.warn('...') → log.warn('...')
  out = out.replace(
    /console\.warn\(\s*(`[^`]+`|'[^']+'|"[^"]+")\s*\)/g,
    (_, msg) => `log.warn(${msg})`
  );

  // console.log('...', val) → log.debug({ val }, '...')
  out = out.replace(
    /console\.log\(\s*(`[^`]+`|'[^']+'|"[^"]+")\s*,\s*(\w+)\s*\)/g,
    (_, msg, variable) => `log.debug({ ${variable} }, ${msg})`
  );

  // console.log('...') → log.debug('...')
  out = out.replace(
    /console\.log\(\s*(`[^`]+`|'[^']+'|"[^"]+")\s*\)/g,
    (_, msg) => `log.debug(${msg})`
  );

  return out;
}

let changed = 0;
for (const filePath of targets) {
  const abs = resolve(root, filePath);
  let src;
  try {
    src = readFileSync(abs, 'utf8');
  } catch {
    console.warn(`  skip (not found): ${filePath}`);
    continue;
  }

  const importLine = loggerImport(filePath);
  const out = transform(src, importLine, filePath);

  if (out !== src) {
    writeFileSync(abs, out, 'utf8');
    console.log(`  updated: ${filePath}`);
    changed++;
  } else {
    console.log(`  no change: ${filePath}`);
  }
}

console.log(`\nDone — ${changed} files updated.`);
