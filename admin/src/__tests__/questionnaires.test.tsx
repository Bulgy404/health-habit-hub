import React from 'react';
import { render, screen } from '@testing-library/react';
import QuestionnairesPage from '../app/(admin)/questionnaires/page';

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

describe('QuestionnairesPage', () => {
  it('renders without crashing', () => {
    render(<QuestionnairesPage />);
  });

  it('renders the page title', () => {
    render(<QuestionnairesPage />);
    expect(screen.getByRole('heading', { name: /questionnaires/i })).toBeInTheDocument();
  });

  it('renders Library and Custom tabs', () => {
    render(<QuestionnairesPage />);
    expect(screen.getByRole('button', { name: /library/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /custom/i })).toBeInTheDocument();
  });
});
