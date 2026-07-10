/**
 * Create a Keycloak admin client with a cached admin token (55 s TTL).
 * Exposes user management operations against the configured realm.
 * @param {{ base?: string, realm?: string, clientId?: string, clientSecret?: string }} [opts]
 * @returns {{ getAdminToken: Function, createUser: Function, assignRole: Function, removeRole: Function, resetPassword: Function, listUsersByRole: Function, searchUsers: Function, updateUserAttribute: Function, listSessions: Function, revokeSession: Function }}
 * @throws {Error} If the base URL is invalid or uses an unsupported protocol.
 */
export function createKeycloakAdminClient({
  base,
  realm,
  clientId,
  clientSecret,
} = {}) {
  const _base = base || process.env.KEYCLOAK_URL || 'http://keycloak:8080';
  // Validate _base at startup so CodeQL can see the URL has been checked
  // before being used in any fetch() call below. _base comes from server
  // configuration (env var), not user input, but we still enforce scheme.
  const _baseUrl = new URL(_base); // throws if invalid
  if (!['http:', 'https:'].includes(_baseUrl.protocol)) {
    throw new Error(
      `KEYCLOAK_URL must use http or https, got: ${_baseUrl.protocol}`
    );
  }
  const _realm = realm || process.env.KEYCLOAK_REALM || 'hhh';
  const _clientId =
    clientId || process.env.KEYCLOAK_ADMIN_CLIENT_ID || 'hhh-backend';
  const _clientSecret =
    clientSecret || process.env.KEYCLOAK_ADMIN_CLIENT_SECRET || '';
  // The client participants authenticate through — sessions are listed
  // per-client (Keycloak has no single "all sessions in realm" endpoint).
  const _participantClientId = process.env.KEYCLOAK_CLIENT_ID || 'hhh-flutter';

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
      const placeholderEmail = `${username}@local.invalid`;
      const res = await fetch(`${_base}/admin/realms/${_realm}/users`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          id: userId,
          username,
          enabled: true,
          email: placeholderEmail,
          emailVerified: true,
          firstName: 'Participant',
          lastName: userId.slice(0, 8),
          requiredActions: [],
          credentials: [
            { type: 'password', value: password, temporary: false },
          ],
          attributes: { group: [] },
        }),
      });
      if (!res.ok)
        throw new Error(`Keycloak create user failed: ${res.status}`);

      const lookupRes = await fetch(
        `${_base}/admin/realms/${_realm}/users?username=${encodeURIComponent(username)}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!lookupRes.ok)
        throw new Error(`Keycloak user lookup failed: ${lookupRes.status}`);
      const users = await lookupRes.json();
      return users[0]?.id || userId;
    },

    async assignRole(userId, roleName) {
      const token = await getAdminToken();
      const rolesRes = await fetch(
        `${_base}/admin/realms/${_realm}/roles/${roleName}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!rolesRes.ok)
        throw new Error(`Keycloak role lookup failed: ${rolesRes.status}`);
      const role = await rolesRes.json();
      const assignRes = await fetch(
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
      if (!assignRes.ok)
        throw new Error(`Keycloak role assignment failed: ${assignRes.status}`);
    },

    /**
     * Permanently delete a user from the realm (GDPR / account deletion).
     * @param {string} userId Keycloak user id (`sub` claim).
     * @throws {Error} If Keycloak responds with a non-2xx status other than 404.
     */
    async deleteUser(userId) {
      const token = await getAdminToken();
      const res = await fetch(
        `${_base}/admin/realms/${_realm}/users/${encodeURIComponent(userId)}`,
        {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      // 404 = already gone — treat as success (idempotent deletion)
      if (!res.ok && res.status !== 404) {
        throw new Error(`Keycloak deleteUser failed: ${res.status}`);
      }
    },

    /**
     * Resets a user's password to [newPassword] (non-temporary — the user is
     * not forced to change it again). Used for recovery-passphrase rotation:
     * the participant's Keycloak username stays the same, only the password
     * half of the credential pair changes.
     * @param {string} userId Keycloak user id (`sub` claim).
     * @param {string} newPassword
     */
    async resetPassword(userId, newPassword) {
      const token = await getAdminToken();
      const res = await fetch(
        `${_base}/admin/realms/${_realm}/users/${encodeURIComponent(userId)}/reset-password`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            type: 'password',
            value: newPassword,
            temporary: false,
          }),
        }
      );
      if (!res.ok)
        throw new Error(`Keycloak resetPassword failed: ${res.status}`);
    },

    /**
     * Lists users currently holding [roleName] (realm role) — used by the
     * admin Team & Roles page.
     * @param {string} roleName
     * @returns {Promise<Array<{id: string, username: string, email?: string}>>}
     */
    async listUsersByRole(roleName) {
      const token = await getAdminToken();
      const res = await fetch(
        `${_base}/admin/realms/${_realm}/roles/${encodeURIComponent(roleName)}/users`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!res.ok)
        throw new Error(`Keycloak listUsersByRole failed: ${res.status}`);
      return res.json();
    },

    /**
     * Searches realm users by username/email/name — used by the admin Team &
     * Roles page to find an account to grant a role to.
     * @param {string} query
     * @returns {Promise<Array<{id: string, username: string, email?: string}>>}
     */
    async searchUsers(query) {
      const token = await getAdminToken();
      const res = await fetch(
        `${_base}/admin/realms/${_realm}/users?search=${encodeURIComponent(query)}&max=25`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!res.ok) throw new Error(`Keycloak searchUsers failed: ${res.status}`);
      return res.json();
    },

    /**
     * Removes [roleName] (realm role) from [userId] — the inverse of
     * `assignRole`.
     * @param {string} userId
     * @param {string} roleName
     */
    async removeRole(userId, roleName) {
      const token = await getAdminToken();
      const rolesRes = await fetch(
        `${_base}/admin/realms/${_realm}/roles/${encodeURIComponent(roleName)}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!rolesRes.ok)
        throw new Error(`Keycloak role lookup failed: ${rolesRes.status}`);
      const role = await rolesRes.json();
      const res = await fetch(
        `${_base}/admin/realms/${_realm}/users/${encodeURIComponent(userId)}/role-mappings/realm`,
        {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify([role]),
        }
      );
      if (!res.ok) throw new Error(`Keycloak removeRole failed: ${res.status}`);
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

    /**
     * Lists active sessions for the participant-facing client (hhh-flutter).
     * Keycloak has no "all sessions in a realm" endpoint — only per-client
     * (`/clients/{id}/user-sessions`) or per-user — so this resolves that
     * client's internal UUID first, then lists its sessions.
     * @returns {Promise<Array>}
     */
    async listSessions() {
      const token = await getAdminToken();
      const clientRes = await fetch(
        `${_base}/admin/realms/${_realm}/clients?clientId=${encodeURIComponent(_participantClientId)}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!clientRes.ok)
        throw new Error(`Keycloak client lookup failed: ${clientRes.status}`);
      const clients = await clientRes.json();
      const clientUuid = clients[0]?.id;
      if (!clientUuid) return [];

      const res = await fetch(
        `${_base}/admin/realms/${_realm}/clients/${clientUuid}/user-sessions?first=0&max=1000`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!res.ok)
        throw new Error(`Keycloak session list failed: ${res.status}`);
      return res.json();
    },

    async revokeSession(sessionId) {
      // Keycloak session ids aren't always canonical 36-char UUIDs (depends
      // on the session storage provider) — validate the charset only, so no
      // path-traversal/URL-injection characters reach the request path below.
      if (!/^[A-Za-z0-9_-]{1,100}$/.test(String(sessionId))) {
        throw new Error('Invalid sessionId');
      }
      const token = await getAdminToken();
      const safeId = encodeURIComponent(String(sessionId));
      await fetch(`${_base}/admin/realms/${_realm}/sessions/${safeId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
    },
  };
}
