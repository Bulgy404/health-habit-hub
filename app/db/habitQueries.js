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
 * Return habit counts grouped by context dimension (TIME, BEHAVIOR, PHYSICAL_SETTING, …).
 * Only counts confirmed habits (is_habit = true), excluding seeded examples.
 * @param {Function} queryNeo4j
 * @returns {Promise<Array>} Array of { category, count }
 */
export async function getHabitsByCategory(queryNeo4j) {
  return queryNeo4j(`
    MATCH (h:Habit)-[:HAS_CONTEXT]->(c:Context)
    WHERE (h.seeded IS NULL OR h.seeded = false) AND h.is_habit = true
    RETURN c.dimension AS category, count(DISTINCT h.uuid) AS count
    ORDER BY count DESC
  `);
}

/**
 * Return all habits grouped by context dimension for the bubble graph view.
 * A habit may appear in multiple dimensions (one row per dimension it has context in).
 * Includes seeded habits so the view is populated from day one.
 * @param {Function} queryNeo4j
 * @returns {Promise<Array>} Array of { habitId, habitLabel, originalText, language, dimension }
 */
export async function getHabitBubbleGraph(queryNeo4j) {
  return queryNeo4j(`
    MATCH (h:Habit {is_habit: true})-[:HAS_CONTEXT]->(c:Context)
    RETURN DISTINCT
      h.uuid                                AS habitId,
      coalesce(h.translationEN, h.sentence) AS habitLabel,
      coalesce(h.sentence, '')              AS originalText,
      coalesce(h.language, '')              AS language,
      c.dimension                           AS dimension
    ORDER BY c.dimension, habitLabel
  `);
}

/**
 * Return all habits donated by a specific user, with their context dimensions.
 * One row per (habit, dimension) pair — callers must group by habitId.
 * @param {Function} queryNeo4j
 * @param {string} userId  Keycloak subject UUID
 * @returns {Promise<Array>} Array of { habitId, habitLabel, originalText, language, dimension }
 */
export async function getUserHabits(queryNeo4j, userId) {
  return queryNeo4j(`
    MATCH (h:Habit {is_habit: true, userID: $userId})-[:HAS_CONTEXT]->(c:Context)
    RETURN DISTINCT
      h.uuid                                AS habitId,
      coalesce(h.translationEN, h.sentence) AS habitLabel,
      coalesce(h.sentence, '')              AS originalText,
      coalesce(h.language, '')              AS language,
      c.dimension                           AS dimension
    ORDER BY habitLabel
  `, { userId });
}

/**
 * Increment or decrement the annotation count stored directly on a Habit node.
 * `delta` should be +1 (add) or -1 (remove). The count is clamped to 0.
 * @param {Function} queryNeo4j
 * @param {string} habitId
 * @param {'helpful'|'iDoThis'} type
 * @param {number} delta  +1 or -1
 * @returns {Promise<void>}
 */
export async function updateHabitAnnotation(queryNeo4j, habitId, type, delta) {
  if (type === 'iDoThis') {
    await queryNeo4j(
      `MATCH (h:Habit {uuid: $habitId})
       WITH h, coalesce(h.annotations_iDoThis, 0) + $delta AS newVal
       SET h.annotations_iDoThis = CASE WHEN newVal < 0 THEN 0 ELSE newVal END`,
      { habitId, delta }
    );
  } else {
    await queryNeo4j(
      `MATCH (h:Habit {uuid: $habitId})
       WITH h, coalesce(h.annotations_helpful, 0) + $delta AS newVal
       SET h.annotations_helpful = CASE WHEN newVal < 0 THEN 0 ELSE newVal END`,
      { habitId, delta }
    );
  }
}

/**
 * Return the Neo4j graph structure: Habit nodes, BCIOConcept nodes, and edges.
 * Includes seeded example habits (no `seeded` filter) so the graph is populated
 * from day one, consistent with getPublicHabits.
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
