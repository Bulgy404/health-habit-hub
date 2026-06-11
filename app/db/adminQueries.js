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
