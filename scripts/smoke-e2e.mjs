#!/usr/bin/env node
/**
 * End-to-end smoke test against a REAL running stack (no mocks).
 *
 * Walks the core participant journey across app + Keycloak + MongoDB (+ Neo4j
 * for habit config), i.e. everything that does not require LLM credentials:
 *
 *   health → legal docs → onboard (account) → consent → enroll (skip)
 *   → habit-config → create intention → log today → reminder plans
 *   → data export → account deletion (incl. verification of erasure)
 *
 * Usage:
 *   BASE_URL=http://localhost:3000 node scripts/smoke-e2e.mjs
 *
 * Exit code 0 = all steps passed. Designed for the nightly CI job
 * (.github/workflows/nightly-e2e.yml) but equally useful against staging.
 */

const BASE = (process.env.BASE_URL || 'http://localhost:3000').replace(
  /\/$/,
  ''
);
const API = `${BASE}/api/v1`;

let passed = 0;
let failed = 0;

function ok(name, condition, detail = '') {
  if (condition) {
    passed += 1;
    console.log(`  ✓ ${name}`);
  } else {
    failed += 1;
    console.error(`  ✗ ${name} ${detail}`);
  }
}

async function step(name, fn) {
  console.log(`\n── ${name}`);
  try {
    await fn();
  } catch (err) {
    failed += 1;
    console.error(`  ✗ ${name} threw: ${err.message}`);
  }
}

async function jsonFetch(url, { token, method = 'GET', body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(url, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    /* non-JSON response */
  }
  return { status: res.status, data };
}

let accessToken = null;
let intentionId = null;

await step('1. Health & legal documents', async () => {
  const health = await jsonFetch(`${API}/health`);
  ok('GET /health responds', health.status === 200, `(${health.status})`);

  for (const doc of ['consent', 'privacy', 'imprint']) {
    const res = await jsonFetch(`${BASE}/en/${doc}`);
    ok(
      `GET /en/${doc} serves document`,
      res.status === 200 && Boolean(res.data?.content),
      `(${res.status})`
    );
    if (doc === 'consent') {
      ok(
        'consent document carries a version',
        /^\d+\.\d+\.\d+$/.test(res.data?.document?.version ?? ''),
        `(${res.data?.document?.version})`
      );
    }
  }
});

await step('2. Onboard — anonymous account via Keycloak', async () => {
  const res = await jsonFetch(`${API}/onboard`, { method: 'POST', body: {} });
  ok('POST /onboard creates account', res.status === 200 || res.status === 201, `(${res.status})`);
  accessToken = res.data?.access_token ?? null;
  ok('access_token issued', Boolean(accessToken));
});

await step('3. Record informed consent', async () => {
  const res = await jsonFetch(`${API}/users/me/consent`, {
    token: accessToken,
    method: 'POST',
    body: { consentVersion: '1.0.0', locale: 'en' },
  });
  ok('POST /users/me/consent records', res.status === 201, `(${res.status})`);

  const read = await jsonFetch(`${API}/users/me/consent`, {
    token: accessToken,
  });
  ok(
    'GET /users/me/consent returns latest',
    read.status === 200 && read.data?.consentVersion === '1.0.0',
    `(${read.status})`
  );
});

await step('4. Enroll (skip code) & habit config', async () => {
  const enroll = await jsonFetch(`${API}/enroll/skip-code`, {
    token: accessToken,
    method: 'POST',
    body: {},
  });
  ok(
    'POST /enroll/skip-code enrolls into default study',
    enroll.status === 200 || enroll.status === 201,
    `(${enroll.status})`
  );

  const config = await jsonFetch(`${API}/me/habit-config`, {
    token: accessToken,
  });
  ok('GET /me/habit-config resolves', config.status === 200, `(${config.status})`);
  ok(
    'habit config includes 12 SRHI items',
    config.data?.srhiItems?.length === 12,
    `(${config.data?.srhiItems?.length})`
  );
});

await step('5. Create intention, log today, reminder plan', async () => {
  const create = await jsonFetch(`${API}/habits/intentions`, {
    token: accessToken,
    method: 'POST',
    body: {
      behaviorKey: 'walking',
      behaviorLabel: 'Walking',
      durationMinutes: 20,
      cues: [{ text: 'After dinner each evening', source: 'self_selected' }],
      intentionStatement:
        'After dinner each evening, I will walk for 20 minutes.',
      reminderTime: '19:30',
    },
  });
  ok('POST /habits/intentions creates', create.status === 201, `(${create.status})`);
  intentionId = create.data?.id ?? null;
  ok('intention id returned', Boolean(intentionId));

  const today = new Date().toISOString().slice(0, 10);
  const logRes = await jsonFetch(`${API}/habits/intentions/${intentionId}/logs`, {
    token: accessToken,
    method: 'POST',
    body: { date: today, enacted: true },
  });
  ok(
    'POST daily log (idempotent upsert)',
    logRes.status === 200 || logRes.status === 201,
    `(${logRes.status})`
  );

  const plans = await jsonFetch(`${API}/habits/intentions/reminder-plans`, {
    token: accessToken,
  });
  const plan = plans.data?.plans?.find((p) => p.intentionId === intentionId);
  ok('GET reminder-plans returns plan', plans.status === 200 && Boolean(plan));
  ok(
    'new habit starts with daily reminders at the chosen time',
    plan?.frequency === 'daily' && plan?.reminderTime === '19:30',
    `(${plan?.frequency} @ ${plan?.reminderTime})`
  );
});

await step('6. Data export (GDPR Art. 20)', async () => {
  const res = await jsonFetch(`${API}/users/me/export`, {
    token: accessToken,
  });
  ok('GET /users/me/export responds', res.status === 200, `(${res.status})`);
  ok(
    'export contains the created intention',
    res.data?.data?.implementation_intentions?.some(
      (i) => i.behaviorKey === 'walking'
    )
  );
  ok(
    'export contains the consent record',
    res.data?.data?.consents?.some((c) => c.consentVersion === '1.0.0')
  );
});

await step('7. Account deletion & erasure verification', async () => {
  const del = await jsonFetch(`${API}/users/me`, {
    token: accessToken,
    method: 'DELETE',
  });
  ok('DELETE /users/me succeeds', del.status === 200, `(${del.status})`);
  ok(
    'deletion removed the intention',
    (del.data?.deleted?.implementation_intentions ?? 0) >= 1
  );

  // Token should now be rejected (Keycloak user gone → introspection fails on
  // refresh; the still-valid JWT may pass sig check, so verify data is gone).
  const exportAfter = await jsonFetch(`${API}/users/me/export`, {
    token: accessToken,
  });
  const remaining = exportAfter.data?.data
    ? Object.values(exportAfter.data.data).flat().length
    : 0;
  ok(
    'no participant data remains after deletion',
    exportAfter.status !== 200 || remaining === 0,
    `(${remaining} docs left)`
  );
});

console.log(`\n${'─'.repeat(50)}`);
console.log(`Smoke test: ${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
