/**
 * Named Neo4j query functions for the Habit domain.
 *
 * All functions accept a `queryNeo4j(cypher, params)` runner as their first
 * argument so they can be used with either an injected test stub or the real
 * driver. This keeps Cypher strings out of route handlers and service layers.
 */

/**
 * Return all donated habits with translation fields.
 * @param {Function} queryNeo4j
 * @returns {Promise<Array>}
 */
export async function getAllHabits(queryNeo4j) {
  return queryNeo4j(`
    MATCH (h:Habit)
    RETURN h.uuid AS uuid,
           h.sentence AS original,
           h.language AS language,
           h.translationEN AS translationEN,
           h.translationDE AS translationDE
  `);
}

/**
 * Return anonymized public habits (uuid + sentence, no personal data).
 * @param {Function} queryNeo4j
 * @returns {Promise<Array>}
 */
export async function getPublicHabits(queryNeo4j) {
  return queryNeo4j(`
    MATCH (h:Habit)
    RETURN h.uuid AS id,
           h.sentence AS name,
           null AS category,
           null AS bcioClass
  `);
}

/**
 * Return the total count of Habit nodes.
 * @param {Function} queryNeo4j
 * @returns {Promise<Array>} Single-element array with { total }
 */
export async function getHabitTotal(queryNeo4j) {
  return queryNeo4j('MATCH (h:Habit) RETURN count(h) AS total');
}

/**
 * Return habit counts grouped by language (used as a category proxy).
 * @param {Function} queryNeo4j
 * @returns {Promise<Array>} Array of { category, count }
 */
export async function getHabitsByCategory(queryNeo4j) {
  return queryNeo4j(`
    MATCH (h:Habit)
    WITH h.language AS cat, count(h) AS cnt
    RETURN coalesce(cat, 'unknown') AS category, cnt AS count
  `);
}
