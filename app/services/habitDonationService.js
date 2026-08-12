/**
 * habitDonationService — orchestrates the M1.1 → M1.2 → M1.3 habit sharing pipeline.
 *
 * Responsibilities:
 *  - Classify habit (M1.1)
 *  - Extract context dimensions (M1.2)
 *  - Map BCIO concepts (M1.3)
 *  - Translate habit sentence
 *  - Write Habit, Context, and BCIOConcept nodes to Neo4j
 */

import { DIMENSIONS } from '../utils/constants.js';

function serviceHeaders() {
  const headers = { 'Content-Type': 'application/json' };
  if (process.env.API_SERVICE_SECRET) {
    headers['X-Service-Auth-Token'] = process.env.API_SERVICE_SECRET;
  }
  return headers;
}

/** Classify whether sentence is a habit and return { is_habit, confidence }. */
export async function classifyHabit(sentence, language, userID, apiBase) {
  let res;
  try {
    res = await fetch(`${apiBase}/api/v1/llm/classify-habit`, {
      method: 'POST',
      headers: serviceHeaders(),
      body: JSON.stringify({ sentence, language, user_id: userID }),
    });
  } catch (err) {
    // Connection refused / network failure — recommender may still be loading.
    throw Object.assign(
      new Error(
        `Recommender service unreachable: ${err.message}. ` +
          'It may still be building the BCIO embedding index — please retry in a moment.'
      ),
      { status: 503, code: 'recommender_unavailable' }
    );
  }
  if (!res.ok) {
    let detail = '';
    try {
      detail = await res.text();
    } catch {
      // Ignore body read errors and keep generic message.
    }
    const downstreamStatus = res.status;
    const proxyStatus =
      downstreamStatus >= 500 || downstreamStatus === 429 ? 503 : 502;
    throw Object.assign(
      new Error(
        detail
          ? `Habit classification failed (${downstreamStatus}): ${detail}`
          : `Habit classification failed (${downstreamStatus})`
      ),
      {
        status: proxyStatus,
        code: 'classifier_unavailable',
        downstreamStatus,
      }
    );
  }
  return res.json();
}

/** Extract context dimension phrases for the habit. */
async function extractContext(uuid, sentence, language, apiBase) {
  let res;
  try {
    res = await fetch(`${apiBase}/api/v1/llm/classify-context`, {
      method: 'POST',
      headers: serviceHeaders(),
      body: JSON.stringify({ uuid, sentence, language }),
    });
  } catch (err) {
    throw Object.assign(
      new Error(
        `Recommender service unreachable during context extraction: ${err.message}`
      ),
      { status: 503, code: 'recommender_unavailable' }
    );
  }
  if (!res.ok)
    throw Object.assign(new Error('Context extraction failed'), {
      status: 502,
    });
  const context = await res.json();
  const contextPhrases = {};
  for (const dim of DIMENSIONS) {
    if (Array.isArray(context[dim]) && context[dim].length > 0) {
      const cleaned = context[dim]
        .map((value) => (typeof value === 'string' ? value.trim() : ''))
        .filter(Boolean);
      if (cleaned.length > 0) {
        contextPhrases[dim] = cleaned;
      }
    }
  }
  return contextPhrases;
}

/** Map BCIO concepts for the given context phrases. */
export async function mapBcio(uuid, contextPhrases, apiBase) {
  let res;
  try {
    res = await fetch(`${apiBase}/api/v1/llm/map-bcio`, {
      method: 'POST',
      headers: serviceHeaders(),
      body: JSON.stringify({ uuid, context_phrases: contextPhrases }),
    });
  } catch (err) {
    throw Object.assign(
      new Error(
        `Recommender service unreachable during BCIO mapping: ${err.message}`
      ),
      { status: 503, code: 'recommender_unavailable' }
    );
  }
  if (!res.ok)
    throw Object.assign(new Error('BCIO mapping failed'), { status: 502 });
  const data = await res.json();
  const rawMappings = Array.isArray(data.mappings) ? data.mappings : [];
  // Defensive sanitization: avoid null relationship properties in Neo4j.
  // Neo4j rejects MERGE/SET with null property values and throws, which would
  // otherwise bubble up as a generic 500 at /habits/share.
  return rawMappings
    .filter((m) => m && typeof m === 'object')
    .map((m) => ({
      bcio_concept_id: m.bcio_concept_id,
      bcio_concept_label: m.bcio_concept_label,
      phrase: m.phrase,
      dimension: m.dimension,
      confidence:
        typeof m.confidence === 'number' ? m.confidence : Number(m.confidence),
    }))
    .filter(
      (m) =>
        typeof m.bcio_concept_id === 'string' &&
        m.bcio_concept_id.trim() &&
        typeof m.bcio_concept_label === 'string' &&
        m.bcio_concept_label.trim() &&
        typeof m.phrase === 'string' &&
        m.phrase.trim() &&
        typeof m.dimension === 'string' &&
        m.dimension.trim() &&
        Number.isFinite(m.confidence)
    );
}

/**
 * Create the Habit node in Neo4j and return the sanitised confidence value.
 */
async function _createHabitNode(
  {
    uuid,
    sentence,
    language,
    confidence,
    userID,
    studyId,
    frequency,
    duration,
    healthBenefit,
    wellbeingImpact,
    habitType,
    stackedOnUuid,
    creationMode,
    translationEN,
    translationDE,
    translationJA,
    translationFR,
    translationNL,
    createdAt,
  },
  queryNeo4j
) {
  const numericConfidence =
    typeof confidence === 'number' ? confidence : Number(confidence);
  const safeConfidence = Number.isFinite(numericConfidence)
    ? numericConfidence
    : 0;
  const safeUserId = typeof userID === 'string' ? userID : '';

  // §7.4/§7.1 — habit_type ('build'|'quit') and creation_mode
  // ('standalone'|'stacked') are stored as node properties so the community
  // bubble graph and any admin graph view can filter build vs. quit, and the
  // stacking network is queryable, with a single-property WHERE clause.
  // habitType here is already the *effective* value resolved in shareHabit()
  // — an explicit user choice when the structured New Habit flow made one,
  // otherwise the classifier's own build/quit read of the sentence (see
  // shareHabit) — this is the only habit_type property Neo4j gets; there is
  // deliberately no separate "LLM tag" property to keep in sync with it.
  const safeHabitType = habitType === 'quit' ? 'quit' : 'build';
  const safeCreationMode =
    creationMode === 'stacked' ? 'stacked' : 'standalone';

  await queryNeo4j(
    `CREATE (h:Habit {uuid: $uuid, sentence: $sentence, language: $language,
       is_habit: true, habit_confidence: $habit_confidence, userID: $userID,
       studyId: $studyId, created_at: $created_at,
       translationEN: $translationEN, translationDE: $translationDE,
       translationJA: $translationJA, translationFR: $translationFR,
       translationNL: $translationNL,
       frequency: $frequency, duration: $duration,
       health_benefit: $health_benefit, wellbeing_impact: $wellbeing_impact,
       habit_type: $habit_type, creation_mode: $creation_mode})`,
    {
      uuid,
      sentence,
      language,
      habit_confidence: safeConfidence,
      userID: safeUserId,
      studyId: studyId ?? null,
      created_at: createdAt,
      translationEN: translationEN || null,
      translationDE: translationDE || null,
      translationJA: translationJA || null,
      translationFR: translationFR || null,
      translationNL: translationNL || null,
      frequency: frequency ?? null,
      duration: duration ?? null,
      health_benefit: healthBenefit ?? null,
      wellbeing_impact: wellbeingImpact ?? null,
      habit_type: safeHabitType,
      creation_mode: safeCreationMode,
    }
  );

  // §7.1 Habit Stacking — when this donation was created by stacking onto an
  // existing anchor habit that is itself in the graph, link them:
  //   (:Habit {anchor})-[:STACKED_WITH]->(:Habit {this})
  // The anchor is matched by uuid; if it isn't in the graph (the user free-typed
  // an anchor they never donated) the MERGE simply no-ops, leaving creation_mode
  // as the record that this was a stacked habit.
  if (stackedOnUuid) {
    await queryNeo4j(
      `MATCH (anchor:Habit {uuid: $anchorUuid})
       MATCH (h:Habit {uuid: $uuid})
       MERGE (anchor)-[r:STACKED_WITH]->(h)
         ON CREATE SET r.at = $created_at`,
      { anchorUuid: stackedOnUuid, uuid, created_at: createdAt }
    );
  }

  // Link the donation into the graph so it can be traversed from the donor and
  // the study, not only via the scalar userID/studyId properties:
  //   (:User)-[:DONATED]->(:Habit)-[:DONATED_IN]->(:Study)
  // DONATED_IN is only created for study-enrolled donors (studyId set); public
  // donors just get the DONATED edge.
  if (safeUserId) {
    await queryNeo4j(
      `MATCH (h:Habit {uuid: $uuid})
       MERGE (u:User {userID: $userID})
       MERGE (u)-[d:DONATED]->(h)
         ON CREATE SET d.at = $created_at
       WITH h
       FOREACH (_ IN CASE WHEN $studyId IS NULL THEN [] ELSE [1] END |
         MERGE (s:Study {uuid: $studyId})
         MERGE (h)-[:DONATED_IN]->(s))`,
      {
        uuid,
        userID: safeUserId,
        studyId: studyId ?? null,
        created_at: createdAt,
      }
    );
  }
}

/**
 * Merge Context nodes and link them to the Habit node.
 * @param {string} uuid - Habit UUID
 * @param {object} contextPhrases - Map of dimension → phrase[]
 * @param {Function} queryNeo4j
 * @returns {Promise<void>}
 */
async function _writeContextNodes(uuid, contextPhrases, queryNeo4j) {
  const contextRows = [];
  for (const [dimension, phrases] of Object.entries(contextPhrases)) {
    for (const phrase of phrases) {
      if (
        typeof phrase === 'string' &&
        phrase.trim() &&
        typeof dimension === 'string' &&
        dimension.trim()
      ) {
        contextRows.push({ text: phrase.trim(), dimension: dimension.trim() });
      }
    }
  }
  if (contextRows.length > 0) {
    await queryNeo4j(
      `UNWIND $rows AS row
       MERGE (c:Context {text: row.text, dimension: row.dimension})
       WITH c, row
       MATCH (h:Habit {uuid: $habitUuid})
       MERGE (h)-[:HAS_CONTEXT {dimension: row.dimension}]->(c)`,
      { rows: contextRows, habitUuid: uuid }
    );
  }
}

// Languages the admin portal supports, for localised BCIO concept labels
// (kept separate from the app's habit-translation languages — the admin
// portal doesn't support ja, and mobile never displays BCIO concept labels,
// so there's no reason to pay for a ja translation here).
const ADMIN_BCIO_LANGS = ['de', 'fr', 'nl'];

/**
 * Merge BCIOConcept nodes and their MAPS_TO relationships from Context nodes.
 *
 * BCIOConcept nodes are deduplicated across every habit ever donated (MERGE
 * on bcio_concept_id), so the ontology is a small, mostly-stable set —
 * translating a concept's label into the admin portal's languages is a
 * one-time cost per genuinely new concept, not a per-donation one. Existing
 * concepts are looked up first so already-translated ones are never
 * re-translated (and never overwritten with `ON CREATE SET`).
 *
 * @param {Array} mappings - Sanitised BCIO mapping objects
 * @param {Function} queryNeo4j
 * @param {{ apiBase?: string, translateTerm?: Function }} [deps]
 * @returns {Promise<void>}
 */
export async function _writeBcioMappings(mappings, queryNeo4j, deps = {}) {
  if (mappings.length === 0) return;
  const { apiBase, translateTerm } = deps;

  const uniqueIds = [...new Set(mappings.map((m) => m.bcio_concept_id))];
  const existingRows = await queryNeo4j(
    `UNWIND $ids AS id
     MATCH (b:BCIOConcept {bcio_concept_id: id})
     RETURN b.bcio_concept_id AS id`,
    { ids: uniqueIds }
  );
  const existingIds = new Set(existingRows.map((r) => r.id));

  const newConcepts = [];
  const seen = new Set();
  for (const m of mappings) {
    if (existingIds.has(m.bcio_concept_id) || seen.has(m.bcio_concept_id))
      continue;
    seen.add(m.bcio_concept_id);
    newConcepts.push(m);
  }

  const labelsByConceptId = {};
  if (newConcepts.length > 0 && apiBase && translateTerm) {
    await Promise.all(
      newConcepts.map(async (m) => {
        const translated = await Promise.all(
          ADMIN_BCIO_LANGS.map((lang) =>
            translateTerm(m.bcio_concept_label, 'en', lang, apiBase)
          )
        );
        labelsByConceptId[m.bcio_concept_id] = Object.fromEntries(
          ADMIN_BCIO_LANGS.map((lang, i) => [lang, translated[i]])
        );
      })
    );
  }

  const enrichedMappings = mappings.map((m) => ({
    ...m,
    bcio_concept_label_de: labelsByConceptId[m.bcio_concept_id]?.de ?? null,
    bcio_concept_label_fr: labelsByConceptId[m.bcio_concept_id]?.fr ?? null,
    bcio_concept_label_nl: labelsByConceptId[m.bcio_concept_id]?.nl ?? null,
  }));

  await queryNeo4j(
    `UNWIND $mappings AS m
     MERGE (b:BCIOConcept {bcio_concept_id: m.bcio_concept_id})
     ON CREATE SET b.bcio_concept_label = m.bcio_concept_label,
       b.bcio_concept_label_de = m.bcio_concept_label_de,
       b.bcio_concept_label_fr = m.bcio_concept_label_fr,
       b.bcio_concept_label_nl = m.bcio_concept_label_nl
     WITH b, m
     MERGE (c:Context {text: m.phrase, dimension: m.dimension})
     MERGE (c)-[r:MAPS_TO {phrase: m.phrase, dimension: m.dimension}]->(b)
     SET r.mapping_confidence = m.confidence`,
    { mappings: enrichedMappings }
  );
}

/** Write Habit node, Context nodes, and BCIOConcept nodes to Neo4j. */
async function writeToNeo4j(
  {
    uuid,
    sentence,
    language,
    confidence,
    userID,
    studyId,
    frequency,
    duration,
    healthBenefit,
    wellbeingImpact,
    habitType,
    stackedOnUuid,
    creationMode,
    translationEN,
    translationDE,
    translationJA,
    translationFR,
    translationNL,
    contextPhrases,
    mappings,
  },
  queryNeo4j,
  { apiBase, translateTerm } = {}
) {
  const createdAt = new Date().toISOString();
  await _createHabitNode(
    {
      uuid,
      sentence,
      language,
      confidence,
      userID,
      studyId,
      frequency,
      duration,
      healthBenefit,
      wellbeingImpact,
      habitType,
      stackedOnUuid,
      creationMode,
      translationEN,
      translationDE,
      translationJA,
      translationFR,
      translationNL,
      createdAt,
    },
    queryNeo4j
  );
  await _writeContextNodes(uuid, contextPhrases, queryNeo4j);
  await _writeBcioMappings(mappings, queryNeo4j, { apiBase, translateTerm });
}

/**
 * Persist a rejected (non-habit) sentence to Neo4j and MongoDB, then return the rejection response.
 * @param {{ uuid: string, sentence: string, language: string, userID: string, confidence: number }} params
 * @param {Function} queryNeo4j
 * @param {Function} getDb
 * @returns {Promise<{ is_habit: false, message: string }>}
 */
export async function persistRejectedHabit(
  { uuid, sentence, language, userID, confidence },
  queryNeo4j,
  getDb
) {
  const createdAt = new Date().toISOString();
  const numericConfidence =
    typeof confidence === 'number' ? confidence : Number(confidence);
  const safeConfidence = Number.isFinite(numericConfidence)
    ? numericConfidence
    : 0;
  const safeUserId = typeof userID === 'string' ? userID : '';
  await queryNeo4j(
    `CREATE (h:Habit {uuid: $uuid, sentence: $sentence, language: $language,
       is_habit: false, habit_confidence: $habit_confidence, userID: $userID, created_at: $created_at})`,
    {
      uuid,
      sentence,
      language,
      habit_confidence: safeConfidence,
      userID: safeUserId,
      created_at: createdAt,
    }
  );
  const database = await getDb();
  await database.collection('habits').insertOne({
    sentence,
    language,
    is_habit: false,
    userID,
    created_at: new Date(),
  });
  return {
    is_habit: false,
    message:
      'Thank you for your contribution. This sentence was not identified as a habit and has been noted for review.',
  };
}

// Every habit gets a translation slot per app locale.
const APP_LANGS = ['en', 'de', 'ja', 'fr', 'nl'];

/**
 * Produce translations of a confirmed habit sentence into every app language
 * other than the one it was donated in, in parallel.
 *
 * The language matching the habit's own source language is skipped (null)
 * — the original `sentence` already serves as that language's display
 * text, so translating it back would be redundant.
 *
 * @param {string} sentence
 * @param {string} language
 * @param {Function} translate - translate(sentence, src, tgt, base, url) => string|null
 * @param {string} apiBase
 * @param {string} translateUrl
 * @returns {Promise<{translationEN: string|null, translationDE: string|null, translationJA: string|null, translationFR: string|null, translationNL: string|null}>}
 */
export async function translateHabit(
  sentence,
  language,
  translate,
  apiBase,
  translateUrl
) {
  const sourceLang2 = (language || '').slice(0, 2).toLowerCase();
  const targets = APP_LANGS.filter((lang) => lang !== sourceLang2);

  const results = await Promise.all(
    targets.map((target) =>
      translate(sentence, sourceLang2, target, apiBase, translateUrl)
    )
  );

  const translations = {
    translationEN: null,
    translationDE: null,
    translationJA: null,
    translationFR: null,
    translationNL: null,
  };
  targets.forEach((target, i) => {
    translations[`translation${target.toUpperCase()}`] = results[i];
  });
  return translations;
}

/**
 * Share a habit: classify → extract context → map BCIO → translate → persist.
 *
 * @param {object} params
 * @param {string} params.uuid         - Generated UUID for the new Habit node
 * @param {string} params.sentence     - Habit sentence from the user
 * @param {string} params.language     - ISO 639-1 language code
 * @param {string} params.userID       - Keycloak sub claim of the donating user
 * @param {Function} params.queryNeo4j - Neo4j query function (cypher, params) => rows
 * @param {Function} params.getDb      - Async getter for MongoDB database instance
 * @param {string} params.apiBase      - Base URL for the recommender/LLM API service
 * @param {Function} params.translate  - translate(sentence, src, tgt, base, url) => string|null
 * @param {string} params.translateUrl - LibreTranslate endpoint URL
 * @param {Function} [params.translateTerm] - translateTerm(term, src, tgt, base) => string|null, used to localise new BCIO concept labels for the admin portal
 * @param {string} [params.habitType] - Explicit 'build'|'quit' choice from the structured New Habit flow. Omitted (undefined) for free-text community donations, which fall back to the classifier's own read of the sentence.
 *
 * @returns {{ is_habit: boolean, uuid?: string, message: string }}
 */
export async function shareHabit({
  uuid,
  sentence,
  language,
  userID,
  studyId = null,
  frequency = null,
  duration = null,
  healthBenefit = null,
  wellbeingImpact = null,
  habitType,
  stackedOnUuid = null,
  creationMode = 'standalone',
  queryNeo4j,
  getDb,
  apiBase,
  translate,
  translateTerm,
  translateUrl,
}) {
  const classified = await classifyHabit(sentence, language, userID, apiBase);

  if (!classified.is_habit) {
    return persistRejectedHabit(
      { uuid, sentence, language, userID, confidence: classified.confidence },
      queryNeo4j,
      getDb
    );
  }

  // habitType is only set when the caller made an explicit build/quit choice
  // (the structured New Habit flow); every other route to this pipeline —
  // most notably the free-text community donation screen — goes through the
  // same classifier call above, so its own habit_type read is the right
  // fallback instead of a hardcoded default.
  const effectiveHabitType =
    habitType === 'build' || habitType === 'quit'
      ? habitType
      : classified.habit_type;

  const contextPhrases = await extractContext(
    uuid,
    sentence,
    language,
    apiBase
  );
  const mappings = await mapBcio(uuid, contextPhrases, apiBase);
  const {
    translationEN,
    translationDE,
    translationJA,
    translationFR,
    translationNL,
  } = await translateHabit(
    sentence,
    language,
    translate,
    apiBase,
    translateUrl
  );

  await writeToNeo4j(
    {
      uuid,
      sentence,
      language,
      confidence: classified.confidence,
      userID,
      studyId,
      frequency,
      duration,
      healthBenefit,
      wellbeingImpact,
      habitType: effectiveHabitType,
      stackedOnUuid,
      creationMode,
      translationEN,
      translationDE,
      translationJA,
      translationFR,
      translationNL,
      contextPhrases,
      mappings,
    },
    queryNeo4j,
    { apiBase, translateTerm }
  );

  await embedAndStoreHabit({
    uuid,
    sentence,
    translationEN,
    contextPhrases,
    mappings,
    apiBase,
    queryNeo4j,
  });

  return {
    is_habit: true,
    uuid,
    message: 'Thank you! Your habit has been successfully shared.',
  };
}

export const donateHabit = shareHabit;

/**
 * Save a habit donation job to the BullMQ queue and return the jobId immediately.
 * The uuid is used as the BullMQ job ID so it can be looked up by the status endpoint.
 */
export async function enqueueHabitDonation({
  uuid,
  sentence,
  language,
  userID,
  studyId = null,
  confidence,
  frequency = null,
  duration = null,
  healthBenefit = null,
  wellbeingImpact = null,
  habitType,
  stackedOnUuid = null,
  creationMode = 'standalone',
  habitQueue,
}) {
  // habitType is intentionally left undefined (not defaulted here) when the
  // caller made no explicit choice — the worker's shareHabit() call resolves
  // that fallback from the classifier, not this queueing step.
  await habitQueue.add(
    'process',
    {
      uuid,
      sentence,
      language,
      userID,
      studyId,
      confidence,
      frequency,
      duration,
      healthBenefit,
      wellbeingImpact,
      habitType,
      stackedOnUuid,
      creationMode,
    },
    { jobId: uuid }
  );
  return { jobId: uuid, status: 'pending' };
}

// ---------------------------------------------------------------------------
// Semantic embedding (called after writeToNeo4j, non-fatal)
// ---------------------------------------------------------------------------

/**
 * Embed every node produced by a habit donation in one batch API call:
 *   - the Habit node (sentence)
 *   - each Context node (context phrase)
 *   - each BCIOConcept node (concept label)
 *
 * Vectors are stored inline on the respective nodes so Neo4j vector indexes
 * (habit_embedding_idx, context_embedding_idx, bcio_embedding_idx) can search
 * each dimension independently during recommendation.
 *
 * Non-fatal: if embedding fails the habit is stored normally and will be
 * absent from cross-user semantic search until a backfill runs.
 */
export async function embedAndStoreHabit({
  uuid,
  sentence,
  translationEN,
  contextPhrases,
  mappings,
  apiBase,
  queryNeo4j,
}) {
  try {
    // --- build ordered texts list ---
    const habitText = translationEN || sentence;

    // flatten { dimension: [phrases] } → [{ dimension, text }]
    const contextItems = Object.entries(contextPhrases).flatMap(
      ([dim, phrases]) => phrases.map((text) => ({ dimension: dim, text }))
    );

    // deduplicate BCIO concept labels (multiple mappings can share a concept)
    const bcioSeen = new Set();
    const bcioItems = (mappings || []).filter((m) => {
      if (bcioSeen.has(m.bcio_concept_id)) return false;
      bcioSeen.add(m.bcio_concept_id);
      return true;
    });

    const texts = [
      habitText,
      ...contextItems.map((c) => c.text),
      ...bcioItems.map((b) => b.bcio_concept_label),
    ];

    // --- one batch embed call ---
    const res = await fetch(`${apiBase}/api/v1/llm/embed-batch`, {
      method: 'POST',
      headers: serviceHeaders(),
      body: JSON.stringify({ texts }),
    });
    if (!res.ok) {
      console.warn(
        `[habitDonation] embed-batch returned ${res.status} for ${uuid} — skipping.`
      );
      return;
    }
    const { embeddings } = await res.json();
    if (!Array.isArray(embeddings) || embeddings.length !== texts.length)
      return;

    // --- slice back into per-node arrays ---
    let idx = 0;
    const habitEmbedding = embeddings[idx++];
    const contextEmbeddings = embeddings.slice(idx, idx + contextItems.length);
    idx += contextItems.length;
    const bcioEmbeddings = embeddings.slice(idx, idx + bcioItems.length);

    // --- write to Neo4j ---
    await queryNeo4j(
      'MATCH (h:Habit {uuid: $uuid}) SET h.embedding = $embedding',
      { uuid, embedding: habitEmbedding }
    );

    if (contextItems.length > 0) {
      const contextRows = contextItems.map((c, i) => ({
        text: c.text,
        dimension: c.dimension,
        embedding: contextEmbeddings[i],
      }));
      await queryNeo4j(
        `UNWIND $rows AS row
         MERGE (c:Context {text: row.text, dimension: row.dimension})
         SET c.embedding = row.embedding`,
        { rows: contextRows }
      );
    }

    if (bcioItems.length > 0) {
      const bcioRows = bcioItems.map((b, i) => ({
        bcio_concept_id: b.bcio_concept_id,
        embedding: bcioEmbeddings[i],
      }));
      await queryNeo4j(
        `UNWIND $rows AS row
         MATCH (b:BCIOConcept {bcio_concept_id: row.bcio_concept_id})
         SET b.embedding = row.embedding`,
        { rows: bcioRows }
      );
    }
  } catch (err) {
    console.warn(
      `[habitDonation] embed-batch failed for ${uuid}: ${err.message}`
    );
  }
}
