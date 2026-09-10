import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadConfig } from '../src/config.js';

const MASTER_KEY = Buffer.alloc(32, 11).toString('base64');

describe('identity configuration', () => {
  let directory;
  let keyFile;

  before(() => {
    directory = mkdtempSync(join(tmpdir(), 'hhh-identity-config-'));
    keyFile = join(directory, 'master-key');
    writeFileSync(keyFile, MASTER_KEY, { mode: 0o400 });
  });

  after(() => {
    rmSync(directory, { recursive: true, force: true });
  });

  function productionEnv(overrides = {}) {
    return {
      NODE_ENV: 'production',
      IDENTITY_MASTER_KEY_FILE: keyFile,
      IDENTITY_DB_URL: 'postgres://identity:test@identity-db/identity',
      IDENTITY_SERVICE_SECRET: 'service-secret',
      KEYCLOAK_JWKS_URL: 'https://identity.example/jwks',
      KEYCLOAK_ISSUER: 'https://identity.example/realms/hhh',
      KEYCLOAK_AUDIENCE: 'hhh-admin',
      ...overrides,
    };
  }

  it('uses the provided environment consistently', () => {
    const config = loadConfig(
      productionEnv({
        IDENTITY_PUBLIC_PORT: '4102',
        IDENTITY_INTERNAL_PORT: '4103',
      })
    );
    assert.equal(config.publicPort, 4102);
    assert.equal(config.internalPort, 4103);
    assert.equal(config.keycloak.audience, 'hhh-admin');
  });

  it('refuses production startup without a token audience', () => {
    assert.throws(
      () => loadConfig(productionEnv({ KEYCLOAK_AUDIENCE: '' })),
      /KEYCLOAK_AUDIENCE is required in production/
    );
  });
});
