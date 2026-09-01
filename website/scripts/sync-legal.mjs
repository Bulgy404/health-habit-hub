// Copies the canonical legal texts from the app (app/language/<lang>/*.md)
// into the website content dir so the legal pages render the single source of
// truth instead of a hand-maintained copy. Runs before dev/build.
//
// If a source file is missing (e.g. building the website in isolation without
// the rest of the monorepo), a clearly-marked placeholder is written so the
// build still succeeds.

import { mkdirSync, existsSync, copyFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..');          // health-habit-hub/
const appLang = resolve(repoRoot, 'app', 'language'); // source of truth
const dest = resolve(here, '..', 'src', 'content', 'legal');

const DOCS = ['imprint', 'privacy', 'consent', 'accessibility'];
const LANGS = ['de', 'en'];

let copied = 0, missing = 0;
for (const lang of LANGS) {
  mkdirSync(resolve(dest, lang), { recursive: true });
  for (const doc of DOCS) {
    const src = resolve(appLang, lang, `${doc}.md`);
    const out = resolve(dest, lang, `${doc}.md`);
    if (existsSync(src)) {
      copyFileSync(src, out);
      copied++;
    } else {
      writeFileSync(
        out,
        `> _Platzhalter — dieser Text wird beim Build aus \`app/language/${lang}/${doc}.md\` übernommen._\n`,
      );
      missing++;
    }
  }
}
console.log(`[sync:legal] copied ${copied} file(s), ${missing} placeholder(s).`);
