import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ProductAnalytics } from '../../services/productAnalyticsService.js';

class FakeClient {
  captured = [];
  shutdownCount = 0;

  capture(event) {
    this.captured.push(event);
  }

  async shutdown() {
    this.shutdownCount += 1;
  }
}

describe('ProductAnalytics', () => {
  it('adds controlled common context to an allowlisted event', () => {
    const client = new FakeClient();
    const analytics = new ProductAnalytics(client);

    assert.equal(
      analytics.capture({
        distinctId: 'participant-1',
        event: 'recommendation_generated',
        studyId: 'study-1',
        groupId: 'group-1',
        properties: { latency_ms: 125, count: 3, cache_hit: false },
      }),
      true
    );
    assert.equal(client.captured.length, 1);
    assert.deepEqual(client.captured[0].groups, { study: 'study-1' });
    assert.deepEqual(client.captured[0].properties, {
      study_id: 'study-1',
      group_id: 'group-1',
      app_version: '1.0.0',
      platform: 'server',
      locale: 'unknown',
      schema_version: 1,
      latency_ms: 125,
      count: 3,
      cache_hit: false,
    });
  });

  it('rejects unknown events, free-form keys and invalid property types', () => {
    const client = new FakeClient();
    const analytics = new ProductAnalytics(client);

    assert.equal(
      analytics.capture({ distinctId: 'p', event: 'unknown', properties: {} }),
      false
    );
    assert.equal(
      analytics.capture({
        distinctId: 'p',
        event: 'recommendation_failed',
        properties: {
          latency_ms: 20,
          reason: 'timeout',
          goal: 'private text',
        },
      }),
      false
    );
    assert.equal(client.captured.length, 0);
  });

  it('does not leak an invalid study id through PostHog group metadata', () => {
    const client = new FakeClient();
    const analytics = new ProductAnalytics(client);

    assert.equal(
      analytics.capture({
        distinctId: 'participant-1',
        event: 'app_opened',
        studyId: 'study id with spaces',
      }),
      true
    );
    assert.equal(client.captured[0].groups, undefined);
    assert.equal(client.captured[0].properties.study_id, 'not_assigned');
  });

  it('is a no-op when no client is configured', () => {
    const analytics = new ProductAnalytics();
    assert.equal(
      analytics.capture({ distinctId: 'p', event: 'app_opened' }),
      false
    );
  });
});
