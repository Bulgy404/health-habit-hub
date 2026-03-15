import { test } from 'node:test';
import assert from 'node:assert';
import { requireRole } from '../../middleware/requireRole.js';

function makeRes() {
  const res = { statusCode: null, body: null };
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (body) => {
    res.body = body;
    return res;
  };
  return res;
}

test('user with required role calls next()', () => {
  const middleware = requireRole('admin');
  const req = { user: { realm_access: { roles: ['admin', 'user'] } } };
  const res = makeRes();
  let nextCalled = false;

  middleware(req, res, () => {
    nextCalled = true;
  });

  assert.strictEqual(nextCalled, true);
  assert.strictEqual(res.statusCode, null);
});

test('user without required role returns 403', () => {
  const middleware = requireRole('admin');
  const req = { user: { realm_access: { roles: ['participant'] } } };
  const res = makeRes();
  let nextCalled = false;

  middleware(req, res, () => {
    nextCalled = true;
  });

  assert.strictEqual(nextCalled, false);
  assert.strictEqual(res.statusCode, 403);
  assert.deepStrictEqual(res.body, { error: 'Forbidden' });
});

test('user with no roles returns 403', () => {
  const middleware = requireRole('admin');
  const req = { user: {} };
  const res = makeRes();

  middleware(req, res, () => {});

  assert.strictEqual(res.statusCode, 403);
  assert.deepStrictEqual(res.body, { error: 'Forbidden' });
});

test('missing req.user returns 403', () => {
  const middleware = requireRole('admin');
  const req = {};
  const res = makeRes();

  middleware(req, res, () => {});

  assert.strictEqual(res.statusCode, 403);
  assert.deepStrictEqual(res.body, { error: 'Forbidden' });
});

test('multiple roles: any match calls next()', () => {
  const middleware = requireRole('admin', 'researcher');
  const req = { user: { realm_access: { roles: ['researcher'] } } };
  const res = makeRes();
  let nextCalled = false;

  middleware(req, res, () => {
    nextCalled = true;
  });

  assert.strictEqual(nextCalled, true);
});

test('multiple roles: none match returns 403', () => {
  const middleware = requireRole('admin', 'researcher');
  const req = { user: { realm_access: { roles: ['participant'] } } };
  const res = makeRes();

  middleware(req, res, () => {});

  assert.strictEqual(res.statusCode, 403);
  assert.deepStrictEqual(res.body, { error: 'Forbidden' });
});
