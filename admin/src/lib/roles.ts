/** A researcher limited to the studies they are a member of (#66). */
export const STUDY_RESEARCHER = "study-researcher";

/**
 * Both research roles see only assigned studies. Mirrors the backend's
 * middleware/roles.js; only admins have platform-wide access.
 */
export function isStudyScoped(roles: readonly string[] | undefined): boolean {
  const r = roles ?? [];
  return !r.includes("admin") && (r.includes("researcher") || r.includes(STUDY_RESEARCHER));
}
