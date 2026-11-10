import { describe, it, expect, beforeEach } from 'vitest';
import { makeProposalHandlers } from './proposalHandlers';
import { useProposalStore } from './useProposalStore';

const flush = () => new Promise((r) => setTimeout(r, 0));

function seed(id: number, h: ReturnType<typeof makeProposalHandlers>) {
  useProposalStore.getState().push({ proposalId: id, capability: 'x', result: {}, ...h });
}

describe('makeProposalHandlers', () => {
  beforeEach(() => useProposalStore.getState().clear());

  it('removes the card when accept succeeds', async () => {
    const h = makeProposalHandlers(1, async () => ({}));
    seed(1, h);
    h.onAccept();
    await flush();
    expect(useProposalStore.getState().pending).toHaveLength(0);
  });

  it('keeps the card with an error when accept fails, and retry can succeed', async () => {
    let fail = true;
    const h = makeProposalHandlers(2, async () => { if (fail) throw new Error('net'); });
    seed(2, h);
    h.onAccept();
    await flush();
    expect(useProposalStore.getState().pending[0].error).toBe('accept');
    fail = false;
    useProposalStore.getState().pending[0].onAccept();
    await flush();
    expect(useProposalStore.getState().pending).toHaveLength(0);
  });

  it('keeps the card with an error when reject fails', async () => {
    const h = makeProposalHandlers(3, async () => { throw new Error('net'); });
    seed(3, h);
    h.onCancel();
    await flush();
    expect(useProposalStore.getState().pending[0].error).toBe('reject');
  });
});

describe('makeProposalHandlers stale accept (SA-209)', () => {
  beforeEach(() => useProposalStore.getState().clear());
  const staleErr = {
    response: { status: 409, data: { code: 'proposal_stale', conflicts: [{ field: 'text', was: 'a', current: 'b', proposed: 'c' }] } },
  };

  it("keeps the card with the conflicts, and Use AI's retries with force", async () => {
    const calls: unknown[] = [];
    const h = makeProposalHandlers(4, async (cap, extra) => {
      calls.push([cap, extra]);
      if (!extra?.force) throw staleErr;
    });
    seed(4, h);
    h.onAccept();
    await flush();
    const p = useProposalStore.getState().pending[0];
    expect(p.conflicts?.[0].current).toBe('b');
    expect(p.error).toBeUndefined();
    h.onForceAccept();
    await flush();
    expect(calls[1]).toEqual(['accept_proposal', { force: true }]);
    expect(useProposalStore.getState().pending).toHaveLength(0);
  });

  it('drops the card when the proposal was already closed', async () => {
    const h = makeProposalHandlers(5, async () => {
      throw { response: { status: 409, data: { code: 'proposal_not_pending' } } };
    });
    seed(5, h);
    h.onAccept();
    await flush();
    expect(useProposalStore.getState().pending).toHaveLength(0);
  });
});
