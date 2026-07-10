import { ObjectId } from 'mongodb';
import { COLLECTION } from '../models/cuePool.js';
import { SUPPORTED_LANGS, resolveLocaleText } from '../utils/localeText.js';

/**
 * Insert a new cue document into the cue pool.
 * @param {{ db: object, text: Record<string,string>, languages: string[], quality: string, dimensions: {stability:number,salience:number,specificity:number}, domain: string }} deps
 * @returns {Promise<object>} The created cue including its generated id.
 */
export async function createCue({
  db,
  text,
  languages,
  quality,
  dimensions,
  domain,
}) {
  const doc = {
    text,
    languages,
    quality,
    dimensions,
    domain,
    createdAt: new Date(),
  };
  const result = await db.collection(COLLECTION).insertOne(doc);
  return { id: result.insertedId.toString(), ...doc };
}

/**
 * Return a paginated list of cues, optionally filtered by quality and
 * language (matches cues whose `languages` array contains the given code).
 * @param {{ db: object, quality?: string, language?: string, page?: number, limit?: number }} deps
 * @returns {Promise<{ total: number, page: number, limit: number, cues: Array }>}
 */
export async function listCues({
  db,
  quality,
  language,
  page = 1,
  limit = 50,
}) {
  const filter = {};
  if (quality) filter.quality = String(quality);
  // Mongo matches a scalar against an array field as "array contains value".
  if (language) filter.languages = String(language);
  const skip = (page - 1) * limit;
  const [docs, total] = await Promise.all([
    db.collection(COLLECTION).find(filter).skip(skip).limit(limit).toArray(),
    db.collection(COLLECTION).countDocuments(filter),
  ]);
  return { total, page, limit, cues: docs.map(serialize) };
}

/**
 * Delete a cue by its MongoDB ObjectId string.
 * @param {{ db: object, id: string }} deps
 * @returns {Promise<{ deleted: boolean }|{ notFound: boolean }>}
 */
export async function deleteCue({ db, id }) {
  let oid;
  try {
    oid = new ObjectId(id);
  } catch {
    return { notFound: true };
  }
  const result = await db.collection(COLLECTION).deleteOne({ _id: oid });
  return result.deletedCount === 0 ? { notFound: true } : { deleted: true };
}

/**
 * Randomly pick 1 or 2 pre-rated cues from the pool matching the quality
 * tier, resolving each cue's text to [lang] (falling back per
 * resolveLocaleText's rules). Returns an empty array for self_selected (user
 * provides their own cue).
 * @param {{ db: object, cueSource: string, cueCount: string, cuePoolId?: string|null, lang?: string }} deps
 * @returns {Promise<Array<{ text: string, source: string, cueId: string }>>}
 */
export async function pickAssignedCues({
  db,
  cueSource,
  cueCount,
  cuePoolId = null,
  lang = 'en',
}) {
  if (cueSource === 'self_selected') return [];

  const qualityMap = { low_quality: 'low', high_quality: 'high' };
  const quality = qualityMap[cueSource];
  if (!quality) return [];

  const n = cueCount === 'multi' ? 2 : 1;
  const match = { quality };
  if (cuePoolId) {
    try {
      match._id = new ObjectId(cuePoolId);
    } catch {
      /* ignore invalid id */
    }
  }

  const docs = await db
    .collection(COLLECTION)
    .aggregate([{ $match: match }, { $sample: { size: n } }])
    .toArray();

  return docs.map((d) => ({
    text: resolveLocaleText(d.text, lang, d.languages || ['en']),
    source: 'pre_rated',
    cueId: d._id.toString(),
  }));
}

function serialize(doc) {
  return {
    id: doc._id.toString(),
    text: doc.text,
    languages: doc.languages || [],
    quality: doc.quality,
    dimensions: doc.dimensions,
    domain: doc.domain,
    createdAt: doc.createdAt,
  };
}

/**
 * Bulk-insert cues from a parsed row array, skipping rows with missing or
 * invalid fields. Each row is a flat string-keyed object parsed from a
 * wide-format CSV: text_en, text_de, text_fr, text_ja, text_nl (at least one
 * non-empty), quality, stability/salience/specificity (1-5), domain.
 * @param {{ db: object, rows: Array<object> }} deps
 * @returns {Promise<{ inserted: number, skipped: number }>}
 */
export async function importCues({ db, rows }) {
  if (!rows || rows.length === 0) return { inserted: 0, skipped: 0 };

  const valid = [];
  let skipped = 0;

  for (const row of rows) {
    const text = {};
    for (const lang of SUPPORTED_LANGS) {
      const val = (row[`text_${lang}`] ?? '').trim();
      if (val) text[lang] = val;
    }
    const languages = Object.keys(text);

    const quality = (row.quality ?? '').trim();
    const stability = parseInt(row.stability, 10);
    const salience = parseInt(row.salience, 10);
    const specificity = parseInt(row.specificity, 10);
    const domain = (row.domain ?? '').trim();

    const validQuality = ['low', 'high'].includes(quality);
    const validDims = [stability, salience, specificity].every(
      (n) => n >= 1 && n <= 5
    );

    if (!languages.length || !validQuality || !validDims || !domain) {
      skipped++;
      continue;
    }

    valid.push({
      text,
      languages,
      quality,
      dimensions: { stability, salience, specificity },
      domain,
      createdAt: new Date(),
    });
  }

  if (valid.length === 0) return { inserted: 0, skipped };

  const result = await db.collection(COLLECTION).insertMany(valid);
  return { inserted: result.insertedCount, skipped };
}
