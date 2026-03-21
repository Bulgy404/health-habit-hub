#!/usr/bin/env node
/**
 * run-migration.js
 *
 * Executes scripts/migrate-hhh-habit-to-habit.cypher against the configured
 * Neo4j instance and prints a summary of what was migrated.
 *
 * Usage:
 *   node scripts/run-migration.js
 *
 * Environment variables (all optional — defaults match docker-compose dev):
 *   NEO4J_URI       Neo4j bolt URI   (default: bolt://neo4j:7687)
 *   NEO4J_USER      Neo4j username   (default: neo4j)
 *   NEO4J_PASSWORD  Neo4j password   (default: password)
 */

import neo4j from 'neo4j-driver';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

const NEO4J_URI = process.env.NEO4J_URI || 'bolt://neo4j:7687';
const NEO4J_USER = process.env.NEO4J_USER || 'neo4j';
const NEO4J_PASSWORD = process.env.NEO4J_PASSWORD || 'password';

// Parse the Cypher file into individual statements (split on ';', strip comments/blanks)
function parseCypherStatements(filePath) {
  const raw = readFileSync(filePath, 'utf8');
  return raw
    .split(';')
    .map((stmt) =>
      stmt
        .split('\n')
        .filter((line) => !line.trim().startsWith('//'))
        .join('\n')
        .trim()
    )
    .filter(Boolean);
}

async function run() {
  const driver = neo4j.driver(
    NEO4J_URI,
    neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD)
  );

  const session = driver.session();
  try {
    // Pre-flight: count how many hhh__Habit nodes exist and how many already
    // have a matching Habit node (those will be skipped on MERGE).
    const countResult = await session.run(`
      MATCH (h:hhh__Habit)
      WITH h, coalesce(h.hhh__id, h.uri) AS habitId
      WHERE habitId IS NOT NULL
      OPTIONAL MATCH (existing:Habit {uuid: habitId})
      RETURN
        count(h)                                                    AS total,
        sum(CASE WHEN existing IS NULL     THEN 1 ELSE 0 END)      AS toMigrate,
        sum(CASE WHEN existing IS NOT NULL THEN 1 ELSE 0 END)      AS alreadyExist
    `);

    const row = countResult.records[0];
    const total = row.get('total').toNumber
      ? row.get('total').toNumber()
      : Number(row.get('total'));
    const toMigrate = row.get('toMigrate').toNumber
      ? row.get('toMigrate').toNumber()
      : Number(row.get('toMigrate'));
    const alreadyExist = row.get('alreadyExist').toNumber
      ? row.get('alreadyExist').toNumber()
      : Number(row.get('alreadyExist'));

    console.log(
      `[migration] Found ${total} hhh__Habit node(s): ${toMigrate} to migrate, ${alreadyExist} already exist.`
    );

    if (toMigrate === 0 && alreadyExist === 0) {
      console.log('[migration] No hhh__Habit nodes found — nothing to do.');
      return;
    }

    // Execute each Cypher statement from the migration file
    const cypherFile = join(__dirname, 'migrate-hhh-habit-to-habit.cypher');
    const statements = parseCypherStatements(cypherFile);

    for (let i = 0; i < statements.length; i++) {
      const stmt = statements[i];
      console.log(`[migration] Running step ${i + 1}/${statements.length}…`);
      await session.run(stmt);
    }

    // Summary
    console.log(
      `[migration] Done. Migrated ${toMigrate} habits, skipped ${alreadyExist} (already exist).`
    );
  } finally {
    await session.close();
    await driver.close();
  }
}

run().catch((err) => {
  console.error('[migration] Fatal error:', err.message);
  process.exit(1);
});
