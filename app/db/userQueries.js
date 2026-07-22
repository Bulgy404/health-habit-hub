/**
 * Named Neo4j query functions for the User/questionnaire-trajectory domain.
 *
 * All functions accept a `queryNeo4j(cypher, params)` runner as their first
 * argument so they can be used with either an injected test stub or the real
 * driver. This keeps Cypher strings out of route and service layers.
 */

/**
 * MERGE a User node and link it to all existing Habit nodes donated by that user.
 * Safe to call repeatedly — MERGE on User and MERGE on [:DONATED] are idempotent.
 * @param {Function} queryNeo4j
 * @param {string} userId  Keycloak subject UUID
 */
export async function mergeUserAndHabits(queryNeo4j, userId) {
  await queryNeo4j(
    `MERGE (u:User {userID: $userId})
     ON CREATE SET u.createdAt = datetime()
     WITH u
     MATCH (h:Habit {userID: $userId})
     MERGE (u)-[:DONATED]->(h)`,
    { userId }
  );
}

/**
 * MERGE a User node and set profile properties derived from onboarding fields.
 * Uses SET u += $props (map-merge) to avoid string injection while supporting
 * dynamic property names. Date fields stored as ISO "YYYY-MM-DD" strings;
 * numbers as JS floats; text/select as strings.
 * No-op when all fields have null/undefined values.
 *
 * @param {Function} queryNeo4j
 * @param {string} userId  Keycloak subject UUID
 * @param {Array<{questionId: string, value: *, type: string}>} fields
 */
export async function setUserProfileProperties(queryNeo4j, userId, fields) {
  const props = {};
  for (const { questionId, value, type } of fields) {
    if (!questionId || value === undefined || value === null) continue;
    if (type === 'date') {
      const d = value instanceof Date ? value : new Date(value);
      if (!isNaN(d.getTime())) props[questionId] = d.toISOString().slice(0, 10);
    } else if (type === 'number') {
      const n = typeof value === 'number' ? value : parseFloat(value);
      if (!isNaN(n)) props[questionId] = n;
    } else {
      props[questionId] = String(value);
    }
  }
  if (Object.keys(props).length === 0) return;
  await queryNeo4j(
    `MERGE (u:User {userID: $userId})
     SET u += $props`,
    { userId, props }
  );
}
