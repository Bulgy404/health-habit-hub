/** A researcher limited to the studies they are a member of (#66). */
export const STUDY_RESEARCHER = "study-researcher";

/**
 * True when the account only sees its member studies: it holds
 * `study-researcher` and is not an admin. Mirrors `isStudyScoped` in the
 * backend's middleware/roles.js — the narrower role wins over `researcher`
 * on an account holding both. The backend enforces this; the portal only
 * hides what would fail anyway.
 */
export function isStudyScoped(roles: readonly string[] | undefined): boolean {
  const r = roles ?? [];
  return r.includes(STUDY_RESEARCHER) && !r.includes("admin");
}
