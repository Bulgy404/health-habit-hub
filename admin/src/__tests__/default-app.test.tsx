import React from 'react';
import { render, screen } from '@testing-library/react';
import DefaultAppPage from '../app/(admin)/default-app/page';

jest.mock('next-auth/react', () => ({
  useSession: () => ({
    data: { accessToken: 'test-token', roles: ['admin'] },
    status: 'authenticated',
  }),
}));

jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: jest.fn() }),
  usePathname: () => '/default-app',
}));

beforeEach(() => {
  global.fetch = jest.fn().mockImplementation((url: string) => {
    const u = String(url);
    const body = u.includes('/app-settings')
      ? { guidedHabitCreationEnabled: true, communityShareDefault: false }
      : { default_reminder_time: '19:00' };
    return Promise.resolve({
      ok: true,
      json: jest.fn().mockResolvedValue(body),
    } as unknown as Response);
  });
});

afterEach(() => { jest.resetAllMocks(); });

describe('DefaultAppPage', () => {
  it('renders without crashing', () => {
    render(<DefaultAppPage />);
  });

  it('renders the page title', () => {
    render(<DefaultAppPage />);
    expect(screen.getByRole('heading', { name: /public app/i })).toBeInTheDocument();
  });

  it('renders the features section', async () => {
    render(<DefaultAppPage />);
    expect(
      await screen.findByText(/guided implementation intention wizard/i)
    ).toBeInTheDocument();
  });

  it('renders the defaults section with the reminder time only', async () => {
    render(<DefaultAppPage />);
    expect(await screen.findByText(/default reminder time/i)).toBeInTheDocument();
    // Cue and behavior configuration is study-only — must not appear here.
    expect(screen.queryByText(/cue count/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/cue source/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/allowed behaviors/i)).not.toBeInTheDocument();
  });
});
