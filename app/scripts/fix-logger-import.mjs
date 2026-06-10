/**
 * Fix logger imports that were inserted inside multi-line import blocks.
 *
 * Broken pattern:
 *   import {
 *   import { logger } from '...';
 *     foo,
 *   } from '...';
 *
 * Fixed pattern:
 *   import { logger } from '...';
 *   import {
 *     foo,
 *   } from '...';
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const bad = [
  'routes/admin/studiesRouter.js',
  'routes/admin/surveysRouter.js',
  'routes/surveyRouter.js',
  'routes/srhiRouter.js',
  'routes/questionnaireResponsesRouter.js',
  'routes/cuePoolRouter.js',
  'routes/studyExportRouter.js',
  'routes/notificationCampaignRouter.js',
  'routes/habits/habitsStatsRouter.js',
  'routes/admin/notificationsRouter.js',
];

// Regex: matches "import {\n import { logger } from '...';\n"
// Capture groups: (1) the opening "import {", (2) the logger import line
const RE = /(import \{)\n(import \{ logger \} from '[^']+';)\n/g;

let fixed = 0;
for (const rel of bad) {
  const abs = resolve(root, rel);
  const src = readFileSync(abs, 'utf8');
  const out = src.replace(
    RE,
    (_, open, loggerLine) => `${loggerLine}\n${open}\n`
  );
  if (out !== src) {
    writeFileSync(abs, out, 'utf8');
    console.log(`fixed: ${rel}`);
    fixed++;
  } else {
    console.log(`unchanged: ${rel}`);
  }
}
console.log(`\nFixed ${fixed} files.`);
