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
async function classifyHabit(sentence, language, userID, apiBase) {
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
async function mapBcio(uuid, contextPhrases, apiBase) {
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
 * @param {{ uuid: string, sentence: string, language: string, confidence: number, userID: string, frequency: any, duration: any, healthBenefit: any, wellbeingImpact: any, translationEN: string|null, translationDE: string|null, createdAt: string }} params
 * @param {Function} queryNeo4j
 * @returns {Promise<void>}
 */
async function _createHabitNode(
  {
    uuid,
    sentence,
    language,
    confidence,
    userID,
    frequency,
    duration,
    healthBenefit,
    wellbeingImpact,
    translationEN,
    translationDE,
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

  await queryNeo4j(
    `CREATE (h:Habit {uuid: $uuid, sentence: $sentence, language: $language,
       is_habit: true, habit_confidence: $habit_confidence, userID: $userID, created_at: $created_at,
       translationEN: $translationEN, translationDE: $translationDE,
       frequency: $frequency, duration: $duration,
       health_benefit: $health_benefit, wellbeing_impact: $wellbeing_impact})`,
    {
      uuid,
      sentence,
      language,
      habit_confidence: safeConfidence,
      userID: safeUserId,
      created_at: createdAt,
      translationEN: translationEN || null,
      translationDE: translationDE || null,
      frequency: frequency ?? null,
      duration: duration ?? null,
      health_benefit: healthBenefit ?? null,
      wellbeing_impact: wellbeingImpact ?? null,
    }
  );
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

/**
 * Merge BCIOConcept nodes and their MAPS_TO relationships from Context nodes.
 * @param {Array} mappings - Sanitised BCIO mapping objects
 * @param {Function} queryNeo4j
 * @returns {Promise<void>}
 */
async function _writeBcioMappings(mappings, queryNeo4j) {
  if (mappings.length > 0) {
    await queryNeo4j(
      `UNWIND $mappings AS m
       MERGE (b:BCIOConcept {bcio_concept_id: m.bcio_concept_id})
       ON CREATE SET b.bcio_concept_label = m.bcio_concept_label
       WITH b, m
       MERGE (c:Context {text: m.phrase, dimension: m.dimension})
       MERGE (c)-[r:MAPS_TO {phrase: m.phrase, dimension: m.dimension}]->(b)
       SET r.mapping_confidence = m.confidence`,
      { mappings }
    );
  }
}

/** Write Habit node, Context nodes, and BCIOConcept nodes to Neo4j. */
async function writeToNeo4j(
  {
    uuid,
    sentence,
    language,
    confidence,
    userID,
    frequency,
    duration,
    healthBenefit,
    wellbeingImpact,
    translationEN,
    translationDE,
    contextPhrases,
    mappings,
  },
  queryNeo4j
) {
  const createdAt = new Date().toISOString();
  await _createHabitNode(
    {
      uuid,
      sentence,
      language,
      confidence,
      userID,
      frequency,
      duration,
      healthBenefit,
      wellbeingImpact,
      translationEN,
      translationDE,
      createdAt,
    },
    queryNeo4j
  );
  await _writeContextNodes(uuid, contextPhrases, queryNeo4j);
  await _writeBcioMappings(mappings, queryNeo4j);
}

/**
 * Persist a rejected (non-habit) sentence to Neo4j and MongoDB, then return the rejection response.
 * @param {{ uuid: string, sentence: string, language: string, userID: string, confidence: number }} params
 * @param {Function} queryNeo4j
 * @param {Function} getDb
 * @returns {Promise<{ is_habit: false, message: string }>}
 */
async function _persistRejectedHabit(
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

/**
 * Produce EN and DE translations for a confirmed habit sentence in parallel.
 *
 * Rules:
 *  - English habits  → translationEN = null (already EN), translationDE = translated
 *  - German habits   → translationEN = translated, translationDE = null (already DE)
 *  - Other languages → both translations produced in parallel from the source language
 *
 * @param {string} sentence
 * @param {string} language
 * @param {Function} translate
 * @param {string} apiBase
 * @param {string} translateUrl
 * @returns {Promise<[string|null, string|null]>} [translationEN, translationDE]
 */
async function _translateHabit(
  sentence,
  language,
  translate,
  apiBase,
  translateUrl
) {
  const isEN = language && language.startsWith('en');
  const isDE = language && language.startsWith('de');
  const sourceLang = isEN ? 'en' : language;

  return Promise.all([
    // EN: skip for English habits (sentence is already in English)
    !isEN
      ? translate(
          sentence,
          sourceLang,
          'en',
          '/api/v1/llm/refine-translation',
          apiBase,
          translateUrl
        )
      : Promise.resolve(null),
    // DE: skip for German habits (sentence is already in German)
    !isDE
      ? translate(
          sentence,
          sourceLang,
          'de',
          '/api/v1/llm/refine-translation-de',
          apiBase,
          translateUrl
        )
      : Promise.resolve(null),
  ]);
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
 * @param {Function} params.translate  - translate(sentence, src, tgt, endpoint, base, url) => string|null
 * @param {string} params.translateUrl - LibreTranslate endpoint URL
 *
 * @returns {{ is_habit: boolean, uuid?: string, message: string }}
 */
export async function shareHabit({
  uuid,
  sentence,
  language,
  userID,
  frequency = null,
  duration = null,
  healthBenefit = null,
  wellbeingImpact = null,
  queryNeo4j,
  getDb,
  apiBase,
  translate,
  translateUrl,
}) {
  const classified = await classifyHabit(sentence, language, userID, apiBase);

  if (!classified.is_habit) {
    return _persistRejectedHabit(
      { uuid, sentence, language, userID, confidence: classified.confidence },
      queryNeo4j,
      getDb
    );
  }

  const contextPhrases = await extractContext(
    uuid,
    sentence,
    language,
    apiBase
  );
  const mappings = await mapBcio(uuid, contextPhrases, apiBase);
  const [translationEN, translationDE] = await _translateHabit(
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
      frequency,
      duration,
      healthBenefit,
      wellbeingImpact,
      translationEN,
      translationDE,
      contextPhrases,
      mappings,
    },
    queryNeo4j
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
