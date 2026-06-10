import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { parseFrontMatter } from '../../utils/markdown.js';

describe('parseFrontMatter', () => {
  test('parses a front matter block into meta and strips it from the body', () => {
    const raw =
      '---\nversion: 1.0.0\neffectiveDate: 2026-03-15\nbindingLanguage: de\n---\n\n# Heading\n\nBody text.';
    const { meta, body } = parseFrontMatter(raw);
    assert.deepEqual(meta, {
      version: '1.0.0',
      effectiveDate: '2026-03-15',
      bindingLanguage: 'de',
    });
    assert.ok(body.startsWith('\n# Heading'));
    assert.ok(!body.includes('---'));
  });

  test('returns empty meta and untouched body when no front matter exists', () => {
    const raw = '# Heading\n\nNo front matter here.';
    const { meta, body } = parseFrontMatter(raw);
    assert.deepEqual(meta, {});
    assert.equal(body, raw);
  });

  test('handles CRLF line endings', () => {
    const raw = '---\r\nversion: 2.1.0\r\n---\r\n# Heading';
    const { meta, body } = parseFrontMatter(raw);
    assert.equal(meta.version, '2.1.0');
    assert.equal(body, '# Heading');
  });

  test('ignores malformed lines without a colon', () => {
    const raw = '---\nversion: 1.0.0\nnot-a-key-value\n---\nBody';
    const { meta } = parseFrontMatter(raw);
    assert.deepEqual(meta, { version: '1.0.0' });
  });

  test('does not treat a horizontal rule mid-document as front matter', () => {
    const raw = '# Heading\n\n---\n\nMore text';
    const { meta, body } = parseFrontMatter(raw);
    assert.deepEqual(meta, {});
    assert.equal(body, raw);
  });
});
