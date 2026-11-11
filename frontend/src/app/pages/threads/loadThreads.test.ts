// SA-88: the Threads data loads every thread's beats in ONE read, however many
// threads there are (it used to be one get_thread call per thread).
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { callOp } = vi.hoisted(() => ({ callOp: vi.fn() }));
vi.mock('../../gateway', () => ({ callOp }));

import { loadThreads } from './data';

const thread = (n: number, beats: any[] = []) => ({
  thread_id: `t${n}`, found: true, name: `Thread ${n}`,
  scope: { type: 'story', name: 'the whole story' }, color: '',
  source: null, template_id: null, beats,
});

const calls = (op: string) => callOp.mock.calls.filter((c) => c[1] === op).length;

beforeEach(() => {
  callOp.mockReset();
});

describe('loadThreads', () => {
  it('reads all threads with one call, not one per thread', async () => {
    const threads = Array.from({ length: 12 }, (_, i) => thread(i + 1));
    callOp.mockImplementation(async (_pid: unknown, op: string) =>
      op === 'get_threads_with_beats' ? { threads } : {});

    const res = await loadThreads('p1');

    expect(res.threads).toHaveLength(12);
    expect(calls('get_threads_with_beats')).toBe(1);
    expect(calls('get_thread')).toBe(0);
    expect(calls('get_plot_threads')).toBe(0);
  });

  it('folds each beat and its pending proposal into the editor shape', async () => {
    const beats = [
      { index: 0, id: 'b1', kind: 'text', actual_value: 'She doubts', proposal: 9, proposed_value: 'She is sure', proposed_kind: 'text' },
      { index: 1, id: null, insert: true, kind: 'text', actual_value: '', proposal: 10, proposed_value: 'A ghost', proposed_kind: 'text' },
    ];
    callOp.mockImplementation(async (_pid: unknown, op: string) =>
      op === 'get_threads_with_beats' ? { threads: [thread(1, beats)] } : {});

    const { _rawThreads } = await loadThreads('p1');

    expect(_rawThreads[0]).toMatchObject({ id: 't1', title: 'Thread 1' });
    expect(_rawThreads[0].items).toEqual([
      { id: 'b1', text: 'She doubts', kind: 'text', proposal: { id: 9, text: 'She is sure', kind: 'text' }, insert: undefined },
      { id: null, text: '', kind: 'text', proposal: { id: 10, text: 'A ghost', kind: 'text' }, insert: true },
    ]);
  });
});
