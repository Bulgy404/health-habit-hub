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
    const createdAt = new Date().toISOString();
    const numericConfidence =
      typeof classified.confidence === 'number'
        ? classified.confidence
        : Number(classified.confidence);
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

  const contextPhrases = await extractContext(
    uuid,
    sentence,
    language,
    apiBase
  );
  const mappings = await mapBcio(uuid, contextPhrases, apiBase);

  const [translationEN, translationDE] = await Promise.all([
    // Translate non-English habits to English
    language && !language.startsWith('en')
      ? translate(
          sentence,
          language,
          'en',
          '/api/v1/llm/refine-translation',
          apiBase,
          translateUrl
        )
      : Promise.resolve(null),
    // Translate English habits to German
    language && language.startsWith('en')
      ? translate(
          sentence,
          'en',
          'de',
          '/api/v1/llm/refine-translation-de',
          apiBase,
          translateUrl
        )
      : Promise.resolve(null),
  ]);

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

  return {
    is_habit: true,
    uuid,
    message: 'Thank you! Your habit has been successfully shared.',
  };
}

export const donateHabit = shareHabit;
