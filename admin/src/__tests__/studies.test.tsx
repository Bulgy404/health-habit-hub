import React from 'react';
import { render, screen } from '@testing-library/react';
import StudiesPage from '../app/(admin)/studies/page';

jest.mock('next-auth/react', () => ({
  useSession: () => ({
    data: { accessToken: 'test-token' },
    status: 'authenticated',
  }),
}));

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/',
}));

// Mock fetch so the page doesn't error on mount
beforeEach(() => {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: jest.fn().mockResolvedValue([]),
  } as unknown as Response);
});

afterEach(() => {
  jest.resetAllMocks();
});

describe('StudiesPage', () => {
  it('renders without crashing', () => {
    render(<StudiesPage />);
  });

  it('renders the page title', () => {
    render(<StudiesPage />);
    expect(screen.getByRole('heading', { name: /studies/i })).toBeInTheDocument();
  });
});
