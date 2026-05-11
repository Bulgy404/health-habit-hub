import { readFile } from 'fs/promises';
import path from 'path';
import { marked } from 'marked';

const ALLOWED_LANGS = new Set(['en', 'de', 'ja']);
const ALLOWED_NAMES = new Set(['accessibility', 'imprint', 'privacy']);

export async function loadMarkdown(lang, name) {
  if (!ALLOWED_LANGS.has(lang) || !ALLOWED_NAMES.has(name)) {
    throw new Error(`Invalid markdown request: lang=${lang} name=${name}`);
  }
  const filePath = path.join('language', lang, `${name}.md`);
  const md = await readFile(filePath, 'utf-8');
  return marked.parse(md);
}
