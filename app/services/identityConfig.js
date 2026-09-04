/**
 * Single source of truth for reading a study's verified-identity settings.
 *
 * Every consumer goes through `resolveIdentityConfig` rather than poking at
 * `study.identity` directly, so the "absent means anonymous" convention is
 * applied in exactly one place. Getting that wrong in one call site is how a
 * study silently behaves as verified — or, worse, how a verified study
 * silently behaves as anonymous and orphans its subject links.
 *
 * See docs/identity-mode-plan.md § 4.
 */

/**
 * Studies created before this feature have no `identity` field at all.
 *
 * Note `Object.freeze` is shallow, so `verificationMethods` is still a mutable
 * array — every code path below therefore returns a *copy* of it rather than
 * the shared reference. A caller mutating the returned config must not be able
 * to change what the next caller sees.
 */
export const DEFAULT_IDENTITY = Object.freeze({
  mode: 'anonymous',
  subjectCodePrefix: null,
  verificationMethods: ['in_person'],
  consentDocumentSlug: null,
  reidentificationApprovers: 1,
  revealTtlMinutes: 60,
  auditReads: true,
  researcherScoping: 'open',
});

/**
 * @param {object|null|undefined} study A study document, or null.
 * @returns {typeof DEFAULT_IDENTITY} Fully-populated config; never throws.
 */
export function resolveIdentityConfig(study) {
  const raw = study?.identity ?? null;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return {
      ...DEFAULT_IDENTITY,
      verificationMethods: [...DEFAULT_IDENTITY.verificationMethods],
    };
  }

  const mode = raw.mode === 'verified' ? 'verified' : 'anonymous';

  // Researcher scoping is FORCED on for verified studies regardless of what is
  // stored. Global per-study scoping does not exist yet and turning it on
  // everywhere would break every current researcher; forcing it exactly where
  // identity data exists gets the protection without the breakage.
  const researcherScoping =
    mode === 'verified'
      ? 'scoped'
      : raw.researcherScoping === 'scoped'
        ? 'scoped'
        : 'open';

  return {
    mode,
    subjectCodePrefix: raw.subjectCodePrefix ?? null,
    verificationMethods:
      Array.isArray(raw.verificationMethods) && raw.verificationMethods.length
        ? [...raw.verificationMethods]
        : [...DEFAULT_IDENTITY.verificationMethods],
    consentDocumentSlug: raw.consentDocumentSlug ?? null,
    reidentificationApprovers: raw.reidentificationApprovers === 2 ? 2 : 1,
    revealTtlMinutes:
      Number.isInteger(raw.revealTtlMinutes) && raw.revealTtlMinutes >= 5
        ? raw.revealTtlMinutes
        : DEFAULT_IDENTITY.revealTtlMinutes,
    auditReads: raw.auditReads !== false,
    researcherScoping,
  };
}

/** Convenience predicate — reads better than comparing strings at call sites. */
export function isVerifiedStudy(study) {
  return resolveIdentityConfig(study).mode === 'verified';
}

/**
 * Fields that may never be changed once anyone has enrolled.
 *
 * Flipping `verified → anonymous` would orphan live subject links, and
 * `anonymous → verified` is meaningless for participants who already enrolled
 * without an identity. Changing the prefix would break the 1:1 correspondence
 * between a stored subject code and the register that issued it.
 */
export const FROZEN_AFTER_ENROLLMENT = Object.freeze([
  'mode',
  'subjectCodePrefix',
]);

/**
 * @param {object|null} current Existing study document
 * @param {object|null} incoming Proposed `identity` patch
 * @returns {string[]} Names of frozen fields the patch would change.
 */
export function frozenFieldChanges(current, incoming) {
  if (!incoming || typeof incoming !== 'object') return [];
  const now = resolveIdentityConfig(current);
  return FROZEN_AFTER_ENROLLMENT.filter(
    (field) =>
      incoming[field] !== undefined &&
      incoming[field] !== null &&
      incoming[field] !== now[field]
  );
}
