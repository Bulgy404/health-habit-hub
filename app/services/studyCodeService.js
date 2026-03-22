import { randomBytes } from 'node:crypto';
import { ObjectId } from '../models/survey.js';
import { COLLECTION as CODES } from '../models/studyCode.js';
import { COLLECTION as ENROLLMENTS } from '../models/enrollment.js';
import { COLLECTION as STUDIES } from '../models/study.js';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

function generateCode() {
  const buf = randomBytes(5);
  return (
    'HHH-' +
    Array.from(buf)
      .map((b) => ALPHABET[b % ALPHABET.length])
      .join('')
  );
}

async function generateUniqueCodes(db, count) {
  const codes = [];
  const seen = new Set();
  while (codes.length < count) {
    const code = generateCode();
    if (seen.has(code)) continue;
    const existing = await db.collection(CODES).findOne({ code });
    if (!existing) {
      codes.push(code);
      seen.add(code);
    }
  }
  return codes;
}

/**
 * Generate enrollment codes for a study group.
 * @param {{ db, studyId, groupId, count, maxRedemptions, expiresAt }} deps
 */
export async function createCodes({
  db,
  studyId,
  groupId,
  count,
  maxRedemptions,
  expiresAt,
}) {
  let studyOid;
  try {
    studyOid = new ObjectId(studyId);
  } catch {
    return { notFound: true };
  }

  const study = await db.collection(STUDIES).findOne({ _id: studyOid });
  if (!study) return { notFound: true };

  const group = study.groups.find((g) => g.id.toString() === groupId);
  if (!group) return { groupNotFound: true };

  const cnt = Math.min(100, Math.max(1, parseInt(count, 10) || 1));
  const codes = await generateUniqueCodes(db, cnt);
  const now = new Date();
  const maxRed = maxRedemptions != null ? parseInt(maxRedemptions, 10) : null;
  const exp = expiresAt ? new Date(expiresAt) : null;

  const docs = codes.map((code) => ({
    code,
    studyId: studyOid,
    groupId: group.id,
    maxRedemptions: maxRed,
    redemptionCount: 0,
    expiresAt: exp,
    createdAt: now,
  }));

  await db.collection(CODES).insertMany(docs);
  return { codes };
}

/**
 * List codes for a study (paginated).
 * @param {{ db, studyId, page?, limit? }} deps
 */
export async function listCodes({ db, studyId, page = 1, limit = 20 }) {
  let oid;
  try {
    oid = new ObjectId(studyId);
  } catch {
    return { notFound: true };
  }

  const study = await db.collection(STUDIES).findOne({ _id: oid });
  if (!study) return { notFound: true };

  const skip = (page - 1) * limit;
  const [docs, total] = await Promise.all([
    db
      .collection(CODES)
      .find({ studyId: oid })
      .skip(skip)
      .limit(limit)
      .toArray(),
    db.collection(CODES).countDocuments({ studyId: oid }),
  ]);

  return {
    total,
    page,
    limit,
    codes: docs.map((c) => ({
      code: c.code,
      groupId: c.groupId.toString(),
      maxRedemptions: c.maxRedemptions,
      redemptionCount: c.redemptionCount,
      expiresAt: c.expiresAt,
      createdAt: c.createdAt,
    })),
  };
}

/**
 * Revoke (delete) a code. Returns { conflict: true } if already redeemed.
 * @param {{ db, studyId, code }} deps
 */
export async function revokeCode({ db, studyId, code }) {
  let oid;
  try {
    oid = new ObjectId(studyId);
  } catch {
    return { notFound: true };
  }

  const study = await db.collection(STUDIES).findOne({ _id: oid });
  if (!study) return { notFound: true };

  const upperCode = code.toUpperCase();
  const doc = await db
    .collection(CODES)
    .findOne({ code: upperCode, studyId: oid });
  if (!doc) return { notFound: true };

  if (doc.redemptionCount > 0) return { conflict: true };

  await db.collection(CODES).deleteOne({ code: upperCode });
  return { deleted: true };
}

/**
 * Redeem a code for the authenticated user.
 * @param {{ db, userId, code }} deps
 */
export async function redeemCode({ db, userId, code }) {
  const upperCode = code.toUpperCase();

  const doc = await db.collection(CODES).findOne({ code: upperCode });
  if (!doc) return { notFound: true };

  if (doc.expiresAt && doc.expiresAt < new Date()) return { expired: true };

  if (doc.maxRedemptions != null && doc.redemptionCount >= doc.maxRedemptions) {
    return { exhausted: true };
  }

  const existing = await db.collection(ENROLLMENTS).findOne({ userId });
  if (existing) return { alreadyEnrolled: true };

  const study = await db.collection(STUDIES).findOne({ _id: doc.studyId });
  if (!study) return { notFound: true };

  const group = study.groups.find(
    (g) => g.id.toString() === doc.groupId.toString()
  );

  await db.collection(ENROLLMENTS).insertOne({
    userId,
    studyId: doc.studyId,
    groupId: doc.groupId,
    studyCodeUsed: upperCode,
    enrolledAt: new Date(),
  });

  await db
    .collection(CODES)
    .updateOne({ code: upperCode }, { $inc: { redemptionCount: 1 } });

  return {
    enrolled: true,
    studyId: doc.studyId.toString(),
    groupId: doc.groupId.toString(),
    studyName: study.name,
    groupLabel: group ? group.label : null,
  };
}

/**
 * Enroll user in the default study using round-robin group assignment. Idempotent.
 * @param {{ db, userId }} deps
 */
export async function skipCode({ db, userId }) {
  const existing = await db.collection(ENROLLMENTS).findOne({ userId });
  if (existing) {
    const study = await db
      .collection(STUDIES)
      .findOne({ _id: existing.studyId });
    const group = study
      ? study.groups.find(
          (g) => g.id.toString() === existing.groupId.toString()
        )
      : null;
    return {
      enrolled: true,
      studyId: existing.studyId.toString(),
      groupId: existing.groupId.toString(),
      studyName: study ? study.name : null,
      groupLabel: group ? group.label : null,
    };
  }

  const study = await db
    .collection(STUDIES)
    .findOne({ isDefault: true, isActive: true });
  if (!study) return { noDefaultStudy: true };
  if (!study.groups || study.groups.length === 0) return { noGroups: true };

  const counts = await db
    .collection(ENROLLMENTS)
    .aggregate([
      { $match: { studyId: study._id } },
      { $group: { _id: '$groupId', count: { $sum: 1 } } },
    ])
    .toArray();

  const countMap = Object.fromEntries(
    counts.map((c) => [c._id.toString(), c.count])
  );

  let minCount = Infinity;
  let selectedGroup = study.groups[0];
  for (const g of study.groups) {
    const cnt = countMap[g.id.toString()] || 0;
    if (cnt < minCount) {
      minCount = cnt;
      selectedGroup = g;
    }
  }

  await db.collection(ENROLLMENTS).insertOne({
    userId,
    studyId: study._id,
    groupId: selectedGroup.id,
    studyCodeUsed: null,
    enrolledAt: new Date(),
  });

  return {
    enrolled: true,
    studyId: study._id.toString(),
    groupId: selectedGroup.id.toString(),
    studyName: study.name,
    groupLabel: selectedGroup.label,
  };
}
