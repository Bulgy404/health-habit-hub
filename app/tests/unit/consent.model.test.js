import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { COLLECTION, VALIDATOR, ensureIndexes } from '../../models/consent.js';

describe('consent model', () => {
  test('exposes the consents collection name', () => {
    assert.equal(COLLECTION, 'consents');
  });

  test('validator requires userId, consentVersion and consentedAt', () => {
    assert.deepEqual(VALIDATOR.$jsonSchema.required, [
      'userId',
      'consentVersion',
      'consentedAt',
    ]);
  });

  test('validator constrains consentVersion to semver and locale to known codes', () => {
    const props = VALIDATOR.$jsonSchema.properties;
    assert.equal(props.consentVersion.pattern, '^\\d+\\.\\d+\\.\\d+$');
    assert.ok(new RegExp(props.consentVersion.pattern).test('1.0.0'));
    assert.ok(!new RegExp(props.consentVersion.pattern).test('1.0'));
    assert.deepEqual(props.locale.enum, ['en', 'de', 'ja', 'fr', 'nl', null]);
  });

  test('ensureIndexes creates the userId/consentedAt compound index', async () => {
    const created = [];
    const db = {
      collection: (name) => ({
        createIndex: async (spec, opts) => {
          created.push({ name, spec, opts });
        },
      }),
    };
    await ensureIndexes(db);
    assert.equal(created.length, 2);
    assert.equal(created[0].name, 'consents');
    assert.deepEqual(created[0].spec, { userId: 1, consentedAt: -1 });
    assert.equal(created[0].opts.name, 'consents_userId_consentedAt');
  });

  test('ensureIndexes also indexes by documentSlug for per-document lookups', async () => {
    // The two-field index is kept as well: per-user erasure and the legacy
    // "latest consent overall" read still use it.
    const created = [];
    const db = {
      collection: () => ({
        createIndex: async (spec, opts) => created.push({ spec, opts }),
      }),
    };
    await ensureIndexes(db);
    const bySlug = created.find(
      (c) => c.opts.name === 'consents_userId_documentSlug_consentedAt'
    );
    assert.ok(bySlug, 'documentSlug index must be created');
    assert.deepEqual(bySlug.spec, {
      userId: 1,
      documentSlug: 1,
      consentedAt: -1,
    });
  });
});
