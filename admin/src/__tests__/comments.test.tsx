import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CommentsPage from '../app/(admin)/comments/page';

jest.mock('next-auth/react', () => ({
  useSession: () => ({
    data: { accessToken: 'test-token', roles: ['admin'] },
    status: 'authenticated',
  }),
}));

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  usePathname: () => '/comments',
}));

const flaggedComment = {
  id: 'c-flagged-1',
  text: 'This is a rude comment',
  createdAt: '2026-01-01T00:00:00.000Z',
  habitId: 'habit-1',
  habitSentence: 'I walk every day',
  flagged: true,
  flagReason: 'Contains harassment',
};

const publishedComment = {
  id: 'c-published-1',
  text: 'Nice job!',
  createdAt: '2026-01-02T00:00:00.000Z',
  habitId: 'habit-2',
  habitSentence: 'I meditate every morning',
  flagged: false,
  flagReason: null,
};

function mockFetchImplementation(flaggedList: unknown[] = [flaggedComment]) {
  return jest.fn().mockImplementation((url: string) => {
    if (url.includes('status=flagged')) {
      return Promise.resolve({
        ok: true,
        json: async () => ({
          comments: flaggedList,
          total: flaggedList.length,
          page: 1,
          limit: 100,
        }),
      } as unknown as Response);
    }
    if (url.includes('/approve') && url.includes('POST')) {
      return Promise.resolve({ ok: true, json: async () => ({ ok: true }) } as unknown as Response);
    }
    return Promise.resolve({
      ok: true,
      json: async () => ({
        comments: [publishedComment],
        total: 1,
        page: 1,
        limit: 100,
      }),
    } as unknown as Response);
  });
}

beforeEach(() => {
  global.fetch = mockFetchImplementation();
});

afterEach(() => {
  jest.resetAllMocks();
});

describe('CommentsPage', () => {
  it('renders the page title', async () => {
    render(<CommentsPage />);
    expect(screen.getByRole('heading', { name: /comments/i })).toBeInTheDocument();
  });

  it('shows the flagged-for-review section with the flagged comment', async () => {
    render(<CommentsPage />);
    expect(await screen.findByText('This is a rude comment')).toBeInTheDocument();
    expect(screen.getByText('Contains harassment')).toBeInTheDocument();
  });

  it('shows the empty state when nothing is flagged', async () => {
    global.fetch = mockFetchImplementation([]);
    render(<CommentsPage />);
    expect(
      await screen.findByText(/nothing flagged for review right now/i)
    ).toBeInTheDocument();
  });

  it('shows the published comment in the main comments table', async () => {
    render(<CommentsPage />);
    expect(await screen.findByText('Nice job!')).toBeInTheDocument();
  });

  it('approving a flagged comment removes it from the flagged section', async () => {
    const user = userEvent.setup();
    global.fetch = jest.fn().mockImplementation((url: string, opts?: RequestInit) => {
      if (url.includes('/approve')) {
        return Promise.resolve({ ok: true, json: async () => ({ ok: true, commentId: flaggedComment.id }) } as unknown as Response);
      }
      if (url.includes('status=flagged')) {
        // After approval the flagged list would be empty on a real refetch,
        // but this test only checks local state removal, so keep returning
        // the same fixture — the component removes it from state directly.
        return Promise.resolve({
          ok: true,
          json: async () => ({ comments: [flaggedComment], total: 1, page: 1, limit: 100 }),
        } as unknown as Response);
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({ comments: [publishedComment], total: 1, page: 1, limit: 100 }),
      } as unknown as Response);
    });

    render(<CommentsPage />);
    expect(await screen.findByText('This is a rude comment')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^approve$/i }));

    await waitFor(() => {
      expect(screen.queryByText('This is a rude comment')).not.toBeInTheDocument();
    });
  });
});
