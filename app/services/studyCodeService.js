import { randomBytes } from 'node:crypto';
import { ObjectId } from '../models/survey.js';
import { COLLECTION as CODES } from '../models/studyCode.js';
import { COLLECTION as ENROLLMENTS } from '../models/enrollment.js';
import { COLLECTION as STUDIES } from '../models/study.js';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const ALPHABET_LEN = ALPHABET.length;
// Rejection-sampling threshold: discard bytes >= largest multiple of ALPHABET_LEN
// that fits in a byte (256), eliminating modulo bias.
const REJECTION_THRESHOLD = 256 - (256 % ALPHABET_LEN);

function _generateCode() {
  const chars = [];
  while (chars.length < 5) {
    const buf = randomBytes(10);
    for (const b of buf) {
      if (b < REJECTION_THRESHOLD) {
        chars.push(ALPHABET[b % ALPHABET_LEN]);
        if (chars.length === 5) break;
      }
    }
  }
  return 'HHH-' + chars.join('');
}

async function _generateUniqueCodes(db, count) {
  const codes = [];
  const seen = new Set();
  while (codes.length < count) {
    const code = _generateCode();
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
 * @param {{ db: object, studyId: string, groupId: string, count: number, maxRedemptions?: number|null, expiresAt?: string|null }} deps
 * @returns {Promise<{ codes: Array<string> }|{ notFound: boolean }|{ groupNotFound: boolean }>}
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
  const codes = await _generateUniqueCodes(db, cnt);
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
 * List enrollment codes for a study (paginated).
 * @param {{ db: object, studyId: string, page?: number, limit?: number }} deps
 * @returns {Promise<{ total: number, page: number, limit: number, codes: Array }|{ notFound: boolean }>}
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
 * @param {{ db: object, studyId: string, code: string }} deps
 * @returns {Promise<{ deleted: boolean }|{ conflict: boolean }|{ notFound: boolean }>}
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
 * Atomically claim one redemption slot on a code document.
 * Returns the updated code document, or null if the code is exhausted.
 * @param {object} db
 * @param {string} upperCode - Upper-cased enrollment code
 * @param {number|null} maxRedemptions
 * @returns {Promise<object|null>}
 */
async function _claimRedemptionSlot(db, upperCode, maxRedemptions) {
  // The $expr guard ensures redemptionCount < maxRedemptions at the moment of
  // the increment, so two concurrent requests cannot both claim the last slot.
  const codeFilter =
    maxRedemptions != null
      ? {
          code: upperCode,
          $expr: { $lt: ['$redemptionCount', '$maxRedemptions'] },
        }
      : { code: upperCode };

  return db
    .collection(CODES)
    .findOneAndUpdate(
      codeFilter,
      { $inc: { redemptionCount: 1 } },
      { returnDocument: 'after' }
    );
}

/**
 * Atomically enroll a user via upsert. Returns the pre-existing enrollment doc
 * if the user was already enrolled, or null if this is a new enrollment.
 * @param {object} db
 * @param {string} userId
 * @param {{ studyId: ObjectId, groupId: ObjectId }} codeDoc
 * @param {string} upperCode
 * @returns {Promise<object|null>} Prior enrollment document or null
 */
async function _atomicEnrollUser(db, userId, codeDoc, upperCode) {
  return db.collection(ENROLLMENTS).findOneAndUpdate(
    { userId: String(userId) },
    {
      $setOnInsert: {
        userId: String(userId),
        studyId: codeDoc.studyId,
        groupId: codeDoc.groupId,
        studyCodeUsed: upperCode,
        enrolledAt: new Date(),
      },
    },
    { upsert: true, returnDocument: 'before' }
  );
}

/**
 * Redeem an enrollment code for the authenticated user, enrolling them in the associated study group.
 * Uses atomic findOneAndUpdate guards to prevent over-redemption and duplicate enrollments.
 * @param {{ db: object, userId: string, code: string }} deps
 * @returns {Promise<{ enrolled: boolean, studyId: string, groupId: string, studyName: string|null, groupLabel: string|null }|{ notFound: boolean }|{ expired: boolean }|{ exhausted: boolean }|{ alreadyEnrolled: boolean }>}
 */
export async function redeemCode({ db, userId, code }) {
  const upperCode = code.toUpperCase();

  // Read-only pre-checks (non-sensitive to races — real guards below are atomic).
  const doc = await db.collection(CODES).findOne({ code: upperCode });
  if (!doc) return { notFound: true };

  if (doc.expiresAt && doc.expiresAt < new Date()) return { expired: true };

  // 1. Atomically claim a redemption slot.
  const claimed = await _claimRedemptionSlot(db, upperCode, doc.maxRedemptions);
  if (!claimed) return { exhausted: true };

  // 2. Atomically enroll the user (upsert: insert only if userId not present).
  //    With returnDocument:'before', a null result means the document was newly
  //    inserted (no prior enrollment); a non-null result means one already existed.
  const study = await db.collection(STUDIES).findOne({ _id: doc.studyId });
  const prior = await _atomicEnrollUser(db, userId, doc, upperCode);

  // If a prior enrollment existed, roll back the code counter and report conflict.
  if (prior !== null) {
    await db
      .collection(CODES)
      .updateOne({ code: upperCode }, { $inc: { redemptionCount: -1 } });
    return { alreadyEnrolled: true };
  }

  const group = study?.groups?.find(
    (g) => g.id.toString() === doc.groupId.toString()
  );

  return {
    enrolled: true,
    studyId: doc.studyId.toString(),
    groupId: doc.groupId.toString(),
    studyName: study?.name ?? null,
    groupLabel: group?.label ?? null,
  };
}

/**
 * If the user is already enrolled, return their existing enrollment details.
 * Returns null when no prior enrollment exists.
 * @param {object} db
 * @param {string} userId
 * @returns {Promise<{ enrolled: boolean, studyId: string, groupId: string, studyName: string|null, groupLabel: string|null }|null>}
 */
async function _getExistingEnrollment(db, userId) {
  const existing = await db
    .collection(ENROLLMENTS)
    .findOne({ userId: String(userId) });
  if (!existing) return null;

  const study = await db.collection(STUDIES).findOne({ _id: existing.studyId });
  const group = study
    ? study.groups.find((g) => g.id.toString() === existing.groupId.toString())
    : null;
  return {
    enrolled: true,
    studyId: existing.studyId.toString(),
    groupId: existing.groupId.toString(),
    studyName: study ? study.name : null,
    groupLabel: group ? group.label : null,
  };
}

/**
 * Enroll a user in the default study via round-robin group assignment. Idempotent.
 * Uses atomic counter increment and upsert to prevent duplicate enrollments under concurrency.
 * @param {{ db: object, userId: string }} deps
 * @returns {Promise<{ enrolled: boolean, studyId: string, groupId: string, studyName: string|null, groupLabel: string|null }|{ noDefaultStudy: boolean }|{ noGroups: boolean }>}
 */
export async function skipCode({ db, userId }) {
  // Fast path: user is already enrolled (idempotent).
  const existingResult = await _getExistingEnrollment(db, userId);
  if (existingResult) return existingResult;

  // Atomically claim a slot by incrementing the study's round-robin counter.
  // returnDocument:'after' gives us the post-increment value so counter >= 1.
  const study = await db
    .collection(STUDIES)
    .findOneAndUpdate(
      { isDefault: true, isActive: true },
      { $inc: { _skipCounter: 1 } },
      { returnDocument: 'after' }
    );

  if (!study) return { noDefaultStudy: true };
  if (!study.groups || study.groups.length === 0) return { noGroups: true };

  // Derive group index from the counter (1-based → 0-based).
  const idx = (study._skipCounter - 1) % study.groups.length;
  const selectedGroup = study.groups[idx];

  // Atomically insert enrollment only if this user is not yet enrolled.
  // If a concurrent request already enrolled this user, prior will be non-null.
  const prior = await db.collection(ENROLLMENTS).findOneAndUpdate(
    { userId: String(userId) },
    {
      $setOnInsert: {
        userId: String(userId),
        studyId: study._id,
        groupId: selectedGroup.id,
        studyCodeUsed: null,
        enrolledAt: new Date(),
      },
    },
    { upsert: true, returnDocument: 'before' }
  );

  if (prior !== null) {
    // Concurrent request enrolled this user first; return their enrollment.
    const group = study.groups.find(
      (g) => g.id.toString() === prior.groupId.toString()
    );
    return {
      enrolled: true,
      studyId: prior.studyId.toString(),
      groupId: prior.groupId.toString(),
      studyName: study.name,
      groupLabel: group ? group.label : null,
    };
  }

  return {
    enrolled: true,
    studyId: study._id.toString(),
    groupId: selectedGroup.id.toString(),
    studyName: study.name,
    groupLabel: selectedGroup.label,
  };
}
