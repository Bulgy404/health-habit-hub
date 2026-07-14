/**
 * Mints a token pair for a known (username, password) pair via Keycloak's
 * OAuth password grant, authenticating as the confidential hhh-ropc client
 * rather than the public hhh-flutter client.
 *
 * This is used only server-side (onboarding, credential rotation, and
 * passphrase-based account restore) — the mobile app itself never performs
 * this grant directly, which is why hhh-flutter has directAccessGrantsEnabled
 * disabled. Keeping the grant behind a confidential client means the ROPC
 * capability requires a secret only the backend holds, instead of being
 * available to anyone who extracts the public client_id from the app.
 *
 * @param {{ username: string, password: string, base?: string, realm?: string, clientId?: string, clientSecret?: string }} params
 * @returns {Promise<{ok: true, data: {access_token: string, refresh_token: string, expires_in: number}} | {ok: false, status: number}>}
 */
export async function mintTokenForUser({
  username,
  password,
  base,
  realm,
  clientId,
  clientSecret,
}) {
  const _base = base || process.env.KEYCLOAK_URL || 'http://keycloak:8080';
  const _realm = realm || process.env.KEYCLOAK_REALM || 'hhh';
  const _clientId =
    clientId || process.env.KEYCLOAK_ROPC_CLIENT_ID || 'hhh-ropc';
  const _clientSecret =
    clientSecret || process.env.KEYCLOAK_ROPC_CLIENT_SECRET || '';
  if (!_clientSecret && process.env.NODE_ENV === 'production') {
    throw new Error(
      'KEYCLOAK_ROPC_CLIENT_SECRET must be set in production — refusing to mint tokens with an empty ROPC client secret.'
    );
  }

  const tokenRes = await fetch(
    `${_base}/realms/${_realm}/protocol/openid-connect/token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'password',
        client_id: _clientId,
        client_secret: _clientSecret,
        username,
        password,
        // offline_access issues a refresh token bound to Keycloak's offline
        // session (30-day idle default, no max lifespan unless explicitly
        // capped) instead of the regular SSO session (30-minute idle
        // default) — this app is checked a few times a day, not
        // continuously, so the regular default was logging participants out
        // after every ordinary gap between opens.
        scope: 'openid profile email offline_access',
      }),
    }
  );

  if (!tokenRes.ok) {
    return { ok: false, status: tokenRes.status };
  }

  const data = await tokenRes.json();
  return { ok: true, data };
}
