/**
 * Named Neo4j query functions for the Habit domain.
 *
 * All functions accept a `queryNeo4j(cypher, params)` runner as their first
 * argument so they can be used with either an injected test stub or the real
 * driver. This keeps Cypher strings out of route handlers and service layers.
 */

// Habit nodes carry a translation slot per app locale (translationEN,
// translationDE, translationJA, translationFR, translationNL).
const TRANSLATABLE_LANGS = ['en', 'de', 'ja', 'fr', 'nl'];

/** Normalises a requested display language to one with a translation slot, defaulting to 'en'. */
function normalizeDisplayLang(lang) {
  const code = String(lang || '')
    .slice(0, 2)
    .toLowerCase();
  return TRANSLATABLE_LANGS.includes(code) ? code : 'en';
}

/**
 * Cypher expression picking a Habit node's display label in the requested
 * language: the original sentence when the habit was already donated in
 * that language (translating it back would be redundant and lossy), else
 * the matching translation slot, falling back to the English translation
 * and finally the original sentence if neither exists yet.
 * @param {string} habitVar - Cypher variable bound to the Habit node (e.g. 'h')
 */
function localizedLabelExpr(habitVar) {
  return `
    CASE WHEN toLower(left(coalesce(${habitVar}.language, ''), 2)) = $lang
      THEN ${habitVar}.sentence
      ELSE coalesce(properties(${habitVar})[$transKey], ${habitVar}.translationEN, ${habitVar}.sentence)
    END`;
}

// Neo4j returns Integer objects for integer properties; normalise them to JS numbers.
function neoInt(val) {
  if (val == null) return 0;
  if (typeof val === 'object' && typeof val.toNumber === 'function')
    return val.toNumber();
  return Number(val);
}

/**
 * Return the habits most semantically similar to [uuid], using the Neo4j
 * vector index over the inline habit embeddings (the same embeddings the
 * recommender uses). Excludes the source habit and classifier-rejected nodes.
 * Returns [] when the source has no embedding yet (caller should fall back).
 *
 * @param {Function} queryNeo4j
 * @param {string} uuid - Source habit uuid.
 * @param {number} [limit=10] - Max related habits to return.
 * @returns {Promise<Array>}
 */
export async function getRelatedHabits(queryNeo4j, uuid, limit = 10) {
  // queryNodes returns the source itself among the k nearest, so over-fetch.
  const k = Math.max(limit + 5, 10);
  const rows = await queryNeo4j(
    `MATCH (src:Habit {uuid: $uuid})
     WHERE src.embedding IS NOT NULL
     CALL db.index.vector.queryNodes('habit_embedding_idx', toInteger($k), src.embedding)
     YIELD node, score
     WHERE node.uuid <> $uuid AND node.is_habit = true
     RETURN node.uuid AS uuid,
            node.sentence AS original,
            node.translationEN AS translationEN,
            node.translationDE AS translationDE,
            coalesce(node.category, 'Other') AS category,
            score
     ORDER BY score DESC
     LIMIT toInteger($limit)`,
    { uuid, k, limit }
  );
  return rows.map((r) => ({
    uuid: r.uuid,
    original: r.original || null,
    translationEN: r.translationEN || null,
    translationDE: r.translationDE || null,
    category: r.category || 'Other',
    score: typeof r.score === 'number' ? r.score : Number(r.score) || 0,
  }));
}

/**
 * Return all donated habits with translation fields and Neo4j-mirrored annotation counts.
 * Only confirmed habits (is_habit = true) are returned; sentences rejected by
 * the classifier are still stored as Habit nodes (is_habit = false) for review
 * but are excluded here so they don't inflate the community list.
 * Annotation counts come directly from Habit node properties (maintained by
 * updateHabitAnnotation) — no MongoDB round-trip needed.
 * @param {Function} queryNeo4j
 * @returns {Promise<Array>}
 */
export async function getAllHabits(queryNeo4j) {
  const rows = await queryNeo4j(`
    MATCH (h:Habit)
    WHERE h.is_habit = true
    OPTIONAL MATCH (h)-[:HAS_CONTEXT]->(:Context)-[:MAPS_TO]->(b:BCIOConcept)
    WITH h,
         head(collect(b.bcio_concept_label)) AS bcioLabel,
         head(collect(b.bcio_concept_id))    AS bcioId
    OPTIONAL MATCH (h)<-[:COMMENT_ON]-(cm:Comment)
    WHERE cm IS NULL OR cm.approved = true OR cm.approved IS NULL
    WITH h, bcioLabel, bcioId, count(cm) AS commentCount
    RETURN h.uuid AS uuid,
           h.sentence AS original,
           h.language AS language,
           h.translationEN AS translationEN,
           h.translationDE AS translationDE,
           coalesce(bcioLabel, 'Other') AS category,
           coalesce(bcioId, '')         AS bcioClass,
           coalesce(h.annotations_helpful, 0) AS annotationsHelpful,
           coalesce(h.annotations_iDoThis, 0) AS annotationsIDoThis,
           coalesce(h.annotations_like, 0)    AS annotationsLike,
           commentCount
  `);
  return rows.map((r) => ({
    ...r,
    annotationsHelpful: neoInt(r.annotationsHelpful),
    annotationsIDoThis: neoInt(r.annotationsIDoThis),
    annotationsLike: neoInt(r.annotationsLike),
    commentCount: neoInt(r.commentCount),
  }));
}

/**
 * Return anonymized public habits (uuid + sentence, no personal data).
 * Includes seeded example habits so the explore graph is populated from day one,
 * but excludes classifier-rejected sentences (is_habit = false), which remain
 * stored as Habit nodes for review.
 * Annotation counts come directly from the Habit node — no MongoDB scan needed.
 * @param {Function} queryNeo4j
 * @returns {Promise<Array>}
 */
export async function getPublicHabits(queryNeo4j) {
  const rows = await queryNeo4j(`
    MATCH (h:Habit)
    WHERE h.is_habit = true OR h.seeded = true
    OPTIONAL MATCH (h)-[:HAS_CONTEXT]->(:Context)-[:MAPS_TO]->(b:BCIOConcept)
    WITH h,
         head(collect(b.bcio_concept_label)) AS bcioLabel,
         head(collect(b.bcio_concept_id))    AS bcioId
    OPTIONAL MATCH (h)<-[:COMMENT_ON]-(cm:Comment)
    WHERE cm IS NULL OR cm.approved = true OR cm.approved IS NULL
    WITH h, bcioLabel, bcioId, count(cm) AS commentCount
    RETURN h.uuid AS id,
           h.sentence AS name,
           coalesce(bcioLabel, 'Other')  AS category,
           coalesce(bcioId, '')          AS bcioClass,
           coalesce(h.annotations_helpful, 0) AS annotationsHelpful,
           coalesce(h.annotations_iDoThis, 0) AS annotationsIDoThis,
           coalesce(h.annotations_like, 0)    AS annotationsLike,
           commentCount
  `);
  return rows.map((r) => ({
    ...r,
    annotationsHelpful: neoInt(r.annotationsHelpful),
    annotationsIDoThis: neoInt(r.annotationsIDoThis),
    annotationsLike: neoInt(r.annotationsLike),
    commentCount: neoInt(r.commentCount),
  }));
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
 * @param {string} [lang='en'] - Viewer's app language; picks which translation slot habitLabel resolves to.
 * @returns {Promise<Array>} Array of { habitId, habitLabel, originalText, language, dimension }
 */
export async function getHabitBubbleGraph(queryNeo4j, lang = 'en') {
  const normalizedLang = normalizeDisplayLang(lang);
  return queryNeo4j(
    `
    MATCH (h:Habit {is_habit: true})-[:HAS_CONTEXT]->(c:Context)
    RETURN DISTINCT
      h.uuid                     AS habitId,
      ${localizedLabelExpr('h')} AS habitLabel,
      coalesce(h.sentence, '')   AS originalText,
      coalesce(h.language, '')   AS language,
      c.dimension                AS dimension
    ORDER BY c.dimension, habitLabel
  `,
    {
      lang: normalizedLang,
      transKey: `translation${normalizedLang.toUpperCase()}`,
    }
  );
}

/**
 * Return all habits donated by a specific user, with their context dimensions.
 * One row per (habit, dimension) pair — callers must group by habitId.
 * @param {Function} queryNeo4j
 * @param {string} userId  Keycloak subject UUID
 * @param {string} [lang='en'] - Viewer's app language; picks which translation slot habitLabel resolves to.
 * @returns {Promise<Array>} Array of { habitId, habitLabel, originalText, language, dimension }
 */
export async function getUserHabits(queryNeo4j, userId, lang = 'en') {
  const normalizedLang = normalizeDisplayLang(lang);
  return queryNeo4j(
    `
    MATCH (h:Habit {is_habit: true, userID: $userId})-[:HAS_CONTEXT]->(c:Context)
    RETURN DISTINCT
      h.uuid                     AS habitId,
      ${localizedLabelExpr('h')} AS habitLabel,
      coalesce(h.sentence, '')   AS originalText,
      coalesce(h.language, '')   AS language,
      c.dimension                AS dimension
    ORDER BY habitLabel
  `,
    {
      userId,
      lang: normalizedLang,
      transKey: `translation${normalizedLang.toUpperCase()}`,
    }
  );
}

/**
 * Return the Neo4j-mirrored annotation counts for a single habit.
 * Used by the annotate endpoint to return authoritative counts after a write,
 * avoiding a full MongoDB collection scan.
 * @param {Function} queryNeo4j
 * @param {string} habitId
 * @returns {Promise<{ helpful: number, iDoThis: number }>}
 */
export async function getHabitAnnotationCounts(queryNeo4j, habitId) {
  const rows = await queryNeo4j(
    `MATCH (h:Habit {uuid: $habitId})
     RETURN coalesce(h.annotations_helpful, 0) AS helpful,
            coalesce(h.annotations_iDoThis, 0)  AS iDoThis,
            coalesce(h.annotations_like, 0)     AS likes`,
    { habitId }
  );
  const row = rows[0];
  return {
    helpful: neoInt(row?.helpful ?? 0),
    iDoThis: neoInt(row?.iDoThis ?? 0),
    likes: neoInt(row?.likes ?? 0),
  };
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
  if (type === 'like') {
    await queryNeo4j(
      `MATCH (h:Habit {uuid: $habitId})
       WITH h, coalesce(h.annotations_like, 0) + $delta AS newVal
       SET h.annotations_like = CASE WHEN newVal < 0 THEN 0 ELSE newVal END`,
      { habitId, delta }
    );
  } else if (type === 'iDoThis') {
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
 * @param {string} [lang='en'] - Viewer's app language; picks which translation slot habitLabel resolves to.
 * @returns {Promise<Array>}
 */
export async function getHabitGraph(queryNeo4j, lang = 'en') {
  const normalizedLang = normalizeDisplayLang(lang);
  return queryNeo4j(
    `
    MATCH (b:BCIOConcept)<-[:MAPS_TO]-(:Context)<-[:HAS_CONTEXT]-(h:Habit)
    RETURN DISTINCT
      h.uuid                     AS habitId,
      ${localizedLabelExpr('h')} AS habitLabel,
      coalesce(h.sentence, '')   AS originalText,
      coalesce(h.language, '')   AS language,
      b.bcio_concept_id          AS conceptId,
      b.bcio_concept_label       AS conceptLabel
  `,
    {
      lang: normalizedLang,
      transKey: `translation${normalizedLang.toUpperCase()}`,
    }
  );
}

/**
 * Create an anonymous Comment node attached to a habit. Ownership is tracked
 * separately in MongoDB (`habit_comments`) so accounts can be erased without
 * de-anonymising the graph.
 *
 * `flagged`/`approved` implement auto-moderation: comments the LLM moderator
 * flags are held out of the public listing (`getHabitComments`) until a
 * researcher/admin approves or deletes them via the admin moderation queue.
 * Unflagged comments are approved immediately so researchers only ever have
 * to look at the ones that actually need a decision.
 * @param {Function} queryNeo4j
 * @param {string} habitId  Habit uuid
 * @param {{ id: string, text: string, flagged?: boolean, reason?: string|null }} comment
 * @returns {Promise<object|null>} created comment or null if habit not found
 */
export async function addHabitComment(
  queryNeo4j,
  habitId,
  { id, text, flagged = false, reason = null }
) {
  const rows = await queryNeo4j(
    `MATCH (h:Habit {uuid: $habitId})
     CREATE (c:Comment {
       id: $id, text: $text, createdAt: $createdAt,
       flagged: $flagged, approved: $approved, flagReason: $reason
     })-[:COMMENT_ON]->(h)
     RETURN c.id AS id, c.text AS text, c.createdAt AS createdAt,
            c.flagged AS flagged, c.approved AS approved`,
    {
      habitId,
      id,
      text,
      createdAt: new Date().toISOString(),
      flagged,
      approved: !flagged,
      reason,
    }
  );
  return rows[0] ?? null;
}

/**
 * List approved comments for a habit, newest first. Flagged comments awaiting
 * moderation are excluded — see [[approveComment]].
 * @param {Function} queryNeo4j
 * @param {string} habitId
 * @param {number} [limit]
 * @returns {Promise<Array<{id: string, text: string, createdAt: string}>>}
 */
export async function getHabitComments(queryNeo4j, habitId, limit = 50) {
  return queryNeo4j(
    // approved IS NULL grandfathers in comments created before moderation
    // existed, which never got an `approved` property set at all.
    `MATCH (c:Comment)-[:COMMENT_ON]->(h:Habit {uuid: $habitId})
     WHERE c.approved = true OR c.approved IS NULL
     RETURN c.id AS id, c.text AS text, c.createdAt AS createdAt
     ORDER BY c.createdAt DESC
     LIMIT toInteger($limit)`,
    { habitId, limit }
  );
}

/**
 * Approve a flagged comment so it becomes publicly visible.
 * @param {Function} queryNeo4j
 * @param {string} commentId
 * @returns {Promise<boolean>} true if a comment was found and approved
 */
export async function approveComment(queryNeo4j, commentId) {
  const rows = await queryNeo4j(
    `MATCH (c:Comment {id: $commentId})
     SET c.approved = true, c.flagged = false
     RETURN c.id AS id`,
    { commentId }
  );
  return rows.length > 0;
}

/**
 * Delete Comment nodes by id (GDPR account erasure path).
 * @param {Function} queryNeo4j
 * @param {string[]} commentIds
 */
export async function deleteHabitComments(queryNeo4j, commentIds) {
  if (!commentIds?.length) return;
  await queryNeo4j(
    `MATCH (c:Comment) WHERE c.id IN $commentIds DETACH DELETE c`,
    { commentIds }
  );
}

/**
 * WHERE clause fragment for filtering comments by moderation status.
 * 'flagged' = held for review (auto-flagged, not yet approved). 'all' (default)
 * = every comment, flagged or not.
 * @param {'all'|'flagged'} status
 * @returns {string}
 */
function _commentStatusFilter(status) {
  return status === 'flagged'
    ? 'WHERE c.flagged = true AND c.approved = false'
    : '';
}

/**
 * List comments across habits for researcher moderation, newest first,
 * including the habit sentence for context and moderation status. Paginated
 * via SKIP/LIMIT.
 * @param {Function} queryNeo4j
 * @param {{ page?: number, limit?: number, status?: 'all'|'flagged' }} [opts]
 * @returns {Promise<Array<{id, text, createdAt, habitId, habitSentence, flagged, approved, flagReason}>>}
 */
export async function listAllComments(
  queryNeo4j,
  { page = 1, limit = 100, status = 'all' } = {}
) {
  const skip = (Math.max(1, page) - 1) * limit;
  return queryNeo4j(
    `MATCH (c:Comment)-[:COMMENT_ON]->(h:Habit)
     ${_commentStatusFilter(status)}
     RETURN c.id AS id,
            c.text AS text,
            c.createdAt AS createdAt,
            h.uuid AS habitId,
            coalesce(h.translationEN, h.sentence) AS habitSentence,
            coalesce(c.flagged, false) AS flagged,
            coalesce(c.approved, true) AS approved,
            c.flagReason AS flagReason
     ORDER BY c.createdAt DESC
     SKIP toInteger($skip)
     LIMIT toInteger($limit)`,
    { skip, limit }
  );
}

/**
 * Count comments across habits (for pagination totals), optionally filtered
 * to those still awaiting moderation.
 * @param {Function} queryNeo4j
 * @param {{ status?: 'all'|'flagged' }} [opts]
 * @returns {Promise<number>}
 */
export async function countAllComments(queryNeo4j, { status = 'all' } = {}) {
  const rows = await queryNeo4j(
    `MATCH (c:Comment) ${_commentStatusFilter(status)} RETURN count(c) AS total`
  );
  return Number(rows[0]?.total ?? 0);
}
