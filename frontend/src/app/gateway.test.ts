import axios from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { callOp, callResource } from './gateway';
import { useProblemStore } from './modules/receipt/receiptStore';
import { useProposalStore } from './modules/proposal';

// A fake extension that takes over one error code (the handleApiError slot).
vi.mock('@writerverse/extensions', () => ({
  default: { handleApiError: (_status: number, body: any) => body?.code === 'handled_by_extension' },
}));

// SA-291: a failed write through the gateway shows a red problem toast naming
// what failed; successful writes and failed reads don't.

const request = vi.spyOn(axios, 'request');
const fail = (status: number) => Object.assign(new Error('boom'), { response: { status } });
const ok = (data: unknown = {}) => ({ status: 200, data, headers: {} });
const problems = () => useProblemStore.getState().problems;

beforeEach(() => {
  useProblemStore.setState({ problems: [] });
  request.mockReset();
});
afterEach(() => vi.useRealTimers());

describe('gateway problem toasts', () => {
  it('a failed op write shows a problem naming the op', async () => {
    request.mockRejectedValueOnce(fail(500));
    await expect(callOp(1, 'update_scene', { scene_id: '4' })).rejects.toThrow();
    expect(problems()).toHaveLength(1);
    expect(problems()[0].what).toMatch(/Couldn't update scene/);
  });

  it('a failed resource write shows a problem naming the resource', async () => {
    request.mockRejectedValueOnce(fail(400));
    await expect(callResource(1, 'PATCH', 'characters/12/', { name: 'x' })).rejects.toThrow();
    expect(problems().map((p) => p.what)).toEqual([
      "Couldn't update characters. Please try again.",
    ]);
  });

  it('a 402 refusal shows the server message, not the generic text', async () => {
    const msg = "You've reached this month's AI usage limit. It resets next month.";
    request.mockRejectedValueOnce(Object.assign(new Error('boom'), {
      response: { status: 402, data: { code: 'some_refusal', error: msg } },
    }));
    await expect(callOp(1, 'run_ai', {})).rejects.toThrow();
    expect(problems().map((p) => p.what)).toEqual([msg]);
  });

  it('an error the extension handles shows no toast', async () => {
    request.mockRejectedValueOnce(Object.assign(new Error('boom'), {
      response: { status: 402, data: { code: 'handled_by_extension', error: 'Handled' } },
    }));
    await expect(callOp(1, 'run_ai', {})).rejects.toThrow();
    expect(problems()).toEqual([]);
  });

  it('a successful write shows no problem', async () => {
    request.mockResolvedValueOnce(ok());
    await callOp(1, 'update_scene', { scene_id: '4' });
    expect(problems()).toEqual([]);
  });

  it('failed reads (GET and get_ ops) show no problem', async () => {
    request.mockRejectedValue(fail(404)); // a 4xx isn't retried, so no backoff wait
    await expect(callResource(1, 'GET', 'characters/')).rejects.toThrow();
    await expect(callOp(1, 'get_scene', { scene_id: '4' })).rejects.toThrow();
    expect(problems()).toEqual([]);
  });

  it('the same failure does not stack, and a later success does not hide it', async () => {
    request.mockRejectedValueOnce(fail(500)).mockRejectedValueOnce(fail(500));
    await expect(callOp(1, 'update_scene', { scene_id: '4' })).rejects.toThrow();
    await expect(callOp(1, 'update_scene', { scene_id: '4' })).rejects.toThrow();
    expect(problems()).toHaveLength(1);
    // Scene 5 saving fine says nothing about scene 4: the toast stays.
    request.mockResolvedValueOnce(ok());
    await callOp(1, 'update_scene', { scene_id: '5' });
    expect(problems()).toHaveLength(1);
  });

  it('stays until dismissed', async () => {
    vi.useFakeTimers();
    request.mockRejectedValueOnce(fail(500));
    await expect(callOp(1, 'delete_beat')).rejects.toThrow();
    vi.advanceTimersByTime(60_000);
    expect(problems()).toHaveLength(1);
    useProblemStore.getState().remove(problems()[0].id);
    expect(problems()).toEqual([]);
  });
});

// SA-219: green inline beats and the chat banner accept/reject straight through
// callOp, without the card's own handlers. The bell's card must still go away.
describe('gateway keeps the proposal store in sync', () => {
  const pending = () => useProposalStore.getState().pending;
  const seed = (id: number) => useProposalStore.getState().push({
    proposalId: id, capability: 'insert_thread_beat', result: {}, onAccept: () => {}, onCancel: () => {},
  });
  const conflict = (code: string, extra = {}) =>
    Object.assign(new Error('409'), { response: { status: 409, data: { code, ...extra } } });

  beforeEach(() => useProposalStore.getState().clear());

  it('a successful accept from any surface drops the card (string id vs number id)', async () => {
    seed(7);
    request.mockResolvedValueOnce(ok());
    await callOp(1, 'accept_proposal', { proposal_id: '7' }, 'Threads');
    expect(pending()).toEqual([]);
  });

  it('a successful reject drops the card too', async () => {
    seed(8);
    request.mockResolvedValueOnce(ok());
    await callOp(1, 'reject_proposal', { proposal_id: '8' }, 'Outline');
    expect(pending()).toEqual([]);
  });

  it('a failed accept keeps the card', async () => {
    seed(9);
    request.mockRejectedValueOnce(fail(500));
    await expect(callOp(1, 'accept_proposal', { proposal_id: '9' })).rejects.toThrow();
    expect(pending()).toHaveLength(1);
  });

  it('a failed accept shows the server\'s reason, not a generic retry (wrt-106)', async () => {
    seed(12);
    const reason = "Couldn't apply this suggestion, so nothing changed.";
    request.mockRejectedValueOnce(
      Object.assign(new Error('400'), { response: { status: 400, data: { error: reason } } }));
    await expect(callOp(1, 'accept_proposal', { proposal_id: '12' })).rejects.toThrow();
    expect(problems().map((p) => p.what)).toEqual([reason]);
    expect(pending()).toHaveLength(1);
  });

  it('an already-closed proposal drops its stale card', async () => {
    seed(10);
    request.mockRejectedValueOnce(conflict('proposal_not_pending'));
    await expect(callOp(1, 'accept_proposal', { proposal_id: '10' })).rejects.toThrow();
    expect(pending()).toEqual([]);
  });

  it('a stale accept keeps the card and puts the conflicts on it (SA-209)', async () => {
    seed(11);
    const conflicts = [{ field: 'text', was: 'a', current: 'b', proposed: 'c' }];
    request.mockRejectedValueOnce(conflict('proposal_stale', { conflicts }));
    await expect(callOp(1, 'accept_proposal', { proposal_id: '11' })).rejects.toThrow();
    expect(pending()).toHaveLength(1);
    expect(pending()[0].conflicts).toEqual(conflicts);
  });
});
