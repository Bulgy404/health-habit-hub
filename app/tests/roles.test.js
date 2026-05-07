import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ROLES, requireRole, isPrivileged } from '../middleware/auth.js';

// ── ROLES constants ──────────────────────────────────────────────────────────

test('ROLES.USER equals "user"', () => {
  assert.equal(ROLES.USER, 'user');
});

test('ROLES.ADMIN equals "admin"', () => {
  assert.equal(ROLES.ADMIN, 'admin');
});

test('ROLES.RESEARCHER equals "researcher"', () => {
  assert.equal(ROLES.RESEARCHER, 'researcher');
});

test('ROLES has no PARTICIPANT key', () => {
  assert.ok(!('PARTICIPANT' in ROLES));
});

// ── requireRole middleware ───────────────────────────────────────────────────

function makeReq(roles) {
  return { user: { realm_access: { roles } } };
}

function makeRes() {
  const res = {
    _status: null,
    _body: null,
    status(s) { res._status = s; return res; },
    json(b) { res._body = b; return res; },
  };
  return res;
}

test('requireRole allows user with matching role', () => {
  const mw = requireRole(ROLES.ADMIN);
  const req = makeReq([ROLES.ADMIN]);
  const res = makeRes();
  let nextCalled = false;
  mw(req, res, () => { nextCalled = true; });
  assert.ok(nextCalled, 'next() should have been called');
});

test('requireRole blocks user without matching role', () => {
  const mw = requireRole(ROLES.ADMIN);
  const req = makeReq([ROLES.RESEARCHER]);
  const res = makeRes();
  mw(req, res, () => { throw new Error('next() should not be called'); });
  assert.equal(res._status, 403);
  assert.deepEqual(res._body, { error: 'Forbidden' });
});

test('requireRole allows any of multiple accepted roles', () => {
  const mw = requireRole(ROLES.ADMIN, ROLES.RESEARCHER);
  const req = makeReq([ROLES.RESEARCHER]);
  const res = makeRes();
  let nextCalled = false;
  mw(req, res, () => { nextCalled = true; });
  assert.ok(nextCalled, 'next() should have been called');
});

test('requireRole blocks user role from admin+researcher route', () => {
  const mw = requireRole(ROLES.ADMIN, ROLES.RESEARCHER);
  const req = makeReq([ROLES.USER]);
  const res = makeRes();
  mw(req, res, () => { throw new Error('next() should not be called'); });
  assert.equal(res._status, 403);
});

// ── isPrivileged helper ──────────────────────────────────────────────────────

test('isPrivileged returns true for admin', () => {
  assert.ok(isPrivileged({ realm_access: { roles: [ROLES.ADMIN] } }));
});

test('isPrivileged returns true for researcher', () => {
  assert.ok(isPrivileged({ realm_access: { roles: [ROLES.RESEARCHER] } }));
});

test('isPrivileged returns false for user', () => {
  assert.ok(!isPrivileged({ realm_access: { roles: [ROLES.USER] } }));
});
