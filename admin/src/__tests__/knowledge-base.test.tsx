import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

  it('opens upload modal when "Upload PDF" button is clicked', async () => {
    const user = userEvent.setup();
    render(<KnowledgeBasePage />);

    await user.click(screen.getByRole('button', { name: /upload pdf/i }));

    // Modal title should appear
    expect(screen.getByText('Upload PDF', { selector: 'span' })).toBeInTheDocument();
  });

  it('shows delete confirmation dialog when Delete is clicked on a file', async () => {
    const user = userEvent.setup();

    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue([
        {
          filename: 'test-paper.pdf',
          category: 'general',
          file_size: 12345,
          has_summary: false,
          upload_date: '2024-01-01T00:00:00Z',
        },
      ]),
    } as unknown as Response);

    render(<KnowledgeBasePage />);

    // Wait for the file entry to appear
    await screen.findByText('test-paper.pdf');

    // Click Delete
    await user.click(screen.getByRole('button', { name: /^delete$/i }));

    // Confirm dialog should appear
    expect(screen.getByText(/delete file\?/i)).toBeInTheDocument();
  });

  it('rejects non-PDF files with an error message', async () => {
    const user = userEvent.setup();
    const { container } = render(<KnowledgeBasePage />);

    // Open the upload modal
    await user.click(screen.getByRole('button', { name: /upload pdf/i }));

    // jsdom's file input is read-only; override `files` on the DOM element via Object.defineProperty
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['content'], 'test.txt', { type: 'text/plain' });
    const fileList = {
      0: file,
      length: 1,
      item: (i: number) => (i === 0 ? file : null),
      [Symbol.iterator]: function* () { yield file; },
    };
    Object.defineProperty(fileInput, 'files', { value: fileList, writable: false, configurable: true });
    fireEvent.change(fileInput);

    // Click the Upload button inside the modal
    await user.click(screen.getByRole('button', { name: /^upload$/i }));

    // Error should appear
    await waitFor(() => {
      expect(screen.getByText(/only pdf files are accepted/i)).toBeInTheDocument();
    });
  });
});
