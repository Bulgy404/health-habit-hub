// admin/src/__tests__/studies-analytics.test.tsx
import React from 'react';
import { render, screen } from '@testing-library/react';

jest.mock('next-auth/react', () => ({
  useSession: () => ({
    data: { accessToken: 'test-token' },
    status: 'authenticated',
  }),
}));
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
  usePathname: () => '/studies',
}));

import { AnalyticsTab, StudySummaryForAnalytics } from '../components/studies-analytics-tab';

const mockStudy: StudySummaryForAnalytics = {
  id: 'study-1',
  groups: [
    { id: 'g1', label: 'C1', index: 1 },
    { id: 'g2', label: 'C2', index: 2 },
  ],
};

beforeEach(() => {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: jest.fn().mockResolvedValue({
      weeklyActiveRate: [
        { groupId: 'g1', enrolled: 5, active: 3, rate: 0.6 },
        { groupId: 'g2', enrolled: 5, active: 2, rate: 0.4 },
      ],
      srhiTrajectory: [
        { groupId: 'g1', weekNumber: 1, meanScore: 4.5, count: 3 },
        { groupId: 'g2', weekNumber: 1, meanScore: 3.2, count: 2 },
      ],
      dropoutCurve: [],
    }),
  } as unknown as Response);
});

afterEach(() => { jest.resetAllMocks(); });

describe('AnalyticsTab', () => {
  it('renders without crashing', () => {
    render(<AnalyticsTab study={mockStudy} token="test-token" />);
  });

  it('renders Weekly Active Rate heading', async () => {
    render(<AnalyticsTab study={mockStudy} token="test-token" />);
    expect(await screen.findByText(/weekly active rate/i)).toBeInTheDocument();
  });

  it('renders SRHI Trajectory heading', async () => {
    render(<AnalyticsTab study={mockStudy} token="test-token" />);
    expect(await screen.findByText(/srhi trajectory/i)).toBeInTheDocument();
  });

  it('shows percentage for active groups', async () => {
    render(<AnalyticsTab study={mockStudy} token="test-token" />);
    expect(await screen.findByText(/60%/)).toBeInTheDocument();
  });
});
