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
