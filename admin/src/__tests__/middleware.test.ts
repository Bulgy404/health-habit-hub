/**
 * @jest-environment node
 */
import { middleware } from '../middleware';
import { NextRequest } from 'next/server';

// Mock next-auth/jwt
jest.mock('next-auth/jwt', () => ({
  getToken: jest.fn(),
}));

import { getToken } from 'next-auth/jwt';

const mockedGetToken = getToken as jest.MockedFunction<typeof getToken>;

function makeRequest(path = '/dashboard') {
  return new NextRequest(`http://localhost:3001${path}`);
}

describe('middleware', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('redirects unauthenticated requests to sign-in', async () => {
    mockedGetToken.mockResolvedValueOnce(null);
    const req = makeRequest('/dashboard');
    const res = await middleware(req);
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toContain('/api/auth/signin');
  });

  it('passes through when user has admin role', async () => {
    mockedGetToken.mockResolvedValueOnce({ roles: ['admin'] } as never);
    const req = makeRequest('/dashboard');
    const res = await middleware(req);
    // NextResponse.next() returns 200
    expect(res.status).toBe(200);
  });

  it('passes through when user has researcher role', async () => {
    mockedGetToken.mockResolvedValueOnce({ roles: ['researcher'] } as never);
    const req = makeRequest('/dashboard');
    const res = await middleware(req);
    expect(res.status).toBe(200);
  });

  it('redirects to /access-denied when user has wrong role', async () => {
    mockedGetToken.mockResolvedValueOnce({ roles: ['user'] } as never);
    const req = makeRequest('/dashboard');
    const res = await middleware(req);
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toContain('/access-denied');
  });

  it('redirects to /access-denied when user has no roles', async () => {
    mockedGetToken.mockResolvedValueOnce({ roles: [] } as never);
    const req = makeRequest('/dashboard');
    const res = await middleware(req);
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toContain('/access-denied');
  });
});
