#!/usr/bin/env node
/**
 * migrate-habits-bcio.js
 *
 * Backfills BCIO concept mapping (M1.3, POST /api/v1/llm/map-bcio) for
 * existing habits, and optionally re-maps existing mappings made under a
 * looser confidence threshold than the one currently configured.
 *
 * BCIO mapping normally only runs once, synchronously, at habit-donation
 * time (see habitDonationService.js shareHabit -> mapBcio). A phrase that
 * scored below BCIO_MIN_CONFIDENCE that day, or that failed because of a
 * transient embedding/Neo4j error, is never retried automatically — this
 * script is the catch-up path. It's also the way to fix mappings made
 * before a matching-quality change (e.g. BCIO_MIN_CONFIDENCE was raised
 * from 0.6 to 0.75 after generic phrases like "most mornings" were observed
 * winning against unrelated concepts such as "relationship status: single")
 * without re-donating every affected habit.
 *
 * Two passes:
 *   1. (optional, via --reset-below=<n> or RESET_BELOW_CONFIDENCE) Delete
 *      existing MAPS_TO edges whose stored mapping_confidence is below <n>,
 *      then delete any BCIOConcept left with no remaining MAPS_TO edge.
 *      Context nodes are shared across every habit that produced the exact
 *      same phrase+dimension (MERGE-deduplicated), so this is a global
 *      cleanup, not scoped to one user or habit — reset mappings are shared
 *      infrastructure, same as the ontology itself.
 *   2. Re-run map-bcio for every Context node that (now) has no MAPS_TO
 *      edge, in threshold-respecting batches, and write any new mappings.
 *
 * Idempotent and safe to re-run — only Context nodes still missing MAPS_TO
 * are (re-)mapped. Phrases with no sufficiently-confident BCIO match will
 * keep coming up short (expected, not an error) until the ontology or
 * matching logic changes again.
 *
 * Usage (from repo root, with the local docker stack running):
 *   node scripts/migrate-habits-bcio.js
 *   node scripts/migrate-habits-bcio.js --dry-run
 *   node scripts/migrate-habits-bcio.js --reset-below=0.75
 *   node scripts/migrate-habits-bcio.js --reset-below=0.75 --dry-run
 *
 * In prod (see DEPLOYMENT.md "Backfill BCIO Enrichment for Existing Habits"):
 *   docker exec hhh-app node scripts/migrate-habits-bcio.js --dry-run
 *   docker exec hhh-app node scripts/migrate-habits-bcio.js --reset-below=0.75
 *
 * Environment variables:
 *   NEO4J_URI        Bolt URI for the shared driver (default: bolt://neo4j:7687)
 *   NEO4J_USER       (default: neo4j)
 *   NEO4J_PASSWORD   (default: password)
 *   API_SERVICE_URL  Recommender/API-service base URL (default: http://recommender:8000)
 *   API_SERVICE_SECRET  Service-to-service auth token, if configured
 *   RESET_BELOW_CONFIDENCE  Same as --reset-below=<n>; the flag wins if both are set.
 */

import { runNeo4j, closeAllNeo4jDrivers } from '../app/utils/neo4jDrivers.js';
import { mapBcio, _writeBcioMappings } from '../app/services/habitDonationService.js';
import { translateTerm } from '../app/utils/translate.js';

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const resetFlag = args.find((a) => a.startsWith('--reset-below='));
const RESET_BELOW_CONFIDENCE = resetFlag
  ? Number(resetFlag.split('=')[1])
  : process.env.RESET_BELOW_CONFIDENCE
    ? Number(process.env.RESET_BELOW_CONFIDENCE)
    : null;

const API_BASE =
  process.env.API_SERVICE_URL || process.env.API_BASE || 'http://recommender:8000';

// Mirrors _MAX_PHRASES_PER_DIMENSION / _MAX_DIMENSIONS in
// API-service/routers/map_bcio.py — batches must stay under both caps.
const MAX_PHRASES_PER_DIMENSION = 20;
const MAX_DIMENSIONS = 20;

/** Delete MAPS_TO edges below the confidence bar, then any now-orphaned BCIOConcept. */
async function resetLowConfidenceMappings(threshold) {
  const preview = await runNeo4j(
    `MATCH (c:Context)-[r:MAPS_TO]->(b:BCIOConcept)
     WHERE r.mapping_confidence < $threshold
     RETURN c.text AS phrase, c.dimension AS dimension,
            b.bcio_concept_label AS concept, r.mapping_confidence AS confidence`,
    { threshold }
  );
  console.log(
    `${DRY_RUN ? '[dry-run] Would reset' : 'Resetting'} ${preview.length} mapping(s) with confidence < ${threshold}:`
  );
  for (const row of preview.slice(0, 20)) {
    console.log(
      `  "${row.phrase}" (${row.dimension}) -> "${row.concept}" [${row.confidence.toFixed(3)}]`
    );
  }
  if (preview.length > 20) console.log(`  ...and ${preview.length - 20} more`);

  if (DRY_RUN || preview.length === 0) return;

  await runNeo4j(
    `MATCH (c:Context)-[r:MAPS_TO]->(b:BCIOConcept)
     WHERE r.mapping_confidence < $threshold
     DELETE r`,
    { threshold }
  );

  const orphaned = await runNeo4j(
    `MATCH (b:BCIOConcept) WHERE NOT (:Context)-[:MAPS_TO]->(b)
     DETACH DELETE b
     RETURN count(b) AS deleted`
  );
  console.log(`Deleted ${orphaned[0]?.deleted ?? 0} now-orphaned BCIOConcept node(s).`);
}

async function fetchUnmappedContexts() {
  return runNeo4j(
    `MATCH (c:Context)
     WHERE NOT (c)-[:MAPS_TO]->(:BCIOConcept)
     RETURN DISTINCT c.text AS text, c.dimension AS dimension`
  );
}

/** Split unmapped {text, dimension} rows into request-sized batches. */
function buildBatches(rows) {
  const byDimension = new Map();
  for (const { text, dimension } of rows) {
    if (!text || !dimension) continue;
    if (!byDimension.has(dimension)) byDimension.set(dimension, []);
    byDimension.get(dimension).push(text);
  }

  const dimensionChunks = [];
  for (const [dimension, phrases] of byDimension) {
    for (let i = 0; i < phrases.length; i += MAX_PHRASES_PER_DIMENSION) {
      dimensionChunks.push({
        dimension,
        phrases: phrases.slice(i, i + MAX_PHRASES_PER_DIMENSION),
      });
    }
  }

  const batches = [];
  for (let i = 0; i < dimensionChunks.length; i += MAX_DIMENSIONS) {
    const group = dimensionChunks.slice(i, i + MAX_DIMENSIONS);
    batches.push(
      Object.fromEntries(group.map(({ dimension, phrases }) => [dimension, phrases]))
    );
  }
  return batches;
}

async function main() {
  if (RESET_BELOW_CONFIDENCE !== null) {
    if (!Number.isFinite(RESET_BELOW_CONFIDENCE)) {
      throw new Error(`Invalid --reset-below / RESET_BELOW_CONFIDENCE value`);
    }
    await resetLowConfidenceMappings(RESET_BELOW_CONFIDENCE);
  }

  const unmapped = await fetchUnmappedContexts();
  console.log(`Found ${unmapped.length} Context node(s) without a MAPS_TO edge.`);
  if (unmapped.length === 0) return;

  if (DRY_RUN) {
    console.log('[dry-run] Skipping map-bcio calls and writes.');
    return;
  }

  const batches = buildBatches(unmapped);
  let attempted = 0;
  let mappedCount = 0;

  for (const [i, contextPhrases] of batches.entries()) {
    const phrasesInBatch = Object.values(contextPhrases).reduce(
      (n, list) => n + list.length,
      0
    );
    attempted += phrasesInBatch;
    console.log(
      `Batch ${i + 1}/${batches.length}: mapping ${phrasesInBatch} phrase(s) across ${Object.keys(contextPhrases).length} dimension(s)...`
    );

    const mappings = await mapBcio('backfill', contextPhrases, API_BASE);
    mappedCount += mappings.length;
    await _writeBcioMappings(mappings, runNeo4j, { apiBase: API_BASE, translateTerm });
  }

  console.log(
    `Done. ${mappedCount}/${attempted} phrase(s) mapped to a BCIO concept this run; ` +
      `${attempted - mappedCount} remain below BCIO_MIN_CONFIDENCE.`
  );
}

main()
  .catch((err) => {
    console.error('migrate-habits-bcio failed:', err);
    process.exitCode = 1;
  })
  .finally(() => closeAllNeo4jDrivers());
