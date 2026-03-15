#!/usr/bin/env node
/**
 * Generates docs/api/openapi.yaml from swagger-jsdoc annotations in the app.
 * Usage: node scripts/generate-spec.js
 * Or via npm: npm run generate-spec (from the app/ directory)
 */
import { writeFileSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, '..');

// Import the spec from the app
const { swaggerSpec } = await import(path.join(repoRoot, 'app', 'swagger.js'));

// Convert to YAML using a simple JSON → YAML serializer
function toYaml(obj, indent = 0) {
  const pad = '  '.repeat(indent);
  if (obj === null) return 'null';
  if (obj === undefined) return '';
  if (typeof obj === 'boolean') return String(obj);
  if (typeof obj === 'number') return String(obj);
  if (typeof obj === 'string') {
    // Multi-line or special char strings use block literal
    if (obj.includes('\n') || obj.includes(':') || obj.includes('#') || obj.startsWith('{') || obj.startsWith('[')) {
      return `"${obj.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')}"`;
    }
    return obj;
  }
  if (Array.isArray(obj)) {
    if (obj.length === 0) return '[]';
    return obj
      .map((item) => {
        const val = toYaml(item, indent + 1);
        if (typeof item === 'object' && item !== null && !Array.isArray(item)) {
          return `\n${pad}- ${val.trimStart()}`;
        }
        return `\n${pad}- ${val}`;
      })
      .join('');
  }
  if (typeof obj === 'object') {
    const keys = Object.keys(obj);
    if (keys.length === 0) return '{}';
    return keys
      .map((key) => {
        const val = obj[key];
        const escapedKey = /[^a-zA-Z0-9_\-./]/.test(key) ? `"${key}"` : key;
        if (typeof val === 'object' && val !== null && !Array.isArray(val) && Object.keys(val).length > 0) {
          return `\n${pad}${escapedKey}:\n${pad}  ${toYaml(val, indent + 1).trimStart()}`;
        }
        if (Array.isArray(val) && val.length > 0) {
          return `\n${pad}${escapedKey}:${toYaml(val, indent + 1)}`;
        }
        return `\n${pad}${escapedKey}: ${toYaml(val, indent + 1)}`;
      })
      .join('');
  }
  return String(obj);
}

// Use js-yaml if available, otherwise fallback to JSON
let yamlOutput;
try {
  const yaml = await import('js-yaml');
  yamlOutput = yaml.dump(swaggerSpec, { lineWidth: 120, noRefs: true });
} catch {
  // Fallback: write as JSON with .yaml extension (valid YAML superset)
  yamlOutput = JSON.stringify(swaggerSpec, null, 2);
}

const outDir = path.join(repoRoot, 'docs', 'api');
mkdirSync(outDir, { recursive: true });
const outPath = path.join(outDir, 'openapi.yaml');
writeFileSync(outPath, yamlOutput, 'utf8');
console.log(`✓ OpenAPI spec written to ${outPath}`);
