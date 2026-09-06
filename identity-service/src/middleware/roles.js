/**
 * The role model, and the separation of duties it enforces.
 *
 * A realm role says WHAT someone may do. `study_site_assignments` says WHERE.
 * Holding `study-nurse` grants access to no roster at all until an assignment
 * row exists — see src/db/schema.sql.
 *
 * The rules below are enforced in code rather than documented in a policy,
 * because a policy drifts and a runtime 403 does not.
 */

export const IDENTITY_ROLES = Object.freeze({
  MANAGER: 'identity-manager',
  NURSE: 'study-nurse',
  MONITOR: 'monitor',
});

/** Roles from the research platform. Present here only to be excluded. */
export const RESEARCH_ROLES = Object.freeze({
  RESEARCHER: 'researcher',
  ADMIN: 'admin',
});

const ALL_IDENTITY_ROLES = Object.values(IDENTITY_ROLES);

/**
 * Roles that must never be combined with any identity role.
 *
 * `researcher` is the whole point: the person analysing the pseudonymous
 * research data must not also be able to resolve those pseudonyms to people.
 * That is what makes the data genuinely pseudonymous rather than
 * pseudonymous-in-name-only, and it is the property an ethics board looks for.
 *
 * `admin` is deliberately NOT here. An admin may hold `monitor` (approving a
 * re-identification is a reasonable operational duty), but is barred from the
 * requesting roles below — so an admin account can approve, never request.
 */
export const MUTUALLY_EXCLUSIVE_WITH_IDENTITY = Object.freeze([
  RESEARCH_ROLES.RESEARCHER,
]);

/**
 * Identity roles an `admin` may not hold.
 *
 * Combined with the four-eyes database trigger this means a single admin
 * account cannot both raise and approve a request. The operator running two
 * separate accounts to do both is expected and accepted — the control makes
 * that visible in the audit trail, it does not prevent it. Stated plainly:
 * this is non-repudiation, not prevention. A Keycloak realm admin can always
 * mint a principal.
 */
export const ADMIN_FORBIDDEN_IDENTITY_ROLES = Object.freeze([
  IDENTITY_ROLES.MANAGER,
  IDENTITY_ROLES.NURSE,
]);

/** @param {object|null} user Decoded token */
export function rolesOf(user) {
  const roles = user?.realm_access?.roles;
  return Array.isArray(roles) ? roles : [];
}

export function identityRolesOf(user) {
  return rolesOf(user).filter((r) => ALL_IDENTITY_ROLES.includes(r));
}

/**
 * Check a token against the separation-of-duties rules.
 *
 * @returns {{ ok: true } | { ok: false, code: string, message: string }}
 */
export function checkRoleSeparation(user) {
  const roles = rolesOf(user);
  const identityRoles = identityRolesOf(user);
  if (identityRoles.length === 0) return { ok: true };

  const conflicting = MUTUALLY_EXCLUSIVE_WITH_IDENTITY.filter((r) =>
    roles.includes(r)
  );
  if (conflicting.length > 0) {
    return {
      ok: false,
      code: 'role_separation_violation',
      message:
        `An account may not hold ${conflicting.join(', ')} together with ` +
        `${identityRoles.join(', ')}. The person analysing research data must ` +
        'not be able to resolve pseudonyms to people.',
    };
  }

  if (roles.includes(RESEARCH_ROLES.ADMIN)) {
    const forbidden = identityRoles.filter((r) =>
      ADMIN_FORBIDDEN_IDENTITY_ROLES.includes(r)
    );
    if (forbidden.length > 0) {
      return {
        ok: false,
        code: 'admin_role_separation_violation',
        message:
          `An admin account may not hold ${forbidden.join(', ')}. Admins may ` +
          'hold `monitor` (approve) but must not be able to raise requests ' +
          'they could then approve.',
      };
    }
  }

  return { ok: true };
}

/**
 * Express guard: allow-list PLUS the deny check above.
 *
 * The deny check runs first and unconditionally, so adding a role to the
 * allow-list can never accidentally re-permit a forbidden combination.
 *
 * @param {...string} allowed
 */
export function requireIdentityRole(...allowed) {
  return function identityRoleGuard(req, res, next) {
    const user = req.user;
    if (!user) return res.status(401).json({ error: 'unauthenticated' });

    const separation = checkRoleSeparation(user);
    if (!separation.ok) {
      return res
        .status(403)
        .json({ error: separation.code, message: separation.message });
    }

    const roles = rolesOf(user);
    if (!allowed.some((r) => roles.includes(r))) {
      return res.status(403).json({ error: 'insufficient_role' });
    }
    return next();
  };
}
