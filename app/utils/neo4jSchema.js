import neo4j from 'neo4j-driver';
import { config } from './config.js';
import { logger } from './logger.js';

const log = logger.child({ module: 'neo4jSchema' });

/**
 * Constraint / index statements for the current graph schema.
 * All statements are idempotent (`IF NOT EXISTS`), so this can run on every
 * startup. Origin: review finding US-133 (see docs/migration.md).
 */
const SCHEMA_STATEMENTS = [
  // Prevents duplicate donations
  // (names match neo4j/init/constraints.cypher to avoid equivalent duplicates)
  `CREATE CONSTRAINT habit_uuid IF NOT EXISTS
     FOR (h:Habit) REQUIRE h.uuid IS UNIQUE`,
  // Context deduplication during the donation pipeline MERGE
  `CREATE INDEX context_text_dim IF NOT EXISTS
     FOR (c:Context) ON (c.text, c.dimension)`,
  // One node per BCIO concept
  `CREATE CONSTRAINT bcio_uri_unique IF NOT EXISTS
     FOR (b:BCIOConcept) REQUIRE b.uri IS UNIQUE`,
  // Community comments on habits (anonymous nodes, erased via id on account deletion)
  `CREATE CONSTRAINT comment_id_unique IF NOT EXISTS
     FOR (c:Comment) REQUIRE c.id IS UNIQUE`,
];

/**
 * Ensure Neo4j constraints and indexes for the habit graph exist.
 * Non-fatal: failures are logged but never crash startup (Neo4j may still be
 * booting; the donation pipeline works without the constraints, just slower
 * and without duplicate protection).
 *
 * @returns {Promise<boolean>} true when all statements were applied.
 */
export async function ensureNeo4jSchema() {
  const driver = neo4j.driver(
    config.neo4j.uri,
    neo4j.auth.basic(config.neo4j.user, config.neo4j.password)
  );
  const session = driver.session();
  try {
    for (const statement of SCHEMA_STATEMENTS) {
      await session.run(statement);
    }
    log.info('Neo4j constraints/indexes ensured (habit graph schema)');
    return true;
  } catch (err) {
    log.warn({ err }, 'Could not ensure Neo4j schema (will retry on next start)');
    return false;
  } finally {
    await session.close();
    await driver.close();
  }
}
