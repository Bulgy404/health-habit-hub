#!/usr/bin/env node
/**
 * migrate-habits-bcio.js
 *
 * Migrates existing Neo4j Habit nodes to the BCIO-enriched ontology by running
 * them through M1.2 (classify-context) and M1.3 (map-bcio) via the API-service.
 *
 * Usage:
 *   node scripts/migrate-habits-bcio.js [--dry-run]
 *
 * Environment variables:
 *   NEO4J_URI          Neo4j bolt URI (default: bolt://neo4j:7687)
 *   NEO4J_USER         Neo4j username (default: neo4j)
 *   NEO4J_PASSWORD     Neo4j password (default: password)
 *   API_SERVICE_URL    API-service base URL (default: http://recommender:8000)
 */

import neo4j from 'neo4j-driver';

const DRY_RUN = process.argv.includes('--dry-run');

const NEO4J_URI = process.env.NEO4J_URI || 'bolt://neo4j:7687';
const NEO4J_USER = process.env.NEO4J_USER || 'neo4j';
const NEO4J_PASSWORD = process.env.NEO4J_PASSWORD || 'password';
const API_BASE = process.env.API_SERVICE_URL || 'http://recommender:8000';

const DIMENSIONS = [
  'TIME',
  'PHYSICAL_SETTING',
  'PRIOR_BEHAVIOR',
  'OTHER_PEOPLE',
  'INTERNAL_STATE',
  'BEHAVIOR',
  'REASONING',
];

async function run() {
  if (DRY_RUN) {
    console.log('[dry-run] No changes will be written to Neo4j.');
  }

  const driver = neo4j.driver(
    NEO4J_URI,
    neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD)
  );

  let session;
  try {
    session = driver.session();

    // Fetch all Habit nodes that have not yet been migrated
    const result = await session.run(
      `MATCH (h:Habit)
       WHERE h.migrated_to_bcio IS NULL OR h.migrated_to_bcio = false
       RETURN h.uuid AS uuid, h.sentence AS sentence, h.language AS language`
    );

    const habits = result.records.map((r) => ({
      uuid: r.get('uuid'),
      sentence: r.get('sentence'),
      language: r.get('language'),
    }));

    const total = habits.length;
    console.log(`Found ${total} habit(s) to migrate.`);

    let succeeded = 0;
    let failed = 0;

    for (let i = 0; i < habits.length; i++) {
      const { uuid, sentence, language } = habits[i];
      console.log(`[${i + 1}/${total}] Processing habit ${uuid}…`);

      try {
        // M1.2: Extract context dimensions
        const contextRes = await fetch(
          `${API_BASE}/api/v1/llm/classify-context`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ uuid, sentence, language }),
          }
        );

        if (!contextRes.ok) {
          throw new Error(
            `classify-context returned HTTP ${contextRes.status}`
          );
        }

        const context = await contextRes.json();

        // Build context_phrases map (non-empty dims only)
        const contextPhrases = {};
        for (const dim of DIMENSIONS) {
          if (Array.isArray(context[dim]) && context[dim].length > 0) {
            contextPhrases[dim] = context[dim];
          }
        }

        // M1.3: Map BCIO concepts
        const bcioRes = await fetch(`${API_BASE}/api/v1/llm/map-bcio`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ uuid, context_phrases: contextPhrases }),
        });

        if (!bcioRes.ok) {
          throw new Error(`map-bcio returned HTTP ${bcioRes.status}`);
        }

        const bcioData = await bcioRes.json();
        const mappings = bcioData.mappings || [];

        if (!DRY_RUN) {
          // Write Context nodes + HAS_CONTEXT relationships
          for (const [dimension, phrases] of Object.entries(contextPhrases)) {
            for (const phrase of phrases) {
              await session.run(
                `MERGE (c:Context {text: $text, dimension: $dimension})
                 WITH c
                 MATCH (h:Habit {uuid: $habitUuid})
                 MERGE (h)-[:HAS_CONTEXT {dimension: $dimension}]->(c)`,
                { text: phrase, dimension, habitUuid: uuid }
              );
            }
          }

          // Write BCIOConcept nodes + MAPS_TO relationships
          for (const mapping of mappings) {
            await session.run(
              `MERGE (b:BCIOConcept {bcio_concept_id: $bcio_concept_id})
               ON CREATE SET b.bcio_concept_label = $bcio_concept_label
               WITH b
               MATCH (c:Context {text: $phrase, dimension: $dimension})
               MERGE (c)-[:MAPS_TO {confidence: $confidence, phrase: $phrase, dimension: $dimension}]->(b)`,
              {
                bcio_concept_id: mapping.bcio_concept_id,
                bcio_concept_label: mapping.bcio_concept_label,
                phrase: mapping.phrase,
                dimension: mapping.dimension,
                confidence: mapping.confidence,
              }
            );
          }

          // Mark the Habit node as migrated
          await session.run(
            `MATCH (h:Habit {uuid: $uuid})
             SET h.migrated_to_bcio = true, h.migrated_at = $migrated_at`,
            { uuid, migrated_at: new Date().toISOString() }
          );
        } else {
          console.log(
            `  [dry-run] Would write ${Object.values(contextPhrases).flat().length} context phrase(s) and ${mappings.length} BCIO mapping(s).`
          );
        }

        succeeded++;
        console.log(`  ✓ Succeeded`);
      } catch (err) {
        failed++;
        console.error(`  ✗ Failed: ${err.message}`);
      }
    }

    console.log(
      `\nProcessed ${total} habits — ${succeeded} succeeded, ${failed} failed.`
    );

    if (failed > 0) {
      process.exit(1);
    }
  } finally {
    if (session) await session.close();
    await driver.close();
  }
}

run().catch((err) => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
