/**
 * Canonical role name constants.
 * Import these instead of using magic strings like 'admin', 'researcher', 'user'.
 * Renaming a role requires a change in this file only.
 */
export const ROLES = {
  USER: 'user',
  ADMIN: 'admin',
  RESEARCHER: 'researcher',
  /**
   * A researcher limited to the studies they are a member of (#66). Sees and
   * works on those studies only; every other admin route is closed to them.
   */
  STUDY_RESEARCHER: 'study-researcher',
};

/** Every role that may open the admin API at all. */
export const PORTAL_ROLES = [
  ROLES.ADMIN,
  ROLES.RESEARCHER,
  ROLES.STUDY_RESEARCHER,
];

/**
 * Returns true if the user has admin or researcher realm role.
 *
 * `study-researcher` is deliberately not privileged, and outranks
 * `researcher` on an account holding both: routes that let a privileged
 * caller read another user's data are not study-scoped, so the narrower role
 * gets the participant view there, not the researcher one.
 */
export function isPrivileged(user) {
  const roles = user?.realm_access?.roles || [];
  if (roles.includes(ROLES.ADMIN)) return true;
  return (
    roles.includes(ROLES.RESEARCHER) && !roles.includes(ROLES.STUDY_RESEARCHER)
  );
}

/**
 * Returns true if the user is limited to their member studies: they hold
 * `study-researcher` and are not an admin. The narrower role wins over
 * `researcher` when an account holds both, so granting it always restricts.
 */
export function isStudyScoped(user) {
  const roles = user?.realm_access?.roles || [];
  return roles.includes(ROLES.STUDY_RESEARCHER) && !roles.includes(ROLES.ADMIN);
}
