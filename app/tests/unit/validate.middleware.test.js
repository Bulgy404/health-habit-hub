import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import { validate } from '../../middleware/validate.js';

function makeReqRes(body) {
  const req = { body };
  const res = {
    _status: 200,
    _json: null,
    status(code) { this._status = code; return this; },
    json(data) { this._json = data; return this; },
  };
  return { req, res };
}

describe('validate middleware', () => {
  const schema = z.object({
    name: z.string().min(1),
    count: z.number().int().min(1),
  });

  it('calls next() when body is valid', () => {
    const { req, res } = makeReqRes({ name: 'hello', count: 3 });
    const next = mock.fn();
    validate(schema)(req, res, next);
    assert.equal(next.mock.calls.length, 1);
  });

  it('replaces req.body with parsed (trimmed) data', () => {
    const schemaWithTrim = z.object({ name: z.string().trim() });
    const { req, res } = makeReqRes({ name: '  hello  ' });
    const next = mock.fn();
    validate(schemaWithTrim)(req, res, next);
    assert.equal(req.body.name, 'hello');
  });

  it('returns 400 when required field is missing', () => {
    const { req, res } = makeReqRes({ count: 5 });
    const next = mock.fn();
    validate(schema)(req, res, next);
    assert.equal(next.mock.calls.length, 0);
    assert.equal(res._status, 400);
    assert.equal(res._json.error, 'Validation failed');
    assert.ok(Array.isArray(res._json.details));
  });

  it('returns field path in details for nested error', () => {
    const nested = z.object({ a: z.object({ b: z.number() }) });
    const { req, res } = makeReqRes({ a: { b: 'notanumber' } });
    const next = mock.fn();
    validate(nested)(req, res, next);
    assert.equal(res._status, 400);
    const paths = res._json.details.map((d) => d.path);
    assert.ok(paths.includes('a.b'));
  });

  it('strips unknown fields when schema uses .strict()', () => {
    const strict = z.object({ name: z.string() }).strict();
    const { req, res } = makeReqRes({ name: 'ok', extra: 'bad' });
    const next = mock.fn();
    validate(strict)(req, res, next);
    assert.equal(res._status, 400);
    assert.equal(next.mock.calls.length, 0);
  });

  it('returns 400 when count violates min constraint', () => {
    const { req, res } = makeReqRes({ name: 'ok', count: 0 });
    const next = mock.fn();
    validate(schema)(req, res, next);
    assert.equal(res._status, 400);
    const detail = res._json.details[0];
    assert.equal(detail.path, 'count');
  });
});
