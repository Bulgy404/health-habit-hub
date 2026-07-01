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
    let body: unknown;
    if (u.includes('/activity-types')) {
      body = [
        { key: 'walking', label_en: 'Walking', isDefault: true },
        { key: 'yoga', label_en: 'Yoga', isDefault: false },
      ];
    } else if (u.includes('/app-settings')) {
      body = { guidedHabitCreationEnabled: true, communityShareDefault: false };
    } else {
      body = {
        default_cue_count: 'multi',
        default_cue_source: 'high_quality',
        default_reminder_time: '19:00',
      };
    }
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

  it('renders the default cue config section with shared form fields', async () => {
    render(<DefaultAppPage />);
    expect(await screen.findByText(/default cue config/i)).toBeInTheDocument();
    expect(await screen.findByText(/cue count/i)).toBeInTheDocument();
    expect(screen.getByText(/cue source/i)).toBeInTheDocument();
    expect(screen.getByText(/default reminder time/i)).toBeInTheDocument();
  });

  it('lists default behaviors from the activity catalog', async () => {
    render(<DefaultAppPage />);
    expect(await screen.findByText('Walking')).toBeInTheDocument();
    expect(screen.queryByText('Yoga')).not.toBeInTheDocument();
  });
});
