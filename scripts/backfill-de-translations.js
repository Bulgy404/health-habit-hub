#!/usr/bin/env node
/**
 * backfill-de-translations.js
 *
 * Back-fills hhh:translationDE for all existing English-language Habit nodes
 * that do not yet have a German translation.
 *
 * Uses LibreTranslate (EN→DE) + LLM tone refinement via the API-service.
 *
 * Usage:
 *   node scripts/backfill-de-translations.js [--dry-run]
 *
 * Environment variables:
 *   NEO4J_URI            Neo4j bolt URI (default: bolt://neo4j:7687)
 *   NEO4J_USER           Neo4j username (default: neo4j)
 *   NEO4J_PASSWORD       Neo4j password (default: password)
 *   API_SERVICE_URL      API-service base URL (default: http://recommender:8000)
 *   LIBRE_TRANSLATE_URL  LibreTranslate URL (default: http://libretranslate:5000/translate)
 */

import neo4j from 'neo4j-driver';

const DRY_RUN = process.argv.includes('--dry-run');

const NEO4J_URI = process.env.NEO4J_URI || 'bolt://neo4j:7687';
const NEO4J_USER = process.env.NEO4J_USER || 'neo4j';
const NEO4J_PASSWORD = process.env.NEO4J_PASSWORD || 'password';
const API_BASE = process.env.API_SERVICE_URL || 'http://recommender:8000';
const LIBRE_TRANSLATE_URL =
  process.env.LIBRE_TRANSLATE_URL || 'http://libretranslate:5000/translate';

async function translateToGerman(sentence) {
  // Step 1: LibreTranslate EN→DE
  let draft;
  const ltRes = await fetch(LIBRE_TRANSLATE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ q: sentence, source: 'en', target: 'de', format: 'text' }),
  });
  if (!ltRes.ok) {
    console.warn(`  LibreTranslate ${ltRes.status} — skipping`);
    return null;
  }
  const ltData = await ltRes.json();
  draft = ltData.translatedText;

  // Step 2: LLM refinement
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    let refineRes;
    try {
      refineRes = await fetch(`${API_BASE}/api/v1/llm/refine-translation-de`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ original: sentence, raw_translation: draft }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }
    if (!refineRes.ok) {
      console.warn(`  LLM refine-translation-de ${refineRes.status} — using raw draft`);
      return draft;
    }
    const refineData = await refineRes.json();
    return refineData.refined_translation || draft;
  } catch (err) {
    console.warn(`  LLM refinement error/timeout: ${err.message} — using raw draft`);
    return draft;
  }
}

async function main() {
  const driver = neo4j.driver(
    NEO4J_URI,
    neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD)
  );
  const session = driver.session();

  try {
    // Find all English habits without translationDE
    const result = await session.run(`
      MATCH (h:Habit)
      WHERE (h.language STARTS WITH 'en')
        AND (h.translationDE IS NULL OR h.translationDE = '')
      RETURN h.uuid AS uuid, h.sentence AS sentence
    `);

    const habits = result.records.map((r) => ({
      uuid: r.get('uuid'),
      sentence: r.get('sentence'),
    }));

    console.log(`Found ${habits.length} English habit(s) without translationDE.`);
    if (DRY_RUN) {
      console.log('Dry-run mode — no changes written.');
      return;
    }

    let updated = 0;
    let skipped = 0;

    for (const habit of habits) {
      console.log(`Processing ${habit.uuid}: "${habit.sentence.slice(0, 60)}…"`);
      const translationDE = await translateToGerman(habit.sentence);
      if (!translationDE) {
        console.warn('  Could not translate — skipping.');
        skipped++;
        continue;
      }
      await session.run(
        `MATCH (h:Habit {uuid: $uuid}) SET h.translationDE = $translationDE`,
        { uuid: habit.uuid, translationDE }
      );
      console.log(`  → "${translationDE.slice(0, 60)}…"`);
      updated++;
    }

    console.log(`\nDone. Updated: ${updated}, Skipped: ${skipped}.`);
  } finally {
    await session.close();
    await driver.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
