/**
 * Canonical role name constants.
 * Import these instead of using magic strings like 'admin', 'researcher', 'participant'.
 * Renaming a role requires a change in this file only.
 */
export const ROLES = {
  PARTICIPANT: 'participant',
  ADMIN: 'admin',
  RESEARCHER: 'researcher',
};

/** Returns true if the user has admin or researcher realm role. */
export function isPrivileged(user) {
  const roles = user?.realm_access?.roles || [];
  return roles.includes(ROLES.ADMIN) || roles.includes(ROLES.RESEARCHER);
}
