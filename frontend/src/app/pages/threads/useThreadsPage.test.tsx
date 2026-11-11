import type { ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useProposalStore } from '../../modules/proposal';
import { useThreadsPage } from './useThreadsPage';

const extractUserPlot = vi.fn(async () => ({ __proposed: true, proposalId: 7 }));

vi.mock('./data', async (importOriginal) => {
  const real = await importOriginal<typeof import('./data')>();
  return {
    ...real,
    loadThreads: vi.fn(async () => real.EMPTY_THREADS),
    loadReadiness: vi.fn(async () => ({ braindumps: 1, characters: 1 })),
    extractUserPlot: () => extractUserPlot(),
  };
});
vi.mock('../../useCounts', () => ({ useCounts: () => ({ counts: { beats: 3 }, loaded: true }) }));
vi.mock('../../modules/outline/useOutlineModel', () => ({ useOutlineModel: () => ({}) }));
vi.mock('../../modules/threadList/useBeatProposalRefetch', () => ({ useBeatProposalRefetch: () => {} }));

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <MemoryRouter>
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    </MemoryRouter>
  );
}

const pushRoughProposal = () =>
  useProposalStore.getState().push({
    proposalId: 7, capability: 'run_user_wishes_rough', result: {}, onAccept: () => {}, onCancel: () => {},
  } as any);

describe('useThreadsPage — Extract from scenes (SA-92)', () => {
  beforeEach(() => useProposalStore.getState().clear());

  // run_user_wishes_rough only QUEUES a proposal. The start screen used to latch
  // "Extracted" (disabled for good) the moment the call returned — even if the
  // author then rejected the proposal and nothing was ever extracted.
  it('is "queued" only while the proposal awaits review, then frees up', async () => {
    const { result } = renderHook(() => useThreadsPage('p1'), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.plotExtractQueued).toBe(false);

    await act(async () => {
      await result.current.handleExtractPlot();
      pushRoughProposal(); // what the gateway does with the PROPOSE result
    });
    expect(extractUserPlot).toHaveBeenCalled();
    expect(result.current.plotExtractQueued).toBe(true);

    // Author rejects (or accepts) → the proposal leaves the store → button frees.
    act(() => useProposalStore.getState().remove(7));
    expect(result.current.plotExtractQueued).toBe(false);
  });
});
