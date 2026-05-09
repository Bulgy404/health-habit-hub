#!/usr/bin/env node
/**
 * backfill-user-nodes.js
 *
 * One-time script: creates User nodes and [:DONATED] edges for all existing
 * Habit nodes in Neo4j. Safe to run multiple times — all writes use MERGE.
 *
 * Questionnaire history is NOT backfilled — trajectory starts from deploy date.
 *
 * Usage (run from the app/ directory where neo4j-driver is installed):
 *   cd app
 *   NEO4J_URI=bolt://localhost:7687 \
 *   NEO4J_USER=neo4j \
 *   NEO4J_PASSWORD=yourpassword \
 *   node ../scripts/backfill-user-nodes.js [--dry-run]
 */

import neo4j from 'neo4j-driver';

const DRY_RUN = process.argv.includes('--dry-run');

const NEO4J_URI = process.env.NEO4J_URI || 'bolt://neo4j:7687';
const NEO4J_USER = process.env.NEO4J_USER || 'neo4j';
const NEO4J_PASSWORD = process.env.NEO4J_PASSWORD || 'password';

async function run() {
  if (DRY_RUN) console.log('[dry-run] No changes will be written.');

  const driver = neo4j.driver(NEO4J_URI, neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD));
  const session = driver.session();

  try {
    // 1. Collect all distinct userIDs from Habit nodes
    const result = await session.run(
      'MATCH (h:Habit) WHERE h.userID IS NOT NULL RETURN DISTINCT h.userID AS userId'
    );
    const userIds = result.records.map((r) => r.get('userId'));
    console.log(`Found ${userIds.length} distinct users with Habit nodes.`);

    if (DRY_RUN) {
      console.log('[dry-run] Would create User nodes for:', userIds);
      return;
    }

    // 2. For each user: MERGE User node + DONATED edges
    let count = 0;
    for (const userId of userIds) {
      await session.run(
        `MERGE (u:User {userId: $userId})
         ON CREATE SET u.createdAt = datetime()
         WITH u
         MATCH (h:Habit {userID: $userId})
         MERGE (u)-[:DONATED]->(h)`,
        { userId }
      );
      count++;
      if (count % 10 === 0) console.log(`  Processed ${count}/${userIds.length}`);
    }

    console.log(`Done. Created/merged User nodes for ${count} users.`);
  } finally {
    await session.close();
    await driver.close();
  }
}

run().catch((err) => {
  console.error('Backfill failed:', err.message);
  process.exit(1);
});
