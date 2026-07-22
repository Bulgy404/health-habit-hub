// Unit tests for db/questionnaireQueries.js — the Cypher that keeps the
// questionnaire subgraph connected (Study → Questionnaire → Item, and
// User → Response → Questionnaire/Item).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  syncQuestionnaireDefinition,
  deleteQuestionnaireDefinition,
  createQuestionnaireResponse,
} from '../../db/questionnaireQueries.js';

function recorder() {
  const calls = [];
  return {
    calls,
    run: async (cypher, params) => {
      calls.push({ cypher, params });
      return [];
    },
  };
}

test('syncQuestionnaireDefinition maps questions to QuestionnaireItem params', async () => {
  const { calls, run } = recorder();
  await syncQuestionnaireDefinition(run, {
    slug: 'sliq',
    title: 'SLIQ',
    version: 2,
    questions: [
      { id: 'diet', text: 'Diet?', type: 'rating' },
      { id: 'activity', text: 'Activity?', type: 'rating' },
    ],
  });

  assert.strictEqual(calls.length, 1);
  const { cypher, params } = calls[0];
  assert.ok(cypher.includes('MERGE (q:Questionnaire {slug: $slug})'));
  assert.ok(cypher.includes('HAS_ITEM'));
  assert.strictEqual(params.slug, 'sliq');
  assert.strictEqual(params.title, 'SLIQ');
  assert.strictEqual(params.version, '2');
  assert.strictEqual(params.items.length, 2);
  // uid is the Community-safe composite key
  assert.strictEqual(params.items[0].uid, 'sliq::diet');
  assert.strictEqual(params.items[0].position, 0);
  assert.strictEqual(params.items[1].position, 1);
  assert.deepStrictEqual(params.uids, ['sliq::diet', 'sliq::activity']);
});

test('syncQuestionnaireDefinition serialises localised question text', async () => {
  const { calls, run } = recorder();
  await syncQuestionnaireDefinition(run, {
    slug: 'q1',
    questions: [{ id: 'a', text: { en: 'Hello', de: 'Hallo' }, type: 'text' }],
  });
  assert.strictEqual(
    calls[0].params.items[0].text,
    JSON.stringify({ en: 'Hello', de: 'Hallo' })
  );
});

test('syncQuestionnaireDefinition is a no-op without a slug', async () => {
  const { calls, run } = recorder();
  await syncQuestionnaireDefinition(run, { title: 'no slug' });
  assert.strictEqual(calls.length, 0);
});

test('deleteQuestionnaireDefinition removes questionnaire and its items', async () => {
  const { calls, run } = recorder();
  await deleteQuestionnaireDefinition(run, 'sliq');
  assert.strictEqual(calls.length, 1);
  assert.ok(calls[0].cypher.includes('DETACH DELETE i, q'));
  assert.strictEqual(calls[0].params.slug, 'sliq');
});

test('createQuestionnaireResponse links user, questionnaire and items', async () => {
  const { calls, run } = recorder();
  await createQuestionnaireResponse(run, {
    userId: 'user-abc',
    questionnaireSlug: 'sliq',
    responseId: 'resp-1',
    submittedAt: new Date('2026-01-02T03:04:05Z'),
    answers: { diet: '2', activity: '3' },
  });

  assert.strictEqual(calls.length, 1);
  const { cypher, params } = calls[0];
  // The three edges that were missing before
  assert.ok(cypher.includes('(u)-[:SUBMITTED]->(r)'));
  assert.ok(cypher.includes('(r)-[:FOR_QUESTIONNAIRE]->(q)'));
  assert.ok(cypher.includes('[:HAS_ANSWER'));
  // Correct User property
  assert.ok(cypher.includes('u:User {userID: $userId}'));
  assert.strictEqual(params.responseId, 'resp-1');
  assert.strictEqual(params.submittedAt, '2026-01-02T03:04:05.000Z');
  assert.strictEqual(params.entries.length, 2);
  assert.strictEqual(params.entries[0].uid, 'sliq::diet');
  assert.strictEqual(params.entries[0].value, 2);
});

test('createQuestionnaireResponse keeps rawValue for non-numeric answers', async () => {
  const { calls, run } = recorder();
  await createQuestionnaireResponse(run, {
    userId: 'u',
    questionnaireSlug: 'q',
    responseId: 'r',
    answers: { note: 'felt great', picks: ['a', 'b'] },
  });
  const byId = Object.fromEntries(
    calls[0].params.entries.map((e) => [e.itemId, e])
  );
  // Previously `parseFloat(value) || 0` coerced these to 0 and lost the answer.
  assert.strictEqual(byId.note.value, null);
  assert.strictEqual(byId.note.rawValue, 'felt great');
  assert.strictEqual(byId.picks.value, null);
  assert.strictEqual(byId.picks.rawValue, JSON.stringify(['a', 'b']));
});

test('createQuestionnaireResponse is a no-op when identifiers are missing', async () => {
  const { calls, run } = recorder();
  await createQuestionnaireResponse(run, {
    userId: 'u',
    questionnaireSlug: 'q',
  }); // no responseId
  assert.strictEqual(calls.length, 0);
});
