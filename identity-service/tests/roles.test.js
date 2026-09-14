import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  IDENTITY_ROLES,
  RESEARCH_ROLES,
  checkRoleSeparation,
  requireIdentityRole,
  identityRolesOf,
} from '../src/middleware/roles.js';

const user = (...roles) => ({ sub: 'u1', realm_access: { roles } });

function runGuard(guard, u) {
  const req = { user: u };
  let status = null;
  let body = null;
  let nexted = false;
  const res = {
    status(s) {
      status = s;
      return this;
    },
    json(b) {
      body = b;
      return this;
    },
  };
  guard(req, res, () => {
    nexted = true;
  });
  return { status, body, nexted };
}

describe('checkRoleSeparation', () => {
  it('allows an ordinary identity role', () => {
    assert.equal(checkRoleSeparation(user(IDENTITY_ROLES.NURSE)).ok, true);
    assert.equal(checkRoleSeparation(user(IDENTITY_ROLES.MANAGER)).ok, true);
    assert.equal(checkRoleSeparation(user(IDENTITY_ROLES.MONITOR)).ok, true);
  });

  it('ignores accounts with no identity role at all', () => {
    assert.equal(checkRoleSeparation(user(RESEARCH_ROLES.RESEARCHER)).ok, true);
    assert.equal(checkRoleSeparation(user()).ok, true);
    assert.equal(checkRoleSeparation(null).ok, true);
  });

  it('REFUSES researcher combined with any identity role', () => {
    // The property that makes the research data genuinely pseudonymous: the
    // person analysing it must not be able to resolve the pseudonyms.
    for (const role of Object.values(IDENTITY_ROLES)) {
      const r = checkRoleSeparation(user(RESEARCH_ROLES.RESEARCHER, role));
      assert.equal(r.ok, false, `researcher + ${role} must be refused`);
      assert.equal(r.code, 'role_separation_violation');
    }
  });

  it('refuses the combination regardless of role order', () => {
    assert.equal(
      checkRoleSeparation(
        user(IDENTITY_ROLES.MANAGER, RESEARCH_ROLES.RESEARCHER)
      ).ok,
      false
    );
  });

  it('lets an admin hold monitor — approving is a reasonable admin duty', () => {
    assert.equal(
      checkRoleSeparation(user(RESEARCH_ROLES.ADMIN, IDENTITY_ROLES.MONITOR))
        .ok,
      true
    );
  });

  it('REFUSES an admin holding a requesting role', () => {
    // So a single admin account can approve but never request. Combined with
    // the four-eyes database trigger, one account cannot do both.
    for (const role of [IDENTITY_ROLES.MANAGER, IDENTITY_ROLES.NURSE]) {
      const r = checkRoleSeparation(user(RESEARCH_ROLES.ADMIN, role));
      assert.equal(r.ok, false, `admin + ${role} must be refused`);
      assert.equal(r.code, 'admin_role_separation_violation');
    }
  });

  it('explains why, rather than returning a bare 403', () => {
    const r = checkRoleSeparation(
      user(RESEARCH_ROLES.RESEARCHER, IDENTITY_ROLES.NURSE)
    );
    assert.match(r.message, /must not be able to resolve pseudonyms/);
  });

  it('identityRolesOf ignores unrelated roles', () => {
    assert.deepEqual(
      identityRolesOf(user('user', 'researcher', IDENTITY_ROLES.NURSE)),
      [IDENTITY_ROLES.NURSE]
    );
    assert.deepEqual(identityRolesOf(user('user')), []);
    assert.deepEqual(identityRolesOf({}), []);
  });
});

describe('requireIdentityRole', () => {
  const guard = requireIdentityRole(
    IDENTITY_ROLES.MANAGER,
    IDENTITY_ROLES.NURSE
  );

  it('passes an allowed role through', () => {
    assert.equal(runGuard(guard, user(IDENTITY_ROLES.NURSE)).nexted, true);
  });

  it('401s an unauthenticated request', () => {
    assert.equal(runGuard(guard, null).status, 401);
  });

  it('403s a role that is not on the allow-list', () => {
    const r = runGuard(guard, user(IDENTITY_ROLES.MONITOR));
    assert.equal(r.status, 403);
    assert.equal(r.body.error, 'insufficient_role');
  });

  it('403s a researcher even when the allow-list would otherwise permit it', () => {
    // The deny check runs FIRST and unconditionally, so widening an allow-list
    // can never accidentally re-permit a forbidden combination.
    const r = runGuard(
      guard,
      user(RESEARCH_ROLES.RESEARCHER, IDENTITY_ROLES.NURSE)
    );
    assert.equal(r.status, 403);
    assert.equal(r.body.error, 'role_separation_violation');
  });

  it('403s an admin holding a requesting role', () => {
    const r = runGuard(
      guard,
      user(RESEARCH_ROLES.ADMIN, IDENTITY_ROLES.MANAGER)
    );
    assert.equal(r.status, 403);
    assert.equal(r.body.error, 'admin_role_separation_violation');
  });

  it('grants a plain researcher nothing at all', () => {
    assert.equal(runGuard(guard, user(RESEARCH_ROLES.RESEARCHER)).status, 403);
  });

  it('tolerates a malformed token without throwing', () => {
    for (const bad of [
      {},
      { realm_access: null },
      { realm_access: { roles: 'nope' } },
    ]) {
      assert.equal(runGuard(guard, bad).status, 403);
    }
  });
});
