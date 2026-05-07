/**
 * Canonical role name constants.
 * Import these instead of using magic strings like 'admin', 'researcher', 'user'.
 * Renaming a role requires a change in this file only.
 */
export const ROLES = {
  USER: 'user',
  ADMIN: 'admin',
  RESEARCHER: 'researcher',
};

/** Returns true if the user has admin or researcher realm role. */
export function isPrivileged(user) {
  const roles = user?.realm_access?.roles || [];
  return roles.includes(ROLES.ADMIN) || roles.includes(ROLES.RESEARCHER);
}
