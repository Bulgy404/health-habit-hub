/**
 * Named Neo4j query functions for the questionnaire domain.
 *
 * Same convention as `db/userQueries.js`: every function takes a
 * `queryNeo4j(cypher, params)` runner first, so routes/services stay free of
 * Cypher and tests can inject a stub.
 *
 * Graph model this module maintains:
 *
 *   (:Study)-[:HAS_QUESTIONNAIRE]->(:Questionnaire {slug, title, version})
 *   (:Questionnaire)-[:HAS_ITEM]->(:QuestionnaireItem {uid, itemId, text, type, position})
 *
 *   (:User {userID})-[:SUBMITTED]->(:QuestionnaireResponse {responseId, submittedAt})
 *   (:QuestionnaireResponse)-[:FOR_QUESTIONNAIRE]->(:Questionnaire)
 *   (:QuestionnaireResponse)-[:HAS_ANSWER {value, rawValue}]->(:QuestionnaireItem)
 *
 * One QuestionnaireResponse per completion, so repeated fills of the same
 * questionnaire form a time series while sharing the questionnaire's item nodes.
 *
 * NOTE: `Study -[:HAS_QUESTIONNAIRE]-> Questionnaire` is owned by
 * `services/enrollmentNeo4j.js:syncStudy` (driven by assignment changes) — this
 * module only creates/enriches the Questionnaire node and everything below it.
 */

/** Composite identity for an item, as a single property (Community-safe). */
function itemUid(slug, itemId) {
  return `${slug}::${itemId}`;
}

/**
 * Sync one questionnaire definition into the graph: the Questionnaire node and
 * its QuestionnaireItem children.
 *
 * Idempotent, and prunes items that are no longer part of the definition (an
 * admin removing a question drops the item node, but existing answers to it are
 * kept as `adhoc` items re-created by createQuestionnaireResponse if needed).
 *
 * @param {Function} queryNeo4j
 * @param {{slug: string, title?: string, version?: string|number,
 *          questions?: Array<{id: string, text?: string, type?: string}>}} definition
 */
export async function syncQuestionnaireDefinition(queryNeo4j, definition = {}) {
  const { slug, title, version, questions } = definition;
  if (!slug || typeof slug !== 'string') return;

  const items = (Array.isArray(questions) ? questions : [])
    .filter((q) => q && q.id)
    .map((q, index) => ({
      uid: itemUid(slug, String(q.id)),
      itemId: String(q.id),
      // `text` may be a plain string or a { en, de, ... } localisation map.
      text: typeof q.text === 'string' ? q.text : JSON.stringify(q.text ?? ''),
      type: q.type ? String(q.type) : 'unknown',
      position: index,
    }));

  await queryNeo4j(
    `MERGE (q:Questionnaire {slug: $slug})
     SET q.title = $title,
         q.version = $version,
         q.updatedAt = datetime()
     WITH q
     // Add / refresh the items in the current definition
     CALL {
       WITH q
       UNWIND $items AS item
       MERGE (i:QuestionnaireItem {uid: item.uid})
       SET i.questionnaireSlug = $slug,
           i.itemId = item.itemId,
           i.text = item.text,
           i.type = item.type,
           i.position = item.position,
           i.adhoc = false
       MERGE (q)-[:HAS_ITEM]->(i)
     }
     WITH q
     // Drop items that are no longer in the definition
     CALL {
       WITH q
       MATCH (q)-[:HAS_ITEM]->(old:QuestionnaireItem)
       WHERE NOT old.uid IN $uids
       DETACH DELETE old
     }
     RETURN q.slug AS slug`,
    {
      slug,
      title: title == null ? null : String(title),
      version: version == null ? null : String(version),
      items,
      uids: items.map((i) => i.uid),
    }
  );
}

/**
 * Remove a questionnaire and its items from the graph (admin deleted it).
 * Responses are left intact but lose their FOR_QUESTIONNAIRE target, so this is
 * only called when the definition itself is deleted.
 *
 * @param {Function} queryNeo4j
 * @param {string} slug
 */
export async function deleteQuestionnaireDefinition(queryNeo4j, slug) {
  if (!slug || typeof slug !== 'string') return;
  await queryNeo4j(
    `MATCH (q:Questionnaire {slug: $slug})
     OPTIONAL MATCH (q)-[:HAS_ITEM]->(i:QuestionnaireItem)
     DETACH DELETE i, q`,
    { slug }
  );
}

/**
 * Record one completed questionnaire as a timestamped QuestionnaireResponse
 * linked to the participant, the questionnaire, and each answered item.
 *
 * Idempotent on `responseId` (the MongoDB `form_responses._id`), so a retried
 * sync updates rather than duplicates.
 *
 * Answer keys that aren't in the questionnaire definition still get an item
 * node (flagged `adhoc: true`) so nothing is ever left dangling.
 *
 * @param {Function} queryNeo4j
 * @param {{userId: string, questionnaireSlug: string, responseId: string,
 *          submittedAt?: Date|string, answers?: Object}} params
 */
export async function createQuestionnaireResponse(
  queryNeo4j,
  { userId, questionnaireSlug, responseId, submittedAt, answers } = {}
) {
  if (!userId || !questionnaireSlug || !responseId) return;

  const entries = Object.entries(answers || {}).map(([itemId, rawValue]) => {
    const numeric = parseFloat(rawValue);
    return {
      uid: itemUid(questionnaireSlug, itemId),
      itemId: String(itemId),
      // Numeric score when the answer parses as a number (scales, Likert…),
      // null otherwise — `rawValue` always keeps the original answer so free
      // text and multi-select aren't silently coerced to 0.
      value: Number.isFinite(numeric) ? numeric : null,
      rawValue:
        rawValue === null || rawValue === undefined
          ? null
          : typeof rawValue === 'object'
            ? JSON.stringify(rawValue)
            : String(rawValue),
    };
  });

  const submittedAtIso =
    submittedAt instanceof Date
      ? submittedAt.toISOString()
      : submittedAt
        ? new Date(submittedAt).toISOString()
        : new Date().toISOString();

  await queryNeo4j(
    `MERGE (u:User {userID: $userId})
       ON CREATE SET u.createdAt = datetime()
     MERGE (q:Questionnaire {slug: $questionnaireSlug})
     MERGE (r:QuestionnaireResponse {responseId: $responseId})
       ON CREATE SET r.submittedAt = datetime($submittedAt)
       ON MATCH  SET r.submittedAt = datetime($submittedAt)
     SET r.questionnaireSlug = $questionnaireSlug
     MERGE (u)-[:SUBMITTED]->(r)
     MERGE (r)-[:FOR_QUESTIONNAIRE]->(q)
     WITH r, q
     // Replace any previous answers for this response (idempotent re-sync)
     CALL {
       WITH r
       MATCH (r)-[a:HAS_ANSWER]->()
       DELETE a
     }
     WITH r, q
     UNWIND $entries AS entry
     MERGE (i:QuestionnaireItem {uid: entry.uid})
       ON CREATE SET i.questionnaireSlug = $questionnaireSlug,
                     i.itemId = entry.itemId,
                     i.adhoc = true
     MERGE (q)-[:HAS_ITEM]->(i)
     CREATE (r)-[:HAS_ANSWER {value: entry.value, rawValue: entry.rawValue}]->(i)`,
    {
      userId: String(userId),
      questionnaireSlug: String(questionnaireSlug),
      responseId: String(responseId),
      submittedAt: submittedAtIso,
      entries,
    }
  );
}
