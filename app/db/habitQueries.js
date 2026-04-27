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
    OPTIONAL MATCH (h)-[:HAS_CONTEXT]->(:Context)-[:MAPS_TO]->(b:BCIOConcept)
    WITH h,
         head(collect(b.bcio_concept_label)) AS bcioLabel,
         head(collect(b.bcio_concept_id))    AS bcioId
    RETURN h.uuid AS uuid,
           h.sentence AS original,
           h.language AS language,
           h.translationEN AS translationEN,
           h.translationDE AS translationDE,
           coalesce(bcioLabel, 'Other') AS category,
           coalesce(bcioId, '')         AS bcioClass
  `);
}

/**
 * Return anonymized public habits (uuid + sentence, no personal data).
 * Includes seeded example habits so the explore graph is populated from day one.
 * @param {Function} queryNeo4j
 * @returns {Promise<Array>}
 */
export async function getPublicHabits(queryNeo4j) {
  return queryNeo4j(`
    MATCH (h:Habit)
    OPTIONAL MATCH (h)-[:HAS_CONTEXT]->(:Context)-[:MAPS_TO]->(b:BCIOConcept)
    WITH h,
         head(collect(b.bcio_concept_label)) AS bcioLabel,
         head(collect(b.bcio_concept_id))    AS bcioId
    RETURN h.uuid AS id,
           h.sentence AS name,
           coalesce(bcioLabel, 'Other')  AS category,
           coalesce(bcioId, '')          AS bcioClass
  `);
}

/**
 * Return the total count of Habit nodes, excluding seeded example habits.
 * @param {Function} queryNeo4j
 * @returns {Promise<Array>} Single-element array with { total }
 */
export async function getHabitTotal(queryNeo4j) {
  return queryNeo4j(
    'MATCH (h:Habit) WHERE h.seeded IS NULL OR h.seeded = false RETURN count(h) AS total'
  );
}

/**
 * Return habit counts grouped by BCIO class, excluding seeded example habits.
 * Falls back to 'Unclassified' when no bcioClass is set.
 * @param {Function} queryNeo4j
 * @returns {Promise<Array>} Array of { category, count }
 */
export async function getHabitsByCategory(queryNeo4j) {
  return queryNeo4j(`
    MATCH (h:Habit)
    WHERE h.seeded IS NULL OR h.seeded = false
    WITH coalesce(h.bcioClass, 'Unclassified') AS cat, count(h) AS cnt
    RETURN cat AS category, cnt AS count
  `);
}

/**
 * Return the Neo4j graph structure: Habit nodes, BCIOConcept nodes, and edges.
 * Deduplication is done by the caller (see createHabitsRouter GET /graph).
 * @param {Function} queryNeo4j
 * @returns {Promise<Array>}
 */
export async function getHabitGraph(queryNeo4j) {
  return queryNeo4j(`
    MATCH (b:BCIOConcept)<-[:MAPS_TO]-(:Context)<-[:HAS_CONTEXT]-(h:Habit)
    RETURN DISTINCT
      h.uuid                                   AS habitId,
      coalesce(h.translationEN, h.sentence)    AS habitLabel,
      coalesce(h.sentence, '')                 AS originalText,
      coalesce(h.language, '')                 AS language,
      b.bcio_concept_id                        AS conceptId,
      b.bcio_concept_label                     AS conceptLabel
  `);
}
