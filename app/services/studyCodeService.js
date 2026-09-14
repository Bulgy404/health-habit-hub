import { randomBytes } from 'node:crypto';
import { ObjectId } from '../models/survey.js';
import { COLLECTION as CODES } from '../models/studyCode.js';
import { COLLECTION as STUDIES } from '../models/study.js';
import { resolveIdentityConfig } from './identityConfig.js';
import { COLLECTION as ENROLLMENTS } from '../models/enrollment.js';
import {
  getEnrollment,
  createEnrollment,
  switchEnrollment,
} from './enrollmentNeo4j.js';
import { generateWindowsForUser } from './questionnaireScheduleService.js';

/** Best-effort: create the participant's questionnaire windows on enrollment. */
async function scheduleQuestionnaires(
  db,
  userId,
  studyId,
  groupId,
  enrolledAt
) {
  try {
    await generateWindowsForUser({ db, userId, studyId, groupId, enrolledAt });
  } catch {
    // Non-fatal: windows can be regenerated when an assignment changes.
  }
}

/**
 * Keep the Mongo `enrollments` collection (used by dropout exports, admin
 * stats, notification targeting, and questionnaire scheduling — see
 * models/enrollment.js) in sync with the Neo4j ENROLLED_IN relationship,
 * which is the source of truth for "who is enrolled where right now".
 * Upserts so this self-heals for any participant enrolled before this
 * collection was wired up.
 * @param {{ db: object, userId: string, studyId: string, groupId: string|null, studyCodeUsed: string|null, enrolledAt: Date }} deps
 */
async function _upsertMongoEnrollment(
  db,
  { userId, studyId, groupId, studyCodeUsed, enrolledAt, subjectCode = null }
) {
  // groupId is required by the enrollments schema; skip rather than crash
  // the (Neo4j-backed, already-succeeded) enrollment if it's ever missing —
  // e.g. a code pointing at a since-deleted group.
  if (!groupId) return;
  try {
    await db.collection(ENROLLMENTS).updateOne(
      { userId: String(userId) },
      {
        $set: {
          userId: String(userId),
          studyId: new ObjectId(studyId),
          groupId: new ObjectId(groupId),
          studyCodeUsed: studyCodeUsed ?? null,
          // Set only for verified-identity studies. This is the join key
          // researchers see instead of the raw Keycloak sub, and the only
          // thing tying an enrolment back to the identity register.
          subjectCode: subjectCode ?? null,
          enrolledAt,
          droppedOutAt: null,
          cueConfig: null,
        },
      },
      { upsert: true }
    );
  } catch {
    // Non-fatal: Neo4j is the source of truth for enrollment; this mirror
    // can be repaired later. Don't fail the enrollment call over it.
  }
}

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

  // groupId is optional: null/undefined → study-level code (group assigned at redemption).
  let resolvedGroupId = null;
  if (groupId) {
    const group = study.groups.find((g) => g.id.toString() === groupId);
    if (!group) return { groupNotFound: true };
    resolvedGroupId = group.id;
  }

  const cnt = Math.min(100, Math.max(1, parseInt(count, 10) || 1));
  const codes = await _generateUniqueCodes(db, cnt);
  const now = new Date();
  const maxRed = maxRedemptions != null ? parseInt(maxRedemptions, 10) : null;
  const exp = expiresAt ? new Date(expiresAt) : null;

  const docs = codes.map((code) => ({
    code,
    studyId: studyOid,
    groupId: resolvedGroupId,
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
      groupId: c.groupId?.toString() ?? null,
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
 * Select a study group using weighted round-robin.
 * Atomically increments the study's _skipCounter and maps it to a group
 * based on each group's allocationWeight (default 1 = equal weight).
 * @param {object} db
 * @param {object} study - Full study document (must have _id and groups)
 * @returns {Promise<object>} The selected group object
 */
async function _selectGroupWeighted(db, study) {
  const groups = study.groups || [];
  const totalWeight = groups.reduce((s, g) => s + (g.allocationWeight ?? 1), 0);

  const updated = await db
    .collection(STUDIES)
    .findOneAndUpdate(
      { _id: study._id },
      { $inc: { _skipCounter: 1 } },
      { returnDocument: 'after' }
    );

  // Map counter (1-based after increment) to a group slot
  let pos =
    (((updated._skipCounter - 1) % totalWeight) + totalWeight) % totalWeight;
  for (const group of groups) {
    const w = group.allocationWeight ?? 1;
    if (pos < w) return group;
    pos -= w;
  }
  return groups[0];
}

/**
 * Return the authenticated user's current study/group, with human-readable
 * names, for display in the app's account screen.
 * @param {{ db: object, userId: string, neo4jRun: Function }} deps
 * @returns {Promise<{ studyId: string, groupId: string|null, studyName: string|null, groupLabel: string|null, isDefaultStudy: boolean, studyCodeUsed: string|null }|{ notEnrolled: boolean }>}
 */
export async function getEnrollmentStatus({ db, userId, neo4jRun }) {
  const current = await getEnrollment(neo4jRun, userId);
  if (!current) return { notEnrolled: true };

  let study = null;
  try {
    study = await db
      .collection(STUDIES)
      .findOne({ _id: new ObjectId(current.studyId) });
  } catch {
    // bad studyId — study stays null
  }
  const group = study
    ? (study.groups || []).find((g) => g.id.toString() === current.groupId)
    : null;

  return {
    studyId: current.studyId,
    groupId: current.groupId,
    studyName: study?.name ?? null,
    groupLabel: group?.label ?? null,
    isDefaultStudy: study?.isDefault === true,
    studyCodeUsed: current.studyCodeUsed,
  };
}

/**
 * Redeem an enrollment code for the authenticated user, enrolling them in the associated study group.
 * @param {{ db: object, userId: string, code: string, neo4jRun: Function }} deps
 * @returns {Promise<{ enrolled: boolean, studyId: string, groupId: string, studyName: string|null, groupLabel: string|null }|{ notFound: boolean }|{ expired: boolean }|{ exhausted: boolean }|{ alreadyEnrolled: boolean }>}
 */
export async function redeemCode({ db, userId, code, neo4jRun }) {
  const upperCode = code.toUpperCase();

  // Read-only pre-checks (non-sensitive to races — real guards below are atomic).
  const doc = await db.collection(CODES).findOne({ code: upperCode });
  if (!doc) return { notFound: true };

  if (doc.expiresAt && doc.expiresAt < new Date()) return { expired: true };

  // 1. Atomically claim a redemption slot.
  const claimed = await _claimRedemptionSlot(db, upperCode, doc.maxRedemptions);
  if (!claimed) return { exhausted: true };

  const study = await db.collection(STUDIES).findOne({ _id: doc.studyId });

  // Resolve group: targeted code → use stored groupId; study-level code → weighted round-robin.
  let group;
  if (doc.groupId) {
    group = study?.groups?.find(
      (g) => g.id.toString() === doc.groupId.toString()
    );
  } else {
    group = await _selectGroupWeighted(db, study);
  }

  // 2. Create enrollment in Neo4j (check-then-create).
  const enrollResult = await createEnrollment(neo4jRun, {
    userId,
    studyId: doc.studyId.toString(),
    groupId: group?.id?.toString() ?? null,
    studyCodeUsed: upperCode,
    enrolledAt: new Date(),
  });

  // If already enrolled, roll back the code counter and report conflict.
  if (enrollResult.alreadyEnrolled) {
    await db
      .collection(CODES)
      .updateOne({ code: upperCode }, { $inc: { redemptionCount: -1 } });
    return { alreadyEnrolled: true };
  }

  const enrolledAt = new Date();
  await _upsertMongoEnrollment(db, {
    userId,
    studyId: doc.studyId,
    groupId: group?.id ?? null,
    studyCodeUsed: upperCode,
    enrolledAt,
  });

  await scheduleQuestionnaires(
    db,
    userId,
    doc.studyId,
    group?.id ?? null,
    enrolledAt
  );

  return {
    enrolled: true,
    studyId: doc.studyId.toString(),
    groupId: group?.id?.toString() ?? null,
    studyName: study?.name ?? null,
    groupLabel: group?.label ?? null,
  };
}

/**
 * Enrol a participant who presented a verified-identity code (HHV-…).
 *
 * The three-step protocol exists because the enrolment spans two databases
 * with no shared transaction. See identity-service/src/services/linkService.js
 * for the full reasoning; the short version is that reserving first leaves a
 * recoverable state, whereas redeeming first would burn the code if the Neo4j
 * enrolment then failed.
 *
 *   reserve  → identity register claims the code, returns routing data only
 *   enrol    → HHH does exactly what it does for an anonymous code
 *   confirm  → the register records the account link and spends the code
 *   release  → on ANY failure, hand the code straight back
 *
 * Group allocation stays here, in HHH, using the same weighted round-robin as
 * every other enrolment: the register knows who someone is, not which arm they
 * belong in, and moving randomisation across the boundary would give it a
 * reason to know.
 *
 * @param {{ db: object, userId: string, code: string, neo4jRun: Function, identityClient: object }} deps
 */
export async function redeemIdentityCode({
  db,
  userId,
  code,
  neo4jRun,
  identityClient,
}) {
  let reservation;
  try {
    reservation = await identityClient.reserve(code);
  } catch (err) {
    if (err.status === 404) return { notFound: true };
    return { identityUnavailable: true, error: err.message };
  }

  const { reservationId, hhhStudyId, subjectCode } = reservation;

  try {
    let studyOid;
    try {
      studyOid = new ObjectId(hhhStudyId);
    } catch {
      await identityClient.release(reservationId);
      return { notFound: true };
    }

    const study = await db.collection(STUDIES).findOne({ _id: studyOid });
    if (!study) {
      await identityClient.release(reservationId);
      return { notFound: true };
    }

    const group = await _selectGroupWeighted(db, study);

    const enrollResult = await createEnrollment(neo4jRun, {
      userId,
      studyId: hhhStudyId,
      groupId: group?.id?.toString() ?? null,
      // The HHV code is 1:1 with a subject, so persisting it in HHH would
      // create a correlator between the two databases. The subject code is
      // already stored below and is the intended join key.
      studyCodeUsed: null,
      enrolledAt: new Date(),
    });

    if (enrollResult.alreadyEnrolled) {
      await identityClient.release(reservationId);
      return { alreadyEnrolled: true };
    }

    const enrolledAt = new Date();
    await _upsertMongoEnrollment(db, {
      userId,
      studyId: studyOid,
      groupId: group?.id ?? null,
      studyCodeUsed: null,
      subjectCode,
      enrolledAt,
    });

    await identityClient.confirm({
      reservationId,
      keycloakSub: userId,
      hhhGroupId: group?.id?.toString() ?? null,
    });

    await scheduleQuestionnaires(
      db,
      userId,
      studyOid,
      group?.id ?? null,
      enrolledAt
    );

    const identity = resolveIdentityConfig(study);
    return {
      enrolled: true,
      studyId: hhhStudyId,
      groupId: group?.id?.toString() ?? null,
      studyName: study?.name ?? null,
      groupLabel: group?.label ?? null,
      subjectCode,
      identityConsentRequired: Boolean(identity.consentDocumentSlug),
      identityConsentSlug: identity.consentDocumentSlug,
    };
  } catch (err) {
    // Any failure after reserving hands the code straight back, so the
    // participant can simply try again rather than needing a replacement.
    await identityClient.release(reservationId);
    throw err;
  }
}

/**
 * Enroll a user in the default study via round-robin group assignment. Idempotent.
 * @param {{ db: object, userId: string, neo4jRun: Function }} deps
 * @returns {Promise<{ enrolled: boolean, studyId: string, groupId: string, studyName: string|null, groupLabel: string|null }|{ noDefaultStudy: boolean }|{ noGroups: boolean }>}
 */
export async function skipCode({ db, userId, neo4jRun }) {
  // Fast path: user is already enrolled (idempotent — check Neo4j).
  const existingEnrollment = await getEnrollment(neo4jRun, userId);
  if (existingEnrollment) {
    let study = null;
    if (existingEnrollment.studyId) {
      try {
        study = await db
          .collection(STUDIES)
          .findOne({ _id: new ObjectId(existingEnrollment.studyId) });
      } catch {
        // bad studyId — study stays null
      }
    }
    const group = study
      ? (study.groups || []).find(
          (g) => g.id.toString() === existingEnrollment.groupId
        )
      : null;
    return {
      enrolled: true,
      studyId: existingEnrollment.studyId,
      groupId: existingEnrollment.groupId,
      studyName: study ? study.name : null,
      groupLabel: group ? group.label : null,
    };
  }

  // Atomically claim a slot by incrementing the study's round-robin counter.
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

  const enrolledAt = new Date();
  const enrollResult = await createEnrollment(neo4jRun, {
    userId,
    studyId: study._id.toString(),
    groupId: selectedGroup.id.toString(),
    studyCodeUsed: null,
    enrolledAt,
  });

  if (enrollResult.alreadyEnrolled) {
    // Another concurrent request enrolled this user; re-fetch from Neo4j.
    const neo = await getEnrollment(neo4jRun, userId);
    const grp = neo?.groupId
      ? (study.groups || []).find((g) => g.id.toString() === neo.groupId)
      : null;
    return {
      enrolled: true,
      studyId: neo?.studyId ?? study._id.toString(),
      groupId: neo?.groupId ?? selectedGroup.id.toString(),
      studyName: study.name,
      groupLabel: grp ? grp.label : selectedGroup.label,
    };
  }

  await _upsertMongoEnrollment(db, {
    userId,
    studyId: study._id,
    groupId: selectedGroup.id,
    studyCodeUsed: null,
    enrolledAt,
  });

  return {
    enrolled: true,
    studyId: study._id.toString(),
    groupId: selectedGroup.id.toString(),
    studyName: study.name,
    groupLabel: selectedGroup.label,
  };
}

/**
 * Move an already-enrolled participant to a different study via a new
 * enrollment code. Habits they've already donated keep the studyId they were
 * stamped with at donation time (studies own their historical data, not
 * participants) — only future donations are attributed to the new study.
 * @param {{ db: object, userId: string, code: string, neo4jRun: Function }} deps
 * @returns {Promise<{ moved: boolean, studyId: string, groupId: string, studyName: string|null, groupLabel: string|null }|{ notEnrolled: boolean }|{ notFound: boolean }|{ expired: boolean }|{ exhausted: boolean }|{ alreadyInStudy: boolean }>}
 */
export async function switchStudy({ db, userId, code, neo4jRun }) {
  const current = await getEnrollment(neo4jRun, userId);
  if (!current) return { notEnrolled: true };

  const upperCode = code.toUpperCase();
  const doc = await db.collection(CODES).findOne({ code: upperCode });
  if (!doc) return { notFound: true };
  if (doc.expiresAt && doc.expiresAt < new Date()) return { expired: true };

  if (doc.studyId.toString() === current.studyId) {
    return { alreadyInStudy: true };
  }

  const claimed = await _claimRedemptionSlot(db, upperCode, doc.maxRedemptions);
  if (!claimed) return { exhausted: true };

  const study = await db.collection(STUDIES).findOne({ _id: doc.studyId });
  let group;
  if (doc.groupId) {
    group = study?.groups?.find(
      (g) => g.id.toString() === doc.groupId.toString()
    );
  } else {
    group = await _selectGroupWeighted(db, study);
  }

  const movedAt = new Date();
  const moveResult = await switchEnrollment(neo4jRun, {
    userId,
    newStudyId: doc.studyId.toString(),
    newGroupId: group?.id?.toString() ?? null,
    studyCodeUsed: upperCode,
    movedAt,
  });

  if (moveResult.noActiveEnrollment) {
    await db
      .collection(CODES)
      .updateOne({ code: upperCode }, { $inc: { redemptionCount: -1 } });
    return { notEnrolled: true };
  }

  await _upsertMongoEnrollment(db, {
    userId,
    studyId: doc.studyId,
    groupId: group?.id ?? null,
    studyCodeUsed: upperCode,
    enrolledAt: movedAt,
  });

  await scheduleQuestionnaires(
    db,
    userId,
    doc.studyId,
    group?.id ?? null,
    movedAt
  );

  return {
    moved: true,
    studyId: doc.studyId.toString(),
    groupId: group?.id?.toString() ?? null,
    studyName: study?.name ?? null,
    groupLabel: group?.label ?? null,
  };
}

/**
 * Move an already-enrolled participant back to the default study — the
 * "leave study" action. Nothing is deleted: past habits, logs, and
 * questionnaire responses stay exactly as they were donated/submitted,
 * still attributed to the study the participant is leaving.
 * @param {{ db: object, userId: string, neo4jRun: Function }} deps
 * @returns {Promise<{ moved: boolean, studyId: string, groupId: string, studyName: string|null, groupLabel: string|null }|{ notEnrolled: boolean }|{ noDefaultStudy: boolean }|{ noGroups: boolean }|{ alreadyInDefaultStudy: boolean }>}
 */
export async function leaveStudy({ db, userId, neo4jRun }) {
  const current = await getEnrollment(neo4jRun, userId);
  if (!current) return { notEnrolled: true };

  const defaultStudy = await db
    .collection(STUDIES)
    .findOne({ isDefault: true, isActive: true });
  if (!defaultStudy) return { noDefaultStudy: true };
  if (!defaultStudy.groups || defaultStudy.groups.length === 0) {
    return { noGroups: true };
  }

  if (defaultStudy._id.toString() === current.studyId) {
    return { alreadyInDefaultStudy: true };
  }

  const updatedStudy = await db
    .collection(STUDIES)
    .findOneAndUpdate(
      { _id: defaultStudy._id },
      { $inc: { _skipCounter: 1 } },
      { returnDocument: 'after' }
    );
  const idx = (updatedStudy._skipCounter - 1) % updatedStudy.groups.length;
  const selectedGroup = updatedStudy.groups[idx];

  const movedAt = new Date();
  const moveResult = await switchEnrollment(neo4jRun, {
    userId,
    newStudyId: updatedStudy._id.toString(),
    newGroupId: selectedGroup.id.toString(),
    studyCodeUsed: null,
    movedAt,
  });

  if (moveResult.noActiveEnrollment) return { notEnrolled: true };

  await _upsertMongoEnrollment(db, {
    userId,
    studyId: updatedStudy._id,
    groupId: selectedGroup.id,
    studyCodeUsed: null,
    enrolledAt: movedAt,
  });

  await scheduleQuestionnaires(
    db,
    userId,
    updatedStudy._id,
    selectedGroup.id,
    movedAt
  );

  return {
    moved: true,
    studyId: updatedStudy._id.toString(),
    groupId: selectedGroup.id.toString(),
    studyName: updatedStudy.name,
    groupLabel: selectedGroup.label,
  };
}
