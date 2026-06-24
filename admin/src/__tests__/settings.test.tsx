import React from 'react';
import { render, screen } from '@testing-library/react';
import SettingsPage from '../app/(admin)/settings/page';

jest.mock('next-auth/react', () => ({
  useSession: () => ({
    data: { accessToken: 'test-token', roles: ['admin'] },
    status: 'authenticated',
  }),
}));

jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: jest.fn() }),
  usePathname: () => '/settings',
}));

beforeEach(() => {
  global.fetch = jest.fn().mockImplementation((url: string) => {
    const isActivityTypes = String(url).includes('/activity-types');
    return Promise.resolve({
      ok: true,
      json: jest.fn().mockResolvedValue(
        isActivityTypes
          ? []
          : { default_cue_count: 'multi', default_cue_source: 'high_quality', default_reminder_time: '19:00' }
      ),
    } as unknown as Response);
  });
});

afterEach(() => { jest.resetAllMocks(); });

describe('SettingsPage', () => {
  it('renders without crashing', () => {
    render(<SettingsPage />);
  });

  it('renders the page title', () => {
    render(<SettingsPage />);
    expect(screen.getByRole('heading', { name: /settings/i })).toBeInTheDocument();
  });

  it('renders cue config section heading', async () => {
    render(<SettingsPage />);
    expect(await screen.findByText(/public default cue config/i)).toBeInTheDocument();
  });
});
