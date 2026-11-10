// SA-126: archiving a notification is plain REST (not the gateway), so a failed
// archive must still be announced, not just silently put the card back.
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useProblemStore } from '../receipt/receiptStore';
import { useNotifications } from './useNotifications';

const { get, post } = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('axios', () => ({ default: { get, post } }));

const card = { id: 3, status: 'active', title: 'Scene 4 drifted' };

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/project/8']}>
        <Routes><Route path="/project/:projectId" element={children} /></Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  get.mockReset(); post.mockReset();
  get.mockResolvedValue({ data: { active: [card], archived: [] } });
  useProblemStore.setState({ problems: [] });
});

describe('useNotifications archive', () => {
  it('a failed archive puts the card back and shows a problem toast', async () => {
    post.mockRejectedValue(new Error('Network Error'));
    const { result } = renderHook(() => useNotifications(), { wrapper });
    await waitFor(() => expect(result.current.active).toHaveLength(1));

    act(() => result.current.archive(3));

    await waitFor(() => expect(useProblemStore.getState().problems.map((p) => p.what))
      .toEqual(["Couldn't archive the notification. Please try again."]));
    expect(result.current.active.map((n) => n.id)).toEqual([3]);
  });

  it('a successful archive shows no problem', async () => {
    post.mockResolvedValue({ data: {} });
    const { result } = renderHook(() => useNotifications(), { wrapper });
    await waitFor(() => expect(result.current.active).toHaveLength(1));
    act(() => result.current.archive(3));
    await waitFor(() => expect(post).toHaveBeenCalled());
    expect(useProblemStore.getState().problems).toEqual([]);
  });
});
