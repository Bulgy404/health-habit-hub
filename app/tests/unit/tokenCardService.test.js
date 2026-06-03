import { test } from 'node:test';
import assert from 'node:assert';
import { generateTokenCard } from '../../services/tokenCardService.js';

const userId = 'test-user-id-12345';
const username = 'p-test-user-id-12345';
const password = 'SecureTestPass123';

test('generateTokenCard format=both returns a non-empty PDF buffer', async () => {
  const buf = await generateTokenCard(userId, username, password, 'both');
  assert.ok(buf instanceof Buffer, 'should return a Buffer');
  assert.ok(buf.length > 0, 'buffer should not be empty');
  // PDF magic bytes: %PDF
  assert.strictEqual(
    buf.slice(0, 4).toString(),
    '%PDF',
    'should start with PDF magic bytes'
  );
});

test('generateTokenCard format=qr returns a valid PDF buffer', async () => {
  const buf = await generateTokenCard(userId, username, password, 'qr');
  assert.ok(buf instanceof Buffer, 'should return a Buffer');
  assert.ok(buf.length > 0, 'buffer should not be empty');
  assert.strictEqual(
    buf.slice(0, 4).toString(),
    '%PDF',
    'should start with PDF magic bytes'
  );
});

test('generateTokenCard format=print returns a valid PDF buffer', async () => {
  const buf = await generateTokenCard(userId, username, password, 'print');
  assert.ok(buf instanceof Buffer, 'should return a Buffer');
  assert.ok(buf.length > 0, 'buffer should not be empty');
  assert.strictEqual(
    buf.slice(0, 4).toString(),
    '%PDF',
    'should start with PDF magic bytes'
  );
});

test('generateTokenCard format=both produces larger buffer than format=print (QR adds data)', async () => {
  const bufBoth = await generateTokenCard(userId, username, password, 'both');
  const bufPrint = await generateTokenCard(userId, username, password, 'print');
  // 'both' includes a QR image so should be larger
  assert.ok(
    bufBoth.length > bufPrint.length,
    'both format should be larger than print-only'
  );
});

test('generateTokenCard format=both produces larger buffer than format=qr (print adds text)', async () => {
  const bufBoth = await generateTokenCard(userId, username, password, 'both');
  const bufQr = await generateTokenCard(userId, username, password, 'qr');
  // 'both' has more content than qr-only
  assert.ok(
    bufBoth.length >= bufQr.length,
    'both format should be at least as large as qr-only'
  );
});
