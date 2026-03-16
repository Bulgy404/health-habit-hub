#!/usr/bin/env node
// version-check.js — verifies that the latest CHANGELOG.md version has a matching git tag.
// Exits with code 1 (and prints a warning) if no matching tag is found.
// Run via: npm run version-check  (from the app/ directory)
import { execSync } from 'child_process';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');
const changelogPath = resolve(repoRoot, 'CHANGELOG.md');

let changelog;
try {
  changelog = readFileSync(changelogPath, 'utf8');
} catch {
  console.error('WARNING: CHANGELOG.md not found — skipping version bump check.');
  process.exit(0);
}

// Extract first semver from CHANGELOG.md (e.g. ## [1.2.3] - date  or  ## 1.2.3)
const match = changelog.match(/\[?(\d+\.\d+\.\d+)\]?/);
if (!match) {
  console.error('WARNING: Could not parse version from CHANGELOG.md — skipping version bump check.');
  process.exit(0);
}

const version = match[1];

// Check for matching git tag (with and without 'v' prefix)
let tagExists = false;
for (const candidate of [`v${version}`, version]) {
  try {
    const result = execSync(`git -C "${repoRoot}" tag --list "${candidate}"`, { encoding: 'utf8' }).trim();
    if (result) {
      tagExists = true;
      break;
    }
  } catch {
    // git not available or other error — treat as missing
  }
}

if (!tagExists) {
  console.error(`WARNING: Version not bumped since last deploy (CHANGELOG.md v${version} has no matching git tag)`);
  process.exit(1);
}

console.log(`Version ${version} is tagged — OK.`);
