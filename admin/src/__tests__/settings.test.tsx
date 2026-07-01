import React from 'react';
import { render, screen } from '@testing-library/react';
import ActivityTypesPage from '../app/(admin)/settings/page';

jest.mock('next-auth/react', () => ({
  useSession: () => ({
    data: { accessToken: 'test-token', roles: ['admin'] },
    status: 'authenticated',
  }),
}));

jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: jest.fn() }),
  usePathname: () => '/settings',
}));

beforeEach(() => {
  global.fetch = jest.fn().mockImplementation(() =>
    Promise.resolve({
      ok: true,
      json: jest.fn().mockResolvedValue([
        { key: 'walking', label_en: 'Walking', isDefault: true },
        { key: 'yoga', label_en: 'Yoga', isDefault: false },
      ]),
    } as unknown as Response)
  );
});

afterEach(() => { jest.resetAllMocks(); });

describe('ActivityTypesPage', () => {
  it('renders without crashing', () => {
    render(<ActivityTypesPage />);
  });

  it('renders the page title', () => {
    render(<ActivityTypesPage />);
    expect(screen.getByRole('heading', { name: /activity types/i })).toBeInTheDocument();
  });

  it('renders the catalog entries', async () => {
    render(<ActivityTypesPage />);
    expect(await screen.findByText('Walking')).toBeInTheDocument();
    expect(screen.getByText('Yoga')).toBeInTheDocument();
  });
});
