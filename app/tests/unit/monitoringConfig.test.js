import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, describe, it } from 'node:test';
import yaml from 'js-yaml';

const repositoryRoot = fileURLToPath(new URL('../../../', import.meta.url));
const temporaryRoot = mkdtempSync(path.join(tmpdir(), 'hhh-monitoring-'));

after(() => rmSync(temporaryRoot, { recursive: true, force: true }));

function renderTraefik(name, extraEnv = {}) {
  const output = path.join(temporaryRoot, `${name}.yml`);
  execFileSync(
    'sh',
    [path.join(repositoryRoot, 'monitoring/render-traefik.sh')],
    {
      env: {
        ...process.env,
        TRAEFIK_TEMPLATE: path.join(
          repositoryRoot,
          'monitoring/traefik/posthog-ingest.yml.tmpl'
        ),
        TRAEFIK_OUTPUT: output,
        ...extraEnv,
      },
      stdio: 'pipe',
    }
  );
  return yaml.load(readFileSync(output, 'utf8'));
}

describe('optional analytics monitoring configuration', () => {
  it('renders no Traefik route while PostHog is unconfigured', () => {
    const rendered = renderTraefik('disabled', {
      POSTHOG_INTERNAL_URL: '',
    });
    assert.deepEqual(rendered, { http: {} });
  });

  it('renders the private origin, strict paths and numeric rate limits', () => {
    const rendered = renderTraefik('enabled', {
      DOMAIN: 'habit.example.edu',
      POSTHOG_INTERNAL_URL: 'http://10.20.30.40:8000',
      POSTHOG_INGEST_RATE_AVERAGE: '75',
      POSTHOG_INGEST_RATE_BURST: '125',
    });
    const router = rendered.http.routers['posthog-ingest'];
    assert.match(router.rule, /Path\(`\/ingest\/flags`\)/);
    assert.doesNotMatch(router.rule, /PathPrefix\(`\/`\)/);
    assert.equal(
      rendered.http.services['posthog-ingest'].loadBalancer.servers[0].url,
      'http://10.20.30.40:8000'
    );
    assert.equal(
      rendered.http.middlewares['posthog-ingest-rate-limit'].rateLimit.average,
      75
    );
  });

  it('rejects origins containing paths or credentials', () => {
    assert.throws(() =>
      renderTraefik('invalid', {
        DOMAIN: 'habit.example.edu',
        POSTHOG_INTERNAL_URL: 'http://user@10.20.30.40:8000/admin',
      })
    );
    assert.throws(() =>
      renderTraefik('invalid-port', {
        DOMAIN: 'habit.example.edu',
        POSTHOG_INTERNAL_URL: 'http://10.20.30.40:70000',
      })
    );
  });

  it('renders parseable empty and configured Prometheus target files', () => {
    const script = path.join(repositoryRoot, 'monitoring/render-targets.sh');
    for (const [name, host] of [
      ['empty', ''],
      ['configured', '10.20.30.40'],
    ]) {
      const targetDir = path.join(temporaryRoot, `targets-${name}`);
      execFileSync('sh', [script], {
        env: {
          ...process.env,
          TARGET_DIR: targetDir,
          ANALYTICS_VM_HOST: host,
          ANALYTICS_VM_POSTHOG_PORT: '8000',
        },
        stdio: 'pipe',
      });
      for (const file of readdirSync(targetDir)) {
        const targets = JSON.parse(
          readFileSync(path.join(targetDir, file), 'utf8')
        );
        assert.ok(Array.isArray(targets));
      }
    }
  });
});
