// admin/src/__tests__/studies-participants.test.tsx
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

const mockStudy = {
  id: 'study-1',
  name: 'Study A',
  description: '',
  isActive: true,
  isDefault: false,
  groups: [{ id: 'g1', label: 'Control', index: 1 }],
  questionnaires: [],
  participantCount: 2,
  createdAt: null,
};

const mockParticipant = {
  userId: 'user-1',
  groupId: 'g1',
  groupLabel: 'Control',
  enrolledAt: '2024-01-15T10:00:00Z',
  status: 'active',
  dropoutAt: null,
};

afterEach(() => {
  jest.resetAllMocks();
});

describe('StudiesPage — Participants tab', () => {
  it('Participants tab is reachable from the study detail modal', async () => {
    const user = userEvent.setup();

    (global.fetch as jest.Mock) = jest.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue([mockStudy]),
      } as unknown as Response)
      .mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({ participants: [], summary: null, total: 0 }),
      } as unknown as Response);

    render(<StudiesPage />);

    const studyName = await screen.findByText('Study A');
    await user.click(studyName);

    const participantsTab = await screen.findByRole('button', { name: /^participants$/i });
    expect(participantsTab).toBeInTheDocument();
    await user.click(participantsTab);

    await waitFor(() => {
      expect(screen.getByText(/no participants enrolled yet/i)).toBeInTheDocument();
    });
  });

  it('shows enrolled participants in the table', async () => {
    const user = userEvent.setup();

    (global.fetch as jest.Mock) = jest.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue([mockStudy]),
      } as unknown as Response)
      .mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({
          participants: [mockParticipant],
          summary: { total: 1, active: 1, dropped: 0, perGroup: [{ groupId: 'g1', groupLabel: 'Control', count: 1 }] },
          total: 1,
        }),
      } as unknown as Response);

    render(<StudiesPage />);

    const studyName = await screen.findByText('Study A');
    await user.click(studyName);

    const participantsTab = await screen.findByRole('button', { name: /^participants$/i });
    await user.click(participantsTab);

    await waitFor(() => {
      expect(screen.getByText('user-1')).toBeInTheDocument();
    });
  });

  it('shows download CSV button in Participants tab', async () => {
    const user = userEvent.setup();

    (global.fetch as jest.Mock) = jest.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue([mockStudy]),
      } as unknown as Response)
      .mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({
          participants: [mockParticipant],
          summary: null,
          total: 1,
        }),
      } as unknown as Response);

    render(<StudiesPage />);

    const studyName = await screen.findByText('Study A');
    await user.click(studyName);

    const participantsTab = await screen.findByRole('button', { name: /^participants$/i });
    await user.click(participantsTab);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /download csv/i })).toBeInTheDocument();
    });
  });

  it('shows error state when participants fetch fails', async () => {
    const user = userEvent.setup();

    (global.fetch as jest.Mock) = jest.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue([mockStudy]),
      } as unknown as Response)
      .mockResolvedValue({
        ok: false,
        status: 500,
        json: jest.fn().mockResolvedValue({ error: 'Internal server error' }),
      } as unknown as Response);

    render(<StudiesPage />);

    const studyName = await screen.findByText('Study A');
    await user.click(studyName);

    const participantsTab = await screen.findByRole('button', { name: /^participants$/i });
    await user.click(participantsTab);

    await waitFor(() => {
      expect(screen.getByText(/internal server error/i)).toBeInTheDocument();
    });
  });
});
