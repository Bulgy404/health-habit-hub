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
 * Only admins have unrestricted access to other users' data. Research roles
 * must use the study-scoped routes, even when they hold both research roles.
 */
export function isPrivileged(user) {
  const roles = user?.realm_access?.roles || [];
  return roles.includes(ROLES.ADMIN);
}

/**
 * Both research roles require explicit study membership. Only an admin role
 * grants platform-wide access; legacy `researcher` tokens are scoped too.
 */
export function isStudyScoped(user) {
  const roles = user?.realm_access?.roles || [];
  return (
    !roles.includes(ROLES.ADMIN) &&
    [ROLES.RESEARCHER, ROLES.STUDY_RESEARCHER].some((role) =>
      roles.includes(role)
    )
  );
}
