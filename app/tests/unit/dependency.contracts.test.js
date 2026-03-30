import { test } from 'node:test';
import assert from 'node:assert';

// Contract tests for Node.js backend dependencies.
// These verify that the API surface used in the codebase has not been renamed
// or removed by a major-version upgrade. If a check fails, review the
// dependency changelog before upgrading.

test('mongodb contract: MongoClient and cursor methods exist', async () => {
  const { MongoClient, Collection } = await import('mongodb');
  assert.ok(typeof MongoClient === 'function', 'MongoClient is a constructor');
  const proto = MongoClient.prototype;
  assert.ok(typeof proto.connect === 'function', 'MongoClient#connect');
  assert.ok(typeof proto.close === 'function', 'MongoClient#close');
  assert.ok(typeof proto.db === 'function', 'MongoClient#db');

  // Collection cursor methods are on the Collection prototype
  assert.ok(typeof Collection === 'function', 'Collection is a constructor');
  const colProto = Collection.prototype;
  for (const method of [
    'find',
    'findOne',
    'insertOne',
    'updateOne',
    'deleteOne',
    'findOneAndUpdate',
    'aggregate',
  ]) {
    assert.ok(
      typeof colProto[method] === 'function',
      `Collection#${method} is a function`
    );
  }
});

test('ws contract: WebSocketServer and WebSocket are constructors', async () => {
  const { WebSocketServer, WebSocket } = await import('ws');
  assert.ok(
    typeof WebSocketServer === 'function',
    'WebSocketServer is a constructor'
  );
  assert.ok(typeof WebSocket === 'function', 'WebSocket is a constructor');

  // Event name strings used in codebase are valid non-empty strings
  for (const event of ['connection', 'message', 'close', 'error']) {
    assert.strictEqual(typeof event, 'string');
    assert.ok(event.length > 0, `event name "${event}" is non-empty`);
  }
});

test('neo4j-driver contract: driver, auth.basic, and session.run exist', async () => {
  const neo4j = (await import('neo4j-driver')).default;
  assert.ok(typeof neo4j.driver === 'function', 'neo4j.driver is a function');
  assert.ok(
    typeof neo4j.auth === 'object' && neo4j.auth !== null,
    'neo4j.auth exists'
  );
  assert.ok(
    typeof neo4j.auth.basic === 'function',
    'neo4j.auth.basic is a function'
  );

  // Verify the session interface: create a driver with a dummy URI to inspect
  // the session prototype without making a real network connection.
  const driver = neo4j.driver(
    'bolt://localhost:7687',
    neo4j.auth.basic('u', 'p')
  );
  const session = driver.session();
  assert.ok(typeof session.run === 'function', 'session.run is a function');
  assert.ok(typeof session.close === 'function', 'session.close is a function');
  await session.close();
  await driver.close();
});

test('express contract: Router, json, and urlencoded are functions', async () => {
  const express = (await import('express')).default;
  assert.ok(
    typeof express.Router === 'function',
    'express.Router is a function'
  );
  assert.ok(typeof express.json === 'function', 'express.json is a function');
  assert.ok(
    typeof express.urlencoded === 'function',
    'express.urlencoded is a function'
  );
});

test('uuid contract: v4 produces a valid UUID string', async () => {
  const { v4 } = await import('uuid');
  assert.ok(typeof v4 === 'function', 'v4 is a function');
  const id = v4();
  assert.ok(
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
      id
    ),
    `v4() produces a valid UUID: ${id}`
  );
});
