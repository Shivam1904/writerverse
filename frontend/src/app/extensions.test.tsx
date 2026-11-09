// The extension slots (app/extensions.ts): a fake extension fills every slot,
// and each one shows up where the app reads it.
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

const fake = vi.hoisted(() => ({
  setup: vi.fn(),
  handleApiError: vi.fn((status: number | undefined) => status === 418),
}));

vi.mock('@writerverse/extensions', async () => {
  const React = await import('react');
  const h = React.createElement;
  return {
    default: {
      routes: [{ path: '/ext-page', element: h('p', null, 'Extension page'), auth: 'public' }],
      topbarItems: [({ projectId }: { projectId: string }) => h('span', null, `chip for ${projectId}`)],
      userMenuItems: [{ label: 'Extension link', to: '/ext-page' }],
      shellOverlays: [({ projectId }: { projectId?: string }) => h('div', null, `overlay for ${projectId}`)],
      libraryOverlays: [({ justSignedUp }: { justSignedUp: boolean }) => h('div', null, `welcome ${justSignedUp}`)],
      useCostLabel: (feature: string) => `cost of ${feature}`,
      handleApiError: fake.handleApiError,
      signupTerms: { heading: 'House rules', body: h('p', null, 'Be kind.'), checkboxLabel: 'I accept the', linkLabel: 'house rules', required: true },
      setup: fake.setup,
    },
  };
});

vi.mock('axios', () => ({
  default: {
    get: vi.fn(() => Promise.resolve({ data: {} })),
    post: vi.fn(() => Promise.resolve({ data: {} })),
    request: vi.fn(() => Promise.resolve({ status: 200, data: {}, headers: {} })),
    isCancel: () => false,
    defaults: { baseURL: '', headers: { common: {} } },
    interceptors: { request: { use: vi.fn(), eject: vi.fn() }, response: { use: vi.fn(), eject: vi.fn() } },
  },
}));
vi.mock('./gateway', () => ({ callOp: vi.fn().mockResolvedValue({ title: 'Ember Lake' }) }));
vi.mock('./modules/notification', async (importOriginal) => ({
  ...(await importOriginal<any>()),
  NotificationBell: () => null,
}));

import App from '../App';
import { Topbar } from './Topbar';
import { handleApiError, setupExtensions } from './extensions';
import { useActionCost, withCost } from './lib/actionCost';
import SignupPage from '../components/SignupPage';
import Library from './pages/library/Library';
import { useAuthStore } from '../stores/authStore';

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}><MemoryRouter>{ui}</MemoryRouter></QueryClientProvider>);
}

describe('extension slots', () => {
  it('routes: the extension page is served', async () => {
    window.history.pushState({}, '', '/ext-page');
    render(<App />);
    expect(await screen.findByText('Extension page')).toBeTruthy();
  });

  it('topbarItems and userMenuItems: shown in the project top bar', async () => {
    wrap(<Topbar projectId="8" />);
    expect(await screen.findByText('chip for 8')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'user menu' }));
    expect(screen.getByRole('button', { name: 'Extension link' })).toBeTruthy();
  });

  it('libraryOverlays: shown on the library with the sign-up flag', async () => {
    useAuthStore.setState({ justSignedUp: true, user: { id: 1, email: 'a@b.io' } as any });
    wrap(<Library />);
    expect(await screen.findByText('welcome true')).toBeTruthy();
  });

  it('useCostLabel: the cost label for a feature', () => {
    function Button() {
      return <button>{withCost('Scan', useActionCost('analyse_gauge'))}</button>;
    }
    wrap(<Button />);
    expect(screen.getByRole('button', { name: 'Scan · cost of analyse_gauge' })).toBeTruthy();
  });

  it('handleApiError: the extension decides what it handles', () => {
    expect(handleApiError(418, {})).toBe(true);
    expect(handleApiError(500, {})).toBe(false);
  });

  it('signupTerms: a required checkbox and the terms dialog', async () => {
    wrap(<SignupPage />);
    const submit = screen.getByRole('button', { name: 'Create account' }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'house rules' }));
    expect(await screen.findByText('Be kind.')).toBeTruthy();
  });

  it('setup: runs once', () => {
    setupExtensions();
    setupExtensions();
    expect(fake.setup).toHaveBeenCalledTimes(1);
  });
});

// shellOverlays render inside ProjectShell, which needs a whole project to mount;
// a light check that the shell reads the slot.
describe('shellOverlays', () => {
  it('ProjectShell renders each overlay with the project id', async () => {
    // The live-update stream uses bare fetch; keep it off the network.
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));
    const { default: ProjectShell } = await import('./ProjectShell');
    const { Routes, Route } = await import('react-router-dom');
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={['/project/8/world']}>
          <Routes><Route path="/project/:projectId/:section" element={<ProjectShell />} /></Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
    await waitFor(() => expect(screen.getByText('overlay for 8')).toBeTruthy());
    vi.unstubAllGlobals();
  });
});
