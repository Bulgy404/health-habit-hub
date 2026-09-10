import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * Structural controls, asserted against docker-compose.yml itself.
 *
 * These are the cheapest security properties in the identity design — they
 * cost nothing at runtime and are enforced by the network topology rather than
 * by application code. They are also the easiest to undo by accident: adding
 * `hhh-proxy` to one service's list would silently give the identity register
 * a route to the research databases.
 *
 * Parsed with a deliberately small YAML reader rather than a dependency, so
 * this test cannot itself be the reason CI needs another package.
 */
function parseComposeNetworks(text) {
  const services = {};
  let service = null;
  let inNetworks = false;
  for (const raw of text.split('\n')) {
    const line = raw.replace(/\t/g, '  ');
    if (/^ {2}[a-z0-9][a-z0-9._-]*:\s*$/.test(line)) {
      service = line.trim().replace(':', '');
      services[service] = [];
      inNetworks = false;
      continue;
    }
    if (/^(networks|volumes):\s*$/.test(line)) {
      service = null;
      inNetworks = false;
      continue;
    }
    if (!service) continue;
    if (/^ {4}networks:\s*$/.test(line)) {
      inNetworks = true;
      continue;
    }
    if (inNetworks) {
      const m = line.match(/^ {6}- ([a-z0-9._-]+)\s*$/);
      if (m) services[service].push(m[1]);
      else if (/^ {4}[a-z]/.test(line)) inNetworks = false;
    }
  }
  return services;
}

const compose = readFileSync(
  fileURLToPath(new URL('../../../docker-compose.yml', import.meta.url)),
  'utf8'
);
const prometheus = readFileSync(
  fileURLToPath(new URL('../../../monitoring/prometheus.yml', import.meta.url)),
  'utf8'
);
const nets = parseComposeNetworks(compose);

describe('identity register network isolation', () => {
  it('identity-service shares NO network with mongo', () => {
    const shared = nets['identity-service'].filter((n) =>
      nets.mongo.includes(n)
    );
    assert.deepEqual(
      shared,
      [],
      `identity-service must not be able to reach mongo (shared: ${shared.join(', ')})`
    );
  });

  it('identity-service shares NO network with neo4j', () => {
    const shared = nets['identity-service'].filter((n) =>
      nets.neo4j.includes(n)
    );
    assert.deepEqual(shared, [], `shared with neo4j: ${shared.join(', ')}`);
  });

  it('identity-service is not on the flat hhh-proxy network', () => {
    // hhh-proxy carries every service in the stack, so joining it would undo
    // the isolation above in one line.
    assert.ok(!nets['identity-service'].includes('hhh-proxy'));
  });

  it('identity-db is reachable only on the private network', () => {
    assert.deepEqual(nets['identity-db'], ['hhh-identity-net']);
  });

  it('the backup service can reach identity-db without exposing it', () => {
    assert.ok(nets.backup.includes('hhh-identity-net'));
    assert.ok(!nets['identity-db'].includes('hhh-proxy'));

    const backupFrom = compose.indexOf('\n  backup:');
    const backupTo = compose.indexOf('\n  docker-socket-proxy:', backupFrom);
    const backupBlock = compose.slice(backupFrom, backupTo);
    assert.ok(backupBlock.includes('BACKUP_INCLUDE_IDENTITY='));
    assert.ok(backupBlock.includes('IDENTITY_DB_PASSWORD='));

    const keycloakFrom = compose.indexOf('\n  keycloak:');
    const keycloakTo = compose.indexOf('\n  keycloak-init:', keycloakFrom);
    const keycloakBlock = compose.slice(keycloakFrom, keycloakTo);
    assert.ok(!keycloakBlock.includes('BACKUP_INCLUDE_IDENTITY='));
  });

  it('uses a profile-aware probe with a route to identity-service', () => {
    assert.deepEqual(nets['identity-blackbox-exporter'].sort(), [
      'hhh-identity-edge',
      'hhh-proxy',
    ]);
    const shared = nets['identity-blackbox-exporter'].filter((network) =>
      nets['identity-service'].includes(network)
    );
    assert.deepEqual(shared, ['hhh-identity-edge']);

    const from = compose.indexOf('\n  identity-blackbox-exporter:');
    const to = compose.indexOf('\n  prometheus:', from);
    assert.ok(compose.slice(from, to).includes("profiles: ['identity']"));

    const normalJobStart = prometheus.indexOf('job_name: blackbox-http');
    const identityJobStart = prometheus.indexOf(
      'job_name: identity-blackbox-http'
    );
    const normalJob = prometheus.slice(normalJobStart, identityJobStart);
    const identityJob = prometheus.slice(
      identityJobStart,
      prometheus.indexOf('job_name: blackbox-tcp', identityJobStart)
    );
    assert.ok(!normalJob.includes('identity-service:3002'));
    assert.ok(identityJob.includes('identity-service:3002'));
    assert.ok(identityJob.includes('identity-blackbox-exporter:9115'));
  });

  it('the HHH backend can still reach the register', () => {
    // Isolation must not break enrolment.
    const shared = nets.app.filter((n) => nets['identity-service'].includes(n));
    assert.ok(
      shared.length > 0,
      'app must share a network with identity-service'
    );
  });

  it('pins the Traefik network, since it is not on the global default', () => {
    // Traefik runs with --providers.docker.network=hhh-proxy. This service is
    // deliberately NOT on that network, so without an explicit override
    // Traefik would look for an IP it cannot find and /identity would return
    // a 502 with nothing obviously wrong in the config.
    const from = compose.indexOf('\n  identity-service:');
    const to = compose.indexOf('\nnetworks:', from);
    const block = compose.slice(from, to);
    assert.ok(
      block.includes('traefik.docker.network=hhh-identity-edge'),
      'identity-service must pin the network Traefik routes over'
    );
  });

  it('the internal API is not exposed through Traefik', () => {
    // Only :3002 (admin portal) may be routed; :3003 must stay internal.
    const from = compose.indexOf('\n  identity-service:');
    const to = compose.indexOf('\nnetworks:', from);
    const block = compose.slice(from, to);
    assert.ok(
      block.includes('loadbalancer.server.port=3002'),
      'the admin-facing port must be routed'
    );
    assert.ok(
      !block.includes('server.port=3003'),
      'the internal API must have no Traefik route'
    );
    assert.ok(
      !/traefik[^\n]*3003/.test(block),
      'no Traefik label may reference the internal port'
    );
  });
});
