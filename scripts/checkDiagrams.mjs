/**
 * Diagram consistency check (CI gate).
 *
 * Rendering every diagram in CI would mean a headless Chromium for
 * mermaid-cli, which is a heavy dependency for a docs check. This catches the
 * failure that actually happened instead, plus the one that is easy to make
 * next.
 *
 * 1. **A semicolon in a Mermaid statement.** `;` is a statement separator, so
 *    one inside an arrow message or a `Note` body makes the whole diagram
 *    unrenderable. Two sequence diagrams sat broken in this repository for
 *    months because of exactly that, and nothing noticed: the file looks
 *    perfectly reasonable in a code review.
 *
 * 2. **A PlantUML relation naming an alias that was never declared.** A typo
 *    there renders as an extra, empty actor rather than an error.
 *
 * Usage: node scripts/checkDiagrams.mjs   (run from the repository root)
 * Exit code 1 on any violation.
 */

import { readFileSync, readdirSync, statSync } from 'fs';
import path from 'path';

const ROOT = 'docs/diagrams';

let failures = 0;
const fail = (msg) => {
  failures += 1;
  console.error(`✗ ${msg}`);
};

/** Every file under `dir` whose name ends with `ext`, recursively. */
function walk(dir, ext) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full, ext));
    else if (entry.endsWith(ext)) out.push(full);
  }
  return out;
}

/**
 * Does this line carry a sequence-diagram MESSAGE — `A->>B: text`?
 *
 * Narrow on purpose. Mermaid tolerates a semicolon inside a `Note` body and
 * inside a quoted node label (including one spanning several lines); it is
 * only an arrow's message text where `;` terminates the statement and breaks
 * the parse. Flagging the tolerated positions too would have meant five false
 * positives in this repository on the day the check was written, and a check
 * that cries wolf gets deleted.
 */
function arrowMessage(line) {
  const withoutComment = line.split('%%')[0];
  if (/^\s*(Note|note)\b/.test(withoutComment)) return null;
  const m = /^\s*\w+\s*(?:-{1,2}>>?|-->>?|--[x)]|-[x)]|\.\.>)\s*\w+\s*:(.*)$/.exec(
    withoutComment
  );
  return m ? m[1] : null;
}

for (const file of walk(ROOT, '.mmd')) {
  const lines = readFileSync(file, 'utf-8').split(/\r?\n/);
  lines.forEach((line, i) => {
    const message = arrowMessage(line);
    if (message !== null && message.includes(';')) {
      fail(
        `${file}:${i + 1}: a ';' in an arrow message — Mermaid reads it as a ` +
          `statement separator, so the whole diagram fails to render. Use an ` +
          `em dash or a comma.`
      );
    }
  });
}

for (const file of walk(ROOT, '.puml')) {
  const src = readFileSync(file, 'utf-8');

  const declared = new Set();
  for (const m of src.matchAll(/\bas ([A-Za-z_]\w*)\b/g)) declared.add(m[1]);
  for (const m of src.matchAll(/^\s*(?:actor|usecase|rectangle|package)\s+(\w+)\s*\{/gm))
    declared.add(m[1]);

  for (const [i, line] of src.split(/\r?\n/).entries()) {
    if (line.trim().startsWith("'")) continue; // PlantUML comment
    const m = /^\s*(\w+)\s*(?:-->|\.\.>|--\|>|-->>)\s*(\w+)/.exec(line);
    if (!m) continue;
    for (const alias of [m[1], m[2]]) {
      if (!declared.has(alias)) {
        fail(
          `${file}:${i + 1}: relation names "${alias}", which is never ` +
            `declared — PlantUML renders it as an empty element rather than ` +
            `reporting an error.`
        );
      }
    }
  }
}

if (failures) {
  console.error(`\n${failures} diagram check(s) failed.`);
  process.exit(1);
}

const mmd = walk(ROOT, '.mmd').length;
const puml = walk(ROOT, '.puml').length;
console.log(`✓ Diagrams consistent: ${mmd} Mermaid, ${puml} PlantUML`);
