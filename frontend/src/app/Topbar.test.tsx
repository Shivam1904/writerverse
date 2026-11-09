// Topbar. The auto-watch switch was removed (wrt-105). Extension items are
// tested in extensions.test.tsx; here the build has none.
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { Topbar } from './Topbar';

vi.mock('@writerverse/extensions', () => ({ default: {} }));
vi.mock('./gateway', () => ({ callOp: vi.fn().mockResolvedValue({ title: 'Ember Lake' }) }));
vi.mock('./modules/notification', () => ({ NotificationBell: () => null }));

function renderTopbar() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter><Topbar projectId="8" /></MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('Topbar', () => {
  it('has no auto-watch switch', async () => {
    renderTopbar();
    await screen.findByText('Ember Lake');
    expect(screen.queryByText(/auto-watch/i)).toBeNull();
  });
});
