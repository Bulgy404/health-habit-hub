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
      questionnaireCompletionRates: [
        { questionnaireId: 'q1', slug: 'baseline', title: 'Baseline Survey', enrolled: 10, completed: 7, rate: 0.7 },
      ],
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

  it('renders Questionnaire Completion heading', async () => {
    render(<AnalyticsTab study={mockStudy} token="test-token" />);
    expect(await screen.findByText(/questionnaire completion/i)).toBeInTheDocument();
  });

  it('shows questionnaire title and completion rate', async () => {
    render(<AnalyticsTab study={mockStudy} token="test-token" />);
    expect(await screen.findByText('Baseline Survey')).toBeInTheDocument();
    expect(await screen.findByText(/70%/)).toBeInTheDocument();
  });
});
