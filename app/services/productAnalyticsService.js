import { readFileSync } from 'node:fs';
import { PostHog } from 'posthog-node';
import { logger } from '../utils/logger.js';

const log = logger.child({ module: 'productAnalytics' });
const registry = JSON.parse(
  readFileSync(
    new URL('../analytics/event-registry.json', import.meta.url),
    'utf8'
  )
);
const NOT_ASSIGNED = 'not_assigned';
const packageVersion = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8')
).version;
const APP_VERSION = process.env.APP_VERSION || packageVersion || '1.0.0';

function isOpaqueId(value) {
  return (
    value === NOT_ASSIGNED ||
    (typeof value === 'string' &&
      /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value))
  );
}

function valueIsAllowed(value, rule) {
  switch (rule.type) {
    case 'boolean':
      return typeof value === 'boolean';
    case 'integer':
      return Number.isSafeInteger(value) && value >= 0;
    case 'enum':
      return typeof value === 'string' && rule.values.includes(value);
    case 'opaque_id':
      return isOpaqueId(value);
    case 'version':
      return (
        typeof value === 'string' &&
        /^\d+\.\d+\.\d+(?:\+[A-Za-z0-9.-]+)?$/.test(value)
      );
    default:
      return false;
  }
}

function validateExactProperties(properties, rules) {
  const entries = Object.entries(properties);
  return (
    entries.length === Object.keys(rules).length &&
    entries.every(
      ([key, value]) => rules[key] && valueIsAllowed(value, rules[key])
    )
  );
}

function configuredClient() {
  const apiKey = process.env.POSTHOG_PROJECT_KEY?.trim();
  const host = process.env.POSTHOG_SERVER_HOST?.trim();
  if (!apiKey || !host) return null;
  return new PostHog(apiKey, {
    host,
    flushAt: 20,
    flushInterval: 5000,
    privacyMode: true,
    enableExceptionAutocapture: false,
  });
}

/**
 * Allowlist-enforced server analytics. Configuration is fail-closed: without
 * both the project key and a private PostHog URL, captures are no-ops.
 */
export class ProductAnalytics {
  constructor(client = null) {
    this.client = client;
  }

  get enabled() {
    return this.client !== null;
  }

  capture({ distinctId, event, properties = {}, studyId, groupId }) {
    const eventDefinition = registry.events[event];
    if (!this.client || !isOpaqueId(distinctId) || !eventDefinition) {
      return false;
    }
    if (!validateExactProperties(properties, eventDefinition.properties)) {
      return false;
    }

    const normalizedStudyId = isOpaqueId(studyId) ? studyId : NOT_ASSIGNED;
    const normalizedGroupId = isOpaqueId(groupId) ? groupId : NOT_ASSIGNED;
    const context = {
      study_id: normalizedStudyId,
      group_id: normalizedGroupId,
      app_version: APP_VERSION,
      platform: 'server',
      locale: 'unknown',
      schema_version: registry.version,
    };
    const enriched = { ...context, ...properties };
    if (
      !validateExactProperties(enriched, {
        ...registry.commonProperties,
        ...eventDefinition.properties,
      })
    ) {
      return false;
    }

    try {
      this.client.capture({
        distinctId,
        event,
        properties: enriched,
        groups:
          normalizedStudyId === NOT_ASSIGNED
            ? undefined
            : { study: normalizedStudyId },
        disableGeoip: true,
        sendFeatureFlags: false,
      });
      return true;
    } catch (err) {
      log.warn({ err }, 'PostHog capture failed');
      return false;
    }
  }

  async shutdown() {
    if (!this.client) return;
    try {
      await this.client.shutdown(5000);
    } catch (err) {
      log.warn({ err }, 'PostHog shutdown flush failed');
    }
  }
}

export const productAnalytics = new ProductAnalytics(configuredClient());
