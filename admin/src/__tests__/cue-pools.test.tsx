import React from 'react';
import { render, screen } from '@testing-library/react';
import CuePoolsPage from '../app/(admin)/cue-pools/page';

jest.mock('next-auth/react', () => ({
  useSession: () => ({
    data: { accessToken: 'test-token' },
    status: 'authenticated',
  }),
}));

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
  usePathname: () => '/cue-pools',
}));

beforeEach(() => {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: jest.fn().mockResolvedValue({ total: 0, page: 1, limit: 50, cues: [] }),
  } as unknown as Response);
});

afterEach(() => { jest.resetAllMocks(); });

describe('CuePoolsPage', () => {
  it('renders without crashing', () => {
    render(<CuePoolsPage />);
  });

  it('renders the page title', () => {
    render(<CuePoolsPage />);
    expect(screen.getByRole('heading', { name: /cue pools/i })).toBeInTheDocument();
  });

  it('shows empty state when no cues', async () => {
    render(<CuePoolsPage />);
    expect(await screen.findByText(/no cues yet/i)).toBeInTheDocument();
  });

  it('renders the Import CSV button', () => {
    render(<CuePoolsPage />);
    expect(screen.getByRole('button', { name: /import csv/i })).toBeInTheDocument();
  });
});
