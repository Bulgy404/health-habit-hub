#!/usr/bin/env node
/**
 * Generates docs/api/openapi.yaml from swagger-jsdoc annotations in the app.
 * Usage: node scripts/generate-spec.js
 * Or via npm: npm run generate-spec (from the app/ directory)
 */
import { writeFileSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, '..');

try {
  const { swaggerSpec } = await import(path.join(repoRoot, 'app', 'swagger.js'));

  // Resolve js-yaml from app/node_modules — this script lives at the repo
  // root, which has no node_modules of its own.
  const requireFromApp = createRequire(
    path.join(repoRoot, 'app', 'package.json')
  );
  const yaml = requireFromApp('js-yaml');
  const yamlOutput = yaml.dump(swaggerSpec, { lineWidth: 120, noRefs: true });

  const outDir = path.join(repoRoot, 'docs', 'api');
  mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, 'openapi.yaml');
  writeFileSync(outPath, yamlOutput, 'utf8');
  console.log(`✓ OpenAPI spec written to ${outPath}`);
} catch (err) {
  console.error('ERROR: Failed to generate OpenAPI spec:', err.message);
  process.exit(1);
}
