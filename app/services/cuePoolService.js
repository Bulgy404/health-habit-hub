import { ObjectId } from 'mongodb';
import { COLLECTION } from '../models/cuePool.js';

/**
 * Insert a new cue document into the cue pool.
 * @param {{ db: object, text: string, quality: string, dimensions: object, domain: string, language: string }} deps
 * @returns {Promise<object>} The created cue including its generated id.
 */
export async function createCue({
  db,
  text,
  quality,
  dimensions,
  domain,
  language,
}) {
  const doc = {
    text,
    quality,
    dimensions,
    domain,
    language,
    createdAt: new Date(),
  };
  const result = await db.collection(COLLECTION).insertOne(doc);
  return { id: result.insertedId.toString(), ...doc };
}

/**
 * Return a paginated list of cues, optionally filtered by quality and language.
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
  if (language) filter.language = String(language);
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
 * Randomly pick 1 or 2 pre-rated cues from the pool matching the quality tier.
 * Returns an empty array for self_selected (user provides their own cue).
 * @param {{ db: object, cueSource: string, cueCount: string, cuePoolId?: string|null }} deps
 * @returns {Promise<Array<{ text: string, source: string, cueId: string }>>}
 */
export async function pickAssignedCues({
  db,
  cueSource,
  cueCount,
  cuePoolId = null,
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
    text: d.text,
    source: 'pre_rated',
    cueId: d._id.toString(),
  }));
}

function serialize(doc) {
  return {
    id: doc._id.toString(),
    text: doc.text,
    quality: doc.quality,
    dimensions: doc.dimensions,
    domain: doc.domain,
    language: doc.language,
    createdAt: doc.createdAt,
  };
}

/**
 * Bulk-insert cues from a parsed row array, skipping rows with missing or invalid fields.
 * Each row must have: text, quality, stability (1-5), salience (1-5), specificity (1-5), domain, language.
 * @param {{ db: object, rows: Array<object> }} deps
 * @returns {Promise<{ inserted: number, skipped: number }>}
 */
export async function importCues({ db, rows }) {
  if (!rows || rows.length === 0) return { inserted: 0, skipped: 0 };

  const valid = [];
  let skipped = 0;

  for (const row of rows) {
    const text = (row.text ?? '').trim();
    const quality = (row.quality ?? '').trim();
    const stability = parseInt(row.stability, 10);
    const salience = parseInt(row.salience, 10);
    const specificity = parseInt(row.specificity, 10);
    const domain = (row.domain ?? '').trim();
    const language = (row.language ?? '').trim();

    const validQuality = ['low', 'high'].includes(quality);
    const validDims = [stability, salience, specificity].every(
      (n) => n >= 1 && n <= 5
    );

    if (!text || !validQuality || !validDims || !domain || !language) {
      skipped++;
      continue;
    }

    valid.push({
      text,
      quality,
      dimensions: { stability, salience, specificity },
      domain,
      language,
      createdAt: new Date(),
    });
  }

  if (valid.length === 0) return { inserted: 0, skipped };

  const result = await db.collection(COLLECTION).insertMany(valid);
  return { inserted: result.insertedCount, skipped };
}
