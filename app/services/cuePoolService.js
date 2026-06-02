import { ObjectId } from 'mongodb';
import { COLLECTION } from '../models/cuePool.js';

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

export async function listCues({
  db,
  quality,
  language,
  page = 1,
  limit = 50,
}) {
  const filter = {};
  if (quality) filter.quality = quality;
  if (language) filter.language = language;
  const skip = (page - 1) * limit;
  const [docs, total] = await Promise.all([
    db.collection(COLLECTION).find(filter).skip(skip).limit(limit).toArray(),
    db.collection(COLLECTION).countDocuments(filter),
  ]);
  return { total, page, limit, cues: docs.map(serialize) };
}

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
 * Returns [] for self_selected (user provides their own cue).
 */
export async function pickAssignedCues({ db, cueSource, cueCount, cuePoolId = null }) {
  if (cueSource === 'self_selected') return [];

  const qualityMap = { low_quality: 'low', high_quality: 'high' };
  const quality = qualityMap[cueSource];
  if (!quality) return [];

  const n = cueCount === 'multi' ? 2 : 1;
  const match = { quality };
  if (cuePoolId) {
    try { match._id = new ObjectId(cuePoolId); } catch { /* ignore invalid id */ }
  }

  const docs = await db
    .collection(COLLECTION)
    .aggregate([{ $match: match }, { $sample: { size: n } }])
    .toArray();

  return docs.map(d => ({
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
