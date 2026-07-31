/**
 * Named Neo4j query functions for the Admin domain.
 *
 * Cypher strings that were previously scattered across service files are
 * centralised here. Callers are responsible for validating inputs (e.g.,
 * whitelisting group labels) before invoking these functions.
 */

/**
 * Count Habit nodes belonging to a specific user.
 * Returns 0 if no habits are found or the count cannot be parsed.
 *
 * @param {Function} neo4jRun - Neo4j query runner
 * @param {string} userId     - The userID property on Habit nodes
 * @returns {Promise<number>}
 */
export async function countHabitsByUser(neo4jRun, userId) {
  const records = await neo4jRun(
    'MATCH (h:Habit {userID: $userId}) RETURN count(h) AS cnt',
    { userId }
  );
  const cnt = records[0]?.cnt;
  return typeof cnt?.toNumber === 'function' ? cnt.toNumber() : (cnt ?? 0);
}

/**
 * §7.5 Gamification — timestamps of every habit a user has shared/donated,
 * for share-based XP and the "shares regularly" badge. `created_at` is
 * stamped on the Habit node at donation time (habitDonationService.js) and
 * only donations ever create a Habit node for a given userID, so this is
 * equivalent to querying the `(:User)-[:DONATED]->(:Habit)` edge directly.
 *
 * @param {Function} neo4jRun - Neo4j query runner
 * @param {string} userId     - The userID property on Habit nodes
 * @returns {Promise<string[]>} ISO timestamps, oldest first
 */
export async function getDonationDatesByUser(neo4jRun, userId) {
  const records = await neo4jRun(
    `MATCH (h:Habit {userID: $userId}) WHERE h.created_at IS NOT NULL
     RETURN h.created_at AS at ORDER BY at ASC`,
    { userId }
  );
  return records.map((r) => r.at).filter((at) => typeof at === 'string');
}
