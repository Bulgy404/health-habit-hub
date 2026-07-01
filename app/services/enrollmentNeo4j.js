/**
 * Neo4j enrollment operations.
 *
 * All functions accept a `neo4jRun(cypher, params)` helper that returns an
 * array of plain JS objects (records already converted via .toObject()).
 * Access values as `row.fieldName`.
 */

/**
 * Get enrollment for a single user.
 * @param {Function} neo4jRun
 * @param {string} userId
 * @returns {Promise<{ studyId: string, groupId: string|null, enrolledAt: any, studyCodeUsed: string|null }|null>}
 */
export async function getEnrollment(neo4jRun, userId) {
  const rows = await neo4jRun(
    `MATCH (u:User {userID: $userId})-[e:ENROLLED_IN]->(s:Study)
     RETURN s.uuid AS studyId, e.groupId AS groupId,
            e.enrolledAt AS enrolledAt, e.studyCodeUsed AS studyCodeUsed
     LIMIT 1`,
    { userId: String(userId) }
  );
  if (!rows || rows.length === 0) return null;
  const row = rows[0];
  return {
    studyId: row.studyId ?? null,
    groupId: row.groupId ?? null,
    enrolledAt: row.enrolledAt ?? null,
    studyCodeUsed: row.studyCodeUsed ?? null,
  };
}

/**
 * Get all enrolled users for a study.
 * @param {Function} neo4jRun
 * @param {string} studyId
 * @returns {Promise<Array<{ userId: string, groupId: string|null, enrolledAt: any, studyCodeUsed: string|null }>>}
 */
export async function getUsersForStudy(neo4jRun, studyId) {
  const rows = await neo4jRun(
    `MATCH (u:User)-[e:ENROLLED_IN]->(s:Study {uuid: $studyId})
     RETURN u.userID AS userId, e.groupId AS groupId,
            e.enrolledAt AS enrolledAt, e.studyCodeUsed AS studyCodeUsed`,
    { studyId: String(studyId) }
  );
  return (rows || []).map((r) => ({
    userId: r.userId,
    groupId: r.groupId ?? null,
    enrolledAt: r.enrolledAt ?? null,
    studyCodeUsed: r.studyCodeUsed ?? null,
  }));
}

/**
 * Count enrolled users for a study.
 * @param {Function} neo4jRun
 * @param {string} studyId
 * @returns {Promise<number>}
 */
export async function countEnrollments(neo4jRun, studyId) {
  const rows = await neo4jRun(
    `MATCH (:User)-[:ENROLLED_IN]->(:Study {uuid: $studyId})
     RETURN count(*) AS n`,
    { studyId: String(studyId) }
  );
  const n = rows?.[0]?.n;
  return Number(n ?? 0);
}

/**
 * Create enrollment. Returns { created: true } or { alreadyEnrolled: true }.
 * Two-step: check then create (dev-only, no concurrent load).
 * @param {Function} neo4jRun
 * @param {{ userId: string, studyId: string, groupId: string|null, studyCodeUsed: string|null, enrolledAt?: any }} params
 */
export async function createEnrollment(
  neo4jRun,
  { userId, studyId, groupId, studyCodeUsed, enrolledAt }
) {
  // Step 1: check for existing enrollment
  const checkRows = await neo4jRun(
    `OPTIONAL MATCH (u:User {userID: $userId})-[:ENROLLED_IN]->(:Study)
     RETURN u IS NOT NULL AS exists LIMIT 1`,
    { userId: String(userId) }
  );
  const exists = checkRows?.[0]?.exists ?? false;
  if (exists) return { alreadyEnrolled: true };

  // Step 2: create enrollment
  const at =
    enrolledAt instanceof Date
      ? enrolledAt.toISOString()
      : (enrolledAt ?? new Date().toISOString());

  await neo4jRun(
    `MERGE (u:User {userID: $userId})
     MERGE (s:Study {uuid: $studyId})
     CREATE (u)-[e:ENROLLED_IN]->(s)
     SET e.enrolledAt = $enrolledAt,
         e.groupId = $groupId,
         e.studyCodeUsed = $code`,
    {
      userId: String(userId),
      studyId: String(studyId),
      enrolledAt: at,
      groupId: groupId ? String(groupId) : null,
      code: studyCodeUsed ?? null,
    }
  );
  return { created: true };
}

/**
 * Set a property on the ENROLLED_IN relationship (e.g. lastActiveAt, droppedOutAt).
 * Field name comes from trusted internal code, not user input.
 * @param {Function} neo4jRun
 * @param {string} userId
 * @param {string} field  - Property name (e.g. 'lastActiveAt')
 * @param {*} value
 */
export async function setEnrollmentField(neo4jRun, userId, field, value) {
  const serialized = value instanceof Date ? value.toISOString() : value;
  // Cypher does not support parameterised property keys; use template injection
  // (safe: field is always a trusted string literal from our own code).
  await neo4jRun(
    `MATCH (u:User {userID: $userId})-[e:ENROLLED_IN]->(:Study)
     SET e.\`${field}\` = $value`,
    { userId: String(userId), value: serialized }
  );
}

/**
 * Delete enrollment edges for a user (GDPR account deletion).
 * @param {Function} neo4jRun
 * @param {string} userId
 */
export async function deleteEnrollment(neo4jRun, userId) {
  await neo4jRun(
    `MATCH (u:User {userID: $userId})-[e:ENROLLED_IN]->(:Study)
     DELETE e`,
    { userId: String(userId) }
  );
}

/**
 * Sync a Study node and its HAS_QUESTIONNAIRE edges.
 * Call after createStudy / updateStudy.
 *
 * @param {Function} neo4jRun
 * @param {{ uuid: string, name: string, slugs: string[] }} study
 *   uuid  — the MongoDB _id.toString() of the study
 *   name  — the study name
 *   slugs — resolved questionnaire slug strings
 */
export async function syncStudy(neo4jRun, { uuid, name, slugs = [] }) {
  await neo4jRun(
    `MERGE (s:Study {uuid: $uuid})
     SET s.name = $name
     WITH s
     OPTIONAL MATCH (s)-[r:HAS_QUESTIONNAIRE]->() DELETE r
     WITH s
     FOREACH (slug IN $slugs |
       MERGE (q:Questionnaire {slug: slug})
       MERGE (s)-[:HAS_QUESTIONNAIRE]->(q)
     )`,
    {
      uuid: String(uuid),
      name: String(name),
      slugs: Array.isArray(slugs) ? slugs : [],
    }
  );
}
