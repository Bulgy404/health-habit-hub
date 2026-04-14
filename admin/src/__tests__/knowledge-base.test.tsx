import React from 'react';
import { render, screen } from '@testing-library/react';
import KnowledgeBasePage from '../app/(admin)/knowledge-base/page';

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

describe('KnowledgeBasePage', () => {
  it('renders without crashing', () => {
    render(<KnowledgeBasePage />);
  });

  it('renders the page title', () => {
    render(<KnowledgeBasePage />);
    expect(screen.getByRole('heading', { name: /knowledge base/i })).toBeInTheDocument();
  });

  it('renders Upload PDF button', () => {
    render(<KnowledgeBasePage />);
    expect(screen.getByRole('button', { name: /upload pdf/i })).toBeInTheDocument();
  });

  it('renders Re-index button', () => {
    render(<KnowledgeBasePage />);
    expect(screen.getByRole('button', { name: /re-index/i })).toBeInTheDocument();
  });
});
