/**
 * Configuration. Fails fast and loudly — a half-configured identity register
 * is worse than one that refuses to start, because it can accept roster data
 * it cannot later decrypt.
 */

import { readFileSync } from 'node:fs';
import { parseMasterKey, deriveKeys } from './crypto/keys.js';

function required(env, name) {
  const v = env[name];
  if (!v || v.trim() === '') {
    throw new Error(`${name} is required but not set — refusing to start`);
  }
  return v.trim();
}

function intEnv(env, name, fallback) {
  const raw = env[name];
  if (raw == null || raw.trim() === '') return fallback;
  const n = Number.parseInt(raw, 10);
  if (!Number.isInteger(n)) throw new Error(`${name} must be an integer`);
  return n;
}

/**
 * Read the master key from a FILE, not an environment variable.
 *
 * Env vars leak through `docker inspect`, `/proc/<pid>/environ` and crash
 * dumps. A file mounted 0400 does not. `IDENTITY_MASTER_KEY` is accepted only
 * outside production, so tests and local development do not need a file.
 */
function loadMasterKey(env) {
  const file = env.IDENTITY_MASTER_KEY_FILE;
  if (file) return parseMasterKey(readFileSync(file, 'utf8'));

  const inline = env.IDENTITY_MASTER_KEY;
  if (inline) {
    if (env.NODE_ENV === 'production') {
      throw new Error(
        'IDENTITY_MASTER_KEY must not be used in production — mount the key as ' +
          'a file and set IDENTITY_MASTER_KEY_FILE. Environment variables leak ' +
          'via docker inspect, /proc/<pid>/environ and crash dumps.'
      );
    }
    return parseMasterKey(inline);
  }
  throw new Error(
    'No master key configured. Set IDENTITY_MASTER_KEY_FILE to a file ' +
      'containing `openssl rand -base64 32` output.'
  );
}

export function loadConfig(env = process.env) {
  const master = loadMasterKey(env);
  const kekVersion = intEnv(env, 'IDENTITY_KEK_VERSION', 1);
  const biVersion = intEnv(env, 'IDENTITY_BI_VERSION', 1);
  const audience = env.KEYCLOAK_AUDIENCE?.trim() || null;
  if (env.NODE_ENV === 'production' && !audience) {
    throw new Error(
      'KEYCLOAK_AUDIENCE is required in production — refusing to accept ' +
        'tokens minted for an unrelated client'
    );
  }

  return {
    env: env.NODE_ENV ?? 'development',
    databaseUrl: required(env, 'IDENTITY_DB_URL'),
    // Two ports so a Traefik misconfiguration cannot expose the internal API:
    // separation is structural, not a matter of path prefixes.
    publicPort: intEnv(env, 'IDENTITY_PUBLIC_PORT', 3002),
    internalPort: intEnv(env, 'IDENTITY_INTERNAL_PORT', 3003),
    serviceSecret: required(env, 'IDENTITY_SERVICE_SECRET'),
    keycloak: {
      jwksUrl: required(env, 'KEYCLOAK_JWKS_URL'),
      // A list from day one: relocating the register to university hosting
      // may mean tokens from a different issuer, and retrofitting that is
      // harder than allowing for it now.
      issuers: required(env, 'KEYCLOAK_ISSUER')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      audience,
    },
    keys: deriveKeys({ master, kekVersion, biVersion }),
    master,
    // Reservations abandoned between reserve and confirm are swept back to
    // 'issued'. Without this a crash mid-protocol burns a code permanently and
    // the participant cannot enrol.
    reservationTtlMinutes: intEnv(env, 'IDENTITY_RESERVATION_TTL_MINUTES', 10),
    // Every reveal is mailed here. Unset means no alerting, which is a
    // legitimate choice for a pilot but should not survive into a real study.
    dpoAlertEmail: env.IDENTITY_DPO_ALERT_EMAIL?.trim() || null,
    smtp: {
      host: env.SMTP_HOST ?? null,
      port: intEnv(env, 'SMTP_PORT', 587),
      user: env.SMTP_USER ?? null,
      pass: env.SMTP_PASS ?? null,
      from: env.SMTP_FROM ?? null,
      starttls: env.SMTP_STARTTLS !== 'false',
    },
  };
}
