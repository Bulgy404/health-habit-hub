/**
 * Keycloak admin client factory.
 * Fetches an admin token via client_credentials grant and exposes
 * user management operations. The token is cached with a 55-second TTL
 * so each KC operation does not make two HTTP calls.
 *
 * Usage:
 *   const kc = createKeycloakAdminClient();
 *   const token = await kc.getAdminToken();
 *   await kc.createUser({ userId, username, password });
 */
export function createKeycloakAdminClient({
  base,
  realm,
  clientId,
  clientSecret,
} = {}) {
  const _base = base || process.env.KEYCLOAK_URL || 'http://keycloak:8080';
  const _realm = realm || process.env.KEYCLOAK_REALM || 'hhh';
  const _clientId =
    clientId || process.env.KEYCLOAK_ADMIN_CLIENT_ID || 'hhh-backend';
  const _clientSecret =
    clientSecret || process.env.KEYCLOAK_ADMIN_CLIENT_SECRET || '';

  // Token cache: invalidate 5 seconds before Keycloak's default 60-second TTL
  let _cachedToken = null;
  let _tokenExpiresAt = 0;
  const TOKEN_TTL_MS = 55_000;

  async function getAdminToken() {
    if (_cachedToken && Date.now() < _tokenExpiresAt) return _cachedToken;
    const res = await fetch(
      `${_base}/realms/${_realm}/protocol/openid-connect/token`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'client_credentials',
          client_id: _clientId,
          client_secret: _clientSecret,
        }),
      }
    );
    if (!res.ok)
      throw new Error(`Keycloak admin token fetch failed: ${res.status}`);
    const data = await res.json();
    _cachedToken = data.access_token;
    _tokenExpiresAt = Date.now() + TOKEN_TTL_MS;
    return _cachedToken;
  }

  return {
    getAdminToken,

    async createUser({ userId, username, password }) {
      const token = await getAdminToken();
      await fetch(`${_base}/admin/realms/${_realm}/users`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          id: userId,
          username,
          enabled: true,
          credentials: [
            { type: 'password', value: password, temporary: false },
          ],
          attributes: { group: [] },
        }),
      });
    },

    async assignRole(userId, roleName) {
      const token = await getAdminToken();
      const rolesRes = await fetch(
        `${_base}/admin/realms/${_realm}/roles/${roleName}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const role = await rolesRes.json();
      await fetch(
        `${_base}/admin/realms/${_realm}/users/${userId}/role-mappings/realm`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify([role]),
        }
      );
    },

    async updateUserAttribute(userId, key, value) {
      const token = await getAdminToken();
      await fetch(`${_base}/admin/realms/${_realm}/users/${userId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ attributes: { [key]: [value] } }),
      });
    },

    async listSessions() {
      const token = await getAdminToken();
      const res = await fetch(`${_base}/admin/realms/${_realm}/sessions`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      return res.json();
    },

    async revokeSession(sessionId) {
      const token = await getAdminToken();
      await fetch(`${_base}/admin/realms/${_realm}/sessions/${sessionId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
    },
  };
}
