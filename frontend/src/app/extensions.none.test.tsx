// The app with NO extension (src/extensions/none.ts): no extra pages, no
// sign-up terms checkbox, nothing about paying, and no crash.
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@writerverse/extensions', () => import('../extensions/none'));
vi.mock('axios', () => ({
  default: {
    get: vi.fn(() => Promise.resolve({ data: {} })),
    post: vi.fn(() => Promise.resolve({ data: {} })),
    defaults: { baseURL: '', headers: { common: {} } },
    interceptors: { request: { use: vi.fn(), eject: vi.fn() }, response: { use: vi.fn(), eject: vi.fn() } },
  },
}));

import App from '../App';
import SignupPage from '../components/SignupPage';
import { extensions, handleApiError, setupExtensions } from './extensions';

describe('app with the empty extension', () => {
  it('has every slot empty', () => {
    expect(extensions).toEqual({});
    expect(handleApiError(402, { code: 'x' })).toBe(false);
    expect(() => setupExtensions()).not.toThrow();
  });

  it('renders, and an extension URL is not a page', async () => {
    window.history.pushState({}, '', '/billing');
    render(<App />);
    await waitFor(() => expect(window.location.pathname).not.toBe('/billing'));
    expect(screen.getAllByText(/WriterVerse/i).length).toBeGreaterThan(0);
    expect(document.body.textContent).not.toMatch(/credit|billing/i);
  });

  it('sign-up has no terms checkbox and can submit', () => {
    const qc = new QueryClient();
    render(<QueryClientProvider client={qc}><MemoryRouter><SignupPage /></MemoryRouter></QueryClientProvider>);
    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(screen.queryByText(/terms/i)).toBeNull();
    expect((screen.getByRole('button', { name: 'Create account' }) as HTMLButtonElement).disabled).toBe(false);
  });
});
