import { authOptions } from '../lib/auth';
import type { JWT } from 'next-auth/jwt';
import type { Account } from 'next-auth';

// Extract the jwt callback from authOptions for isolated testing
const jwtCallback = authOptions.callbacks!.jwt!;

/**
 * Build a minimal fake Keycloak access token (header.payload.sig).
 * decodeRoles() in auth.ts reads realm_access.roles from the base64url payload.
 */
function makeToken(payload: object): string {
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `header.${encoded}.sig`;
}

describe('auth jwt callback', () => {
  const baseToken: JWT = { roles: [], sub: 'user-1' };

  it('extracts roles from access_token JWT payload', async () => {
    const account = {
      access_token: makeToken({ realm_access: { roles: ['admin', 'researcher'] } }),
    } as unknown as Account;
    const result = await jwtCallback({ token: { ...baseToken }, account, profile: {} } as never);
    expect(result.roles).toEqual(['admin', 'researcher']);
  });

  it('sets roles to empty array when realm_access is missing', async () => {
    const account = { access_token: makeToken({}) } as unknown as Account;
    const result = await jwtCallback({ token: { ...baseToken }, account, profile: {} } as never);
    expect(result.roles).toEqual([]);
  });

  it('forwards accessToken from account.access_token', async () => {
    const rawToken = makeToken({ realm_access: { roles: ['admin'] } });
    const account = { access_token: rawToken } as unknown as Account;
    const result = await jwtCallback({ token: { ...baseToken }, account, profile: {} } as never);
    expect(result.accessToken).toBe(rawToken);
  });

  it('leaves token unchanged when account is absent (token refresh path)', async () => {
    const token: JWT = { roles: ['admin'], accessToken: 'existing-token', sub: 'user-1' };
    const result = await jwtCallback({ token } as never);
    expect(result.roles).toEqual(['admin']);
    expect(result.accessToken).toBe('existing-token');
  });

  it('extracts user role correctly', async () => {
    const account = {
      access_token: makeToken({ realm_access: { roles: ['user'] } }),
    } as unknown as Account;
    const result = await jwtCallback({ token: { ...baseToken }, account, profile: {} } as never);
    expect(result.roles).toEqual(['user']);
  });
});
