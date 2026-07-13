import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { InsightsView } from '../components/InsightsView';
import AnalyticsInsightsPage from '../app/(admin)/analytics/page';

// The `/insights` route (src/app/(admin)/insights/page.tsx) is a thin client
// redirect to `/analytics` — Insights was merged into the combined Analytics
// dashboard as an admin-only tab. The real Insights UI lives in
// InsightsView (src/components/InsightsView.tsx), so these tests exercise
// that component directly, plus the tab-visibility gating on the combined
// page for the admin-vs-researcher case.

jest.mock('next-auth/react', () => ({
  useSession: jest.fn(),
}));

import { useSession } from 'next-auth/react';
const mockedUseSession = useSession as jest.MockedFunction<typeof useSession>;

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
  usePathname: () => '/analytics',
}));

const adminSession = {
  data: { accessToken: 'test-token', roles: ['admin'], expires: '' },
  status: 'authenticated' as const,
  update: jest.fn(),
};

const metaA = { key: 'total-users', title: 'Total Users', description: 'desc A' };
const metaB = { key: 'top-groups', title: 'Top Groups', description: 'desc B' };

// Mocks GET /admin/insights (the list of insight metas) and each individual
// GET /admin/insights/<key>[?refresh=1] card fetch. A refreshed fetch for
// total-users returns a later computedAt and cached:false, so tests can
// assert the refresh actually bypassed the cache.
function mockFetchImplementation() {
  return jest.fn().mockImplementation((url: string) => {
    if (url.includes('/admin/insights/total-users')) {
      const refreshed = url.includes('refresh=1');
      return Promise.resolve({
        ok: true,
        json: async () => ({
          key: 'total-users',
          title: 'Total Users',
          description: 'desc A',
          computedAt: refreshed ? '2026-01-03T00:00:00.000Z' : '2026-01-01T00:00:00.000Z',
          cached: !refreshed,
          result: { type: 'stats', items: [{ label: 'Total', value: 42 }] },
        }),
      } as unknown as Response);
    }
    if (url.includes('/admin/insights/top-groups')) {
      return Promise.resolve({
        ok: true,
        json: async () => ({
          key: 'top-groups',
          title: 'Top Groups',
          description: 'desc B',
          computedAt: '2026-01-02T00:00:00.000Z',
          cached: false,
          result: {
            type: 'table',
            columns: [{ key: 'name', label: 'Name' }],
            rows: [{ name: 'Group A' }],
          },
        }),
      } as unknown as Response);
    }
    if (url.includes('/admin/insights')) {
      return Promise.resolve({
        ok: true,
        json: async () => ({ insights: [metaA, metaB] }),
      } as unknown as Response);
    }
    return Promise.resolve({ ok: true, json: async () => ({}) } as unknown as Response);
  });
}

beforeEach(() => {
  mockedUseSession.mockReturnValue(adminSession);
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: jest.fn().mockResolvedValue({ insights: [] }),
  } as unknown as Response);
});

afterEach(() => {
  jest.resetAllMocks();
});

describe('InsightsView', () => {
  it('renders without crashing', () => {
    render(<InsightsView />);
  });

  it('renders the page title', async () => {
    render(<InsightsView />);
    expect(await screen.findByRole('heading', { name: /^insights$/i })).toBeInTheDocument();
  });

  it('insight cards render, as stat tiles or tables depending on data shape', async () => {
    global.fetch = mockFetchImplementation();
    render(<InsightsView />);

    // Stats-shaped card
    expect(await screen.findByText('Total Users')).toBeInTheDocument();
    expect(await screen.findByText('42')).toBeInTheDocument();
    expect(screen.getByText('Total')).toBeInTheDocument();

    // Table-shaped card
    expect(await screen.findByText('Top Groups')).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Name' })).toBeInTheDocument();
    expect(screen.getByText('Group A')).toBeInTheDocument();
  });

  it('cached-vs-fresh timestamp indicator reflects each card\'s cached flag', async () => {
    global.fetch = mockFetchImplementation();
    render(<InsightsView />);

    await screen.findByText('Total Users');
    // total-users loads with cached: true
    expect(await screen.findByText(/^Cached ·/)).toBeInTheDocument();
    // top-groups loads with cached: false
    expect(await screen.findByText(/^Freshly computed ·/)).toBeInTheDocument();
  });

  it('per-card Refresh button re-fetches that card and bypasses cache', async () => {
    const user = userEvent.setup();
    global.fetch = mockFetchImplementation();
    render(<InsightsView />);

    await screen.findByText('Total Users');
    expect(await screen.findByText(/^Cached ·/)).toBeInTheDocument();

    const refreshButtons = screen.getAllByRole('button', { name: /^refresh$/i });
    // The "Total Users" card is first in meta order — scope assertions to its
    // own card container so they don't collide with "Top Groups", which is
    // already cached:false from its initial load.
    const totalUsersCard = refreshButtons[0].closest('div')!.parentElement as HTMLElement;
    await user.click(refreshButtons[0]);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/admin/insights/total-users?refresh=1'),
        expect.anything()
      );
    });

    // Refreshed response is cached:false — the indicator flips within this card.
    await waitFor(() => {
      expect(within(totalUsersCard).getByText(/^Freshly computed ·/)).toBeInTheDocument();
    });
  });

  it('"Reload all" refreshes every card', async () => {
    const user = userEvent.setup();
    global.fetch = mockFetchImplementation();
    render(<InsightsView />);

    await screen.findByText('Total Users');
    await screen.findByText('Top Groups');

    const fetchMock = global.fetch as jest.Mock;
    const callsFor = (key: string) =>
      fetchMock.mock.calls.filter((c) => String(c[0]).includes(key)).length;

    const initialTotalUsersCalls = callsFor('total-users');
    const initialTopGroupsCalls = callsFor('top-groups');

    await user.click(screen.getByRole('button', { name: /reload all/i }));

    await waitFor(() => {
      expect(callsFor('total-users')).toBeGreaterThan(initialTotalUsersCalls);
      expect(callsFor('top-groups')).toBeGreaterThan(initialTopGroupsCalls);
    });
  });
});

describe('Insights tab visibility on the combined Analytics/Insights page', () => {
  it('is visible for an admin session', async () => {
    mockedUseSession.mockReturnValue(adminSession);
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ studies: [] }),
    } as unknown as Response);

    render(<AnalyticsInsightsPage />);

    expect(await screen.findByRole('button', { name: /^insights$/i })).toBeInTheDocument();
  });

  it('is hidden for a researcher session', async () => {
    mockedUseSession.mockReturnValue({
      data: { accessToken: 'test-token', roles: ['researcher'], expires: '' },
      status: 'authenticated',
      update: jest.fn(),
    });
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ studies: [] }),
    } as unknown as Response);

    render(<AnalyticsInsightsPage />);

    await screen.findByRole('button', { name: /^analytics$/i });
    expect(screen.queryByRole('button', { name: /^insights$/i })).not.toBeInTheDocument();
  });
});
