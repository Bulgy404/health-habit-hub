import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import QuestionnairesPage from '../app/(admin)/questionnaires/page';

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

describe('QuestionnairesPage', () => {
  it('renders without crashing', () => {
    render(<QuestionnairesPage />);
  });

  it('renders the page title', () => {
    render(<QuestionnairesPage />);
    expect(screen.getByRole('heading', { name: /questionnaires/i })).toBeInTheDocument();
  });

  it('renders Library and Custom tabs', () => {
    render(<QuestionnairesPage />);
    expect(screen.getByRole('button', { name: /library/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /custom/i })).toBeInTheDocument();
  });

  it('"Add Questionnaire" button is absent on Library tab and present on Custom tab', async () => {
    const user = userEvent.setup();
    render(<QuestionnairesPage />);

    // Default tab is Library — button should not be visible
    expect(screen.queryByRole('button', { name: /add questionnaire/i })).not.toBeInTheDocument();

    // Switch to Custom tab
    await user.click(screen.getByRole('button', { name: /^custom$/i }));

    expect(screen.getByRole('button', { name: /add questionnaire/i })).toBeInTheDocument();
  });

  it('opens create modal when "Add Questionnaire" is clicked on Custom tab', async () => {
    const user = userEvent.setup();
    render(<QuestionnairesPage />);

    // Switch to Custom tab
    await user.click(screen.getByRole('button', { name: /^custom$/i }));

    // Click "Add Questionnaire"
    await user.click(screen.getByRole('button', { name: /add questionnaire/i }));

    // Modal title should appear
    expect(screen.getByText('Add Questionnaire', { selector: 'span' })).toBeInTheDocument();
  });

  it('shows delete confirm dialog when Delete is clicked on a custom questionnaire', async () => {
    const user = userEvent.setup();

    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue([
        {
          id: '1',
          slug: 'my-q',
          title: 'My Q',
          description: '',
          version: '1',
          active: true,
          isLibrary: false,
          questionCount: 0,
          updatedAt: null,
        },
      ]),
    } as unknown as Response);

    render(<QuestionnairesPage />);

    // Switch to Custom tab first (custom questionnaires only appear there)
    await user.click(screen.getByRole('button', { name: /^custom$/i }));

    // Wait for the questionnaire to appear in the custom tab
    await screen.findByText('My Q');

    // Click the Delete button for the questionnaire
    await user.click(screen.getByRole('button', { name: /^delete$/i }));

    // Confirm dialog should appear
    expect(screen.getByText(/delete questionnaire\?/i)).toBeInTheDocument();
  });

  it('shows "assigned to an active study" error on 409 response', async () => {
    const user = userEvent.setup();

    (global.fetch as jest.Mock)
      // first call: list load
      .mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue([
          {
            id: '1',
            slug: 'my-q',
            title: 'My Q',
            description: '',
            version: '1',
            active: true,
            isLibrary: false,
            questionCount: 0,
            updatedAt: null,
          },
        ]),
      } as unknown as Response)
      // second call: DELETE returns 409
      .mockResolvedValueOnce({
        ok: false,
        status: 409,
        json: jest.fn().mockResolvedValue({ error: 'Conflict' }),
      } as unknown as Response);

    render(<QuestionnairesPage />);

    // Switch to Custom tab first (custom questionnaires only appear there)
    await user.click(screen.getByRole('button', { name: /^custom$/i }));

    // Wait for questionnaire to load in the custom tab
    await screen.findByText('My Q');

    // Click Delete to open the confirm dialog
    await user.click(screen.getByRole('button', { name: /^delete$/i }));

    // Confirm dialog should appear — click Delete inside it (there may be multiple Delete buttons)
    await screen.findByText(/delete questionnaire\?/i);
    const allDeleteBtns = screen.getAllByRole('button', { name: /^delete$/i });
    // The confirm dialog's Delete button is the last one rendered
    await user.click(allDeleteBtns[allDeleteBtns.length - 1]);

    // Error message should mention "assigned to an active study"
    await waitFor(() => {
      expect(screen.getByText(/assigned to an active study/i)).toBeInTheDocument();
    });
  });
});
