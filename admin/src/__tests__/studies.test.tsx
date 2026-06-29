import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

const mockStudy = {
  id: 'study-1',
  name: 'Study A',
  description: '',
  isActive: true,
  isDefault: false,
  recommenderEnabled: true,
  groups: [],
  questionnaires: [],
  participantCount: 0,
  createdAt: null,
};

describe('StudiesPage', () => {
  it('renders without crashing', () => {
    render(<StudiesPage />);
  });

  it('renders the page title', () => {
    render(<StudiesPage />);
    expect(screen.getByRole('heading', { name: /studies/i })).toBeInTheDocument();
  });

  it('detail modal tabs are reachable — Codes tab visible and clickable', async () => {
    const user = userEvent.setup();

    // First call: list load returns one study
    // Subsequent calls (codes fetch inside CodesTab): return empty codes list
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue([mockStudy]),
      } as unknown as Response)
      .mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({ codes: [], total: 0 }),
      } as unknown as Response);

    render(<StudiesPage />);

    // Wait for study to appear and click its row to open detail modal
    const studyName = await screen.findByText('Study A');
    await user.click(studyName);

    // Modal should open — Codes tab button should be visible
    const codesTab = await screen.findByRole('button', { name: /^codes$/i });
    expect(codesTab).toBeInTheDocument();

    // Click Codes tab
    await user.click(codesTab);

    // The Generate study codes section heading should appear
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /generate study codes/i })).toBeInTheDocument();
    });
  });

  it('Codes tab generate form submits without requiring a group (study-level codes)', async () => {
    const user = userEvent.setup();

    // Study-level codes don't require a group — auto-assigned at redemption.
    const studyNoGroups = { ...mockStudy, groups: [] };

    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue([studyNoGroups]),
      } as unknown as Response)
      .mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({ codes: [], total: 0 }),
      } as unknown as Response);

    render(<StudiesPage />);

    // Open detail modal
    const studyName = await screen.findByText('Study A');
    await user.click(studyName);

    // Switch to Codes tab
    const codesTab = await screen.findByRole('button', { name: /^codes$/i });
    await user.click(codesTab);

    // Wait for Generate codes button and click it — no group selection needed
    const generateBtn = await screen.findByRole('button', { name: /^generate codes$/i });
    await user.click(generateBtn);

    // No error should appear; button should return to its default label
    await waitFor(() => {
      expect(screen.queryByText(/please select a group/i)).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: /^generate codes$/i })).toBeInTheDocument();
    });
  });
});
