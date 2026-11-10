import { describe, it, expect, beforeEach, vi } from 'vitest';

const rows: any[] = [];
vi.mock('./streamClient', () => ({
  fetchPendingProposals: vi.fn(async () => rows),
}));
vi.mock('../../gateway', () => ({ callOp: vi.fn(async () => ({})) }));

import { syncPendingProposals } from './syncPendingProposals';
import { useProposalStore } from '../proposal';

const row = (id: number, capability = 'create_character') => ({
  proposal_id: id,
  capability,
  args: {},
  proposal: { preview: { name: `P${id}` } },
  page: 'characters',
  source: 'chat',
  created_at: '2026-10-01T00:00:00Z',
});

describe('syncPendingProposals', () => {
  beforeEach(() => {
    rows.length = 0;
    useProposalStore.getState().clear();
  });

  it('adds a proposal created during a chat turn to the bell without a reload', async () => {
    rows.push(row(29));
    await syncPendingProposals('p1', { replace: true }); // project mount
    expect(useProposalStore.getState().pending.map((p) => p.proposalId)).toEqual([29]);

    rows.push(row(30)); // the chat turn wrote Proposal 30, no SSE event arrived
    await syncPendingProposals('p1'); // turn ended
    const ids = useProposalStore.getState().pending.map((p) => p.proposalId);
    expect(ids).toEqual([29, 30]);
    expect(useProposalStore.getState().pending[1].result).toEqual({ name: 'P30' });
  });

  it('merge keeps entries already in the store (and their handlers)', async () => {
    const onAccept = vi.fn();
    useProposalStore.getState().push({
      proposalId: 30, capability: 'create_character', result: {}, onAccept, onCancel: vi.fn(),
    });
    useProposalStore.getState().push({
      proposalId: 'local-merge-1', capability: 'merge_threads', result: {}, onAccept: vi.fn(), onCancel: vi.fn(),
    });
    rows.push(row(30));
    await syncPendingProposals('p1');
    const pending = useProposalStore.getState().pending;
    expect(pending.map((p) => p.proposalId)).toEqual([30, 'local-merge-1']);
    expect(pending[0].onAccept).toBe(onAccept);
  });

  it('replace wipes entries from a previous project', async () => {
    useProposalStore.getState().push({
      proposalId: 5, capability: 'x', result: {}, onAccept: vi.fn(), onCancel: vi.fn(),
    });
    rows.push(row(7));
    await syncPendingProposals('p2', { replace: true });
    expect(useProposalStore.getState().pending.map((p) => p.proposalId)).toEqual([7]);
  });

  it('keeps the server creation time, so the bell can tell old ones apart', async () => {
    rows.push(row(7));
    await syncPendingProposals('p1', { replace: true });
    expect(useProposalStore.getState().pending[0].createdAt).toBe(
      Date.parse('2026-10-01T00:00:00Z'),
    );
  });

  it('does nothing when the result is stale', async () => {
    rows.push(row(7));
    await syncPendingProposals('p1', { replace: true, isStale: () => true });
    expect(useProposalStore.getState().pending).toHaveLength(0);
  });
});
