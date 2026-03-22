/**
 * Named Neo4j query functions for the Admin domain.
 *
 * Cypher strings that were previously scattered across service files are
 * centralised here. Callers are responsible for validating inputs (e.g.,
 * whitelisting group labels) before invoking these functions.
 */

/**
 * Remove all existing hhh__GroupN labels from a donor node and set the new one.
 * Callers MUST verify that `newLabel` is in the VALID_GROUPS whitelist before
 * calling this function to prevent Cypher label injection.
 *
 * @param {Function} neo4jRun - Neo4j query runner
 * @param {string} userId     - The hhh__id property of the donor node
 * @param {string} newLabel   - Validated group label (e.g. 'hhh__Group1')
 * @returns {Promise<void>}
 */
export async function assignGroupLabel(neo4jRun, userId, newLabel) {
  const cypher = [
    'MATCH (d:hhh__Donor {hhh__id: $userId})',
    'REMOVE d:hhh__Group1 REMOVE d:hhh__Group2 REMOVE d:hhh__Group3 REMOVE d:hhh__Group4',
    `SET d:\`${newLabel}\``,
    'RETURN d',
  ].join(' ');
  await neo4jRun(cypher, { userId }).catch(() => {});
}

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
