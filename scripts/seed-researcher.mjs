#!/usr/bin/env node
// Local-only researcher test account. Credentials stay in the ignored .env.
import { loadEnvFile } from 'node:process';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
loadEnvFile(resolve(root, '.env'));

async function main() {
  const username = process.env.HHH_RESEARCHER_USER;
  const password = process.env.HHH_RESEARCHER_PASSWORD;
  if (!username || !password) {
    console.log(
      'Local researcher provisioning skipped: set HHH_RESEARCHER_USER and HHH_RESEARCHER_PASSWORD in .env.'
    );
    return;
  }
  if (
    [
      process.env.HHH_ADMIN_USER || 'admin',
      process.env.KEYCLOAK_ADMIN || 'admin',
    ].includes(username)
  )
    throw new Error(
      'Test researcher must have a different username from the administrator.'
    );
  const base = new URL(
    process.env.LOCAL_KEYCLOAK_URL || 'http://localhost:8080'
  );
  if (!['localhost', '127.0.0.1', '[::1]'].includes(base.hostname))
    throw new Error('This script only provisions a local Keycloak instance.');
  const tokenResponse = await fetch(
    new URL('/realms/master/protocol/openid-connect/token', base),
    {
      method: 'POST',
      body: new URLSearchParams({
        client_id: 'admin-cli',
        grant_type: 'password',
        username: process.env.KEYCLOAK_ADMIN || 'admin',
        password: process.env.KEYCLOAK_ADMIN_PASSWORD || '',
      }),
      signal: AbortSignal.timeout(15000),
    }
  );
  if (!tokenResponse.ok)
    throw new Error(
      `Local Keycloak administrator login failed (HTTP ${tokenResponse.status}).`
    );
  const { access_token: adminToken } = await tokenResponse.json();
  async function admin(path, method = 'GET', body) {
    const response = await fetch(new URL(`/admin/realms/hhh/${path}`, base), {
      method,
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok)
      throw new Error(
        `Local researcher provisioning failed (HTTP ${response.status}).`
      );
    return response.status === 204 || response.status === 201
      ? null
      : response.json();
  }
  const query = `users?${new URLSearchParams({ username, exact: 'true' })}`;
  let [user] = await admin(query);
  if (user && user.id !== process.env.HHH_RESEARCHER_ID) {
    // Keycloak's managed user profile can omit arbitrary marker attributes.
    // Verify ownership using the configured password before adopting an ID.
    const check = await fetch(
      new URL('/realms/hhh/protocol/openid-connect/token', base),
      {
        method: 'POST',
        body: new URLSearchParams({
          client_id: 'hhh-ropc',
          client_secret: process.env.KEYCLOAK_ROPC_CLIENT_SECRET || '',
          grant_type: 'password',
          username,
          password,
        }),
        signal: AbortSignal.timeout(15000),
      }
    );
    if (!check.ok)
      throw new Error(
        'An unrelated account already uses this username. Choose a different HHH_RESEARCHER_USER.'
      );
    const { access_token: existingToken } = await check.json();
    const claims = JSON.parse(
      Buffer.from(existingToken.split('.')[1], 'base64url').toString()
    );
    if (claims.sub !== user.id)
      throw new Error('Existing account verification failed.');
  }
  if (!user) {
    await admin('users', 'POST', {
      username,
      enabled: true,
      emailVerified: true,
      requiredActions: [],
    });
    [user] = await admin(query);
  }
  if (!user?.id)
    throw new Error('Could not resolve the local test researcher.');
  const effective = await admin(
    `users/${user.id}/role-mappings/realm/composite`
  );
  const forbidden = ['admin', 'identity-manager', 'study-nurse', 'monitor'];
  if (effective.some((role) => forbidden.includes(role.name)))
    throw new Error(
      'The test account has elevated roles; refusing to use it as a researcher.'
    );
  const role = await admin('roles/researcher');
  await admin(`users/${user.id}/role-mappings/realm`, 'POST', [role]);
  await admin(`users/${user.id}/reset-password`, 'PUT', {
    type: 'password',
    value: password,
    temporary: false,
  });
  await admin(`users/${user.id}`, 'PUT', {
    enabled: true,
    requiredActions: [],
  });
  const roles = await admin(`users/${user.id}/role-mappings/realm/composite`);
  if (
    !roles.some((r) => r.name === 'researcher') ||
    roles.some((r) => forbidden.includes(r.name))
  )
    throw new Error('Researcher role verification failed.');
  const envPath = resolve(root, '.env');
  const envText = readFileSync(envPath, 'utf8');
  const idLine = `HHH_RESEARCHER_ID=${user.id}`;
  writeFileSync(
    envPath,
    /^HHH_RESEARCHER_ID=.*$/m.test(envText)
      ? envText.replace(/^HHH_RESEARCHER_ID=.*$/m, idLine)
      : `${envText.trimEnd()}\n${idLine}\n`
  );
  console.log(
    `Local test researcher ready: ${username}. Password: HHH_RESEARCHER_PASSWORD in .env. No admin or identity roles.`
  );
}
main().catch((err) => {
  console.error(err.message);
  process.exitCode = 1;
});
