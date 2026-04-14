import { authOptions } from '../lib/auth';
import type { JWT } from 'next-auth/jwt';
import type { Account } from 'next-auth';

// Extract the jwt callback from authOptions for isolated testing
const jwtCallback = authOptions.callbacks!.jwt!;

describe('auth jwt callback', () => {
  const baseToken: JWT = { roles: [], sub: 'user-1' };

  it('extracts roles from profile.realm_access.roles', async () => {
    const profile = { realm_access: { roles: ['admin', 'researcher'] } };
    const account = { access_token: 'tok-abc' } as unknown as Account;
    const result = await jwtCallback({ token: { ...baseToken }, account, profile } as never);
    expect(result.roles).toEqual(['admin', 'researcher']);
  });

  it('sets roles to empty array when realm_access is missing', async () => {
    const profile = {};
    const account = { access_token: 'tok-xyz' } as unknown as Account;
    const result = await jwtCallback({ token: { ...baseToken }, account, profile } as never);
    expect(result.roles).toEqual([]);
  });

  it('forwards accessToken from account.access_token', async () => {
    const profile = { realm_access: { roles: ['admin'] } };
    const account = { access_token: 'my-token-value' } as unknown as Account;
    const result = await jwtCallback({ token: { ...baseToken }, account, profile } as never);
    expect(result.accessToken).toBe('my-token-value');
  });

  it('leaves token unchanged when account is absent (token refresh path)', async () => {
    const token: JWT = { roles: ['admin'], accessToken: 'existing-token', sub: 'user-1' };
    const result = await jwtCallback({ token } as never);
    expect(result.roles).toEqual(['admin']);
    expect(result.accessToken).toBe('existing-token');
  });
});
