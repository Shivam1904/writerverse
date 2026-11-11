// SA-134: idea edits are autosaved while typing, flushed when the page goes
// away, and the tab asks before closing while something is unsaved.
import { act, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BraindumpsPage } from './BraindumpsPage';
import { IDEA_AUTOSAVE_MS } from './useIdeaAutosave';
import { TooltipProvider } from '../../ui';

const callOp = vi.fn();
vi.mock('../../gateway', () => ({
  callOp: (...a: unknown[]) => callOp(...a),
  callResource: () => Promise.resolve({}),
}));

const SAVED = 'a dragon';

let failUpdates = false;
beforeEach(() => {
  failUpdates = false;
  callOp.mockReset().mockImplementation((_pid: unknown, op: string, args: any) => {
    if (op === 'get_braindumps') return Promise.resolve({ braindumps: [{ id: 7, content: SAVED }] });
    if (op === 'update_braindump') {
      if (failUpdates) return Promise.reject(new Error('500'));
      return Promise.resolve({ braindump: { id: 7, content: args.body } });
    }
    if (op === 'add_braindump') return Promise.resolve({ braindump: { id: 9, content: args.body } });
    return Promise.resolve({ braindump: { id: 9, content: 'x' } });
  });
});
afterEach(() => {
  vi.useRealTimers();
});

async function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/project/1/braindumps']}>
        <TooltipProvider>
          <Routes>
            <Route path="/project/:projectId/braindumps" element={<BraindumpsPage />} />
          </Routes>
        </TooltipProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  const box = (await screen.findByDisplayValue(SAVED)) as HTMLTextAreaElement;
  vi.useFakeTimers(); // after the load, so the query resolves normally
  return { view, box };
}

const calls = (op: string) => callOp.mock.calls.filter((c) => c[1] === op);
const flushPromises = () => act(async () => {
  await Promise.resolve();
});
const advance = (ms: number) => act(async () => {
  vi.advanceTimersByTime(ms);
});
function fireBeforeUnload() {
  const e = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(e);
  return e;
}

describe('idea autosave', () => {
  it('saves once, 1.5 s after typing stops — not per keystroke, and never re-tags', async () => {
    const { box } = await renderPage();
    fireEvent.change(box, { target: { value: 'a dragon w' } });
    await advance(500);
    fireEvent.change(box, { target: { value: 'a dragon wh' } });
    await advance(500);
    fireEvent.change(box, { target: { value: 'a dragon who hoards maps' } });
    await advance(IDEA_AUTOSAVE_MS - 1);
    expect(calls('update_braindump')).toHaveLength(0);

    await advance(1);
    expect(calls('update_braindump')).toEqual([['1', 'update_braindump', { id: 7, body: 'a dragon who hoards maps' }]]);
    expect(calls('annotate_braindump')).toHaveLength(0);
  });

  it('saves right away when the page unmounts (route change, no blur)', async () => {
    const { view, box } = await renderPage();
    fireEvent.change(box, { target: { value: 'a dragon who hoards maps' } });
    view.unmount();
    expect(calls('update_braindump')).toEqual([['1', 'update_braindump', { id: 7, body: 'a dragon who hoards maps' }]]);
  });

  it('creates a typed new idea when the page unmounts', async () => {
    const { view, box } = await renderPage();
    act(() => box.focus());
    fireEvent.keyDown(box, { key: 'Enter' }); // new empty row below
    await advance(0);
    const fresh = screen.getAllByPlaceholderText('an idea…')[1] as HTMLTextAreaElement;
    fireEvent.change(fresh, { target: { value: 'a map that lies' } });
    view.unmount();
    expect(calls('add_braindump')).toHaveLength(1);
    expect(calls('add_braindump')[0][2]).toMatchObject({ body: 'a map that lies' });
  });

  it('does not create an empty new idea when the page unmounts', async () => {
    const { view, box } = await renderPage();
    act(() => box.focus());
    fireEvent.keyDown(box, { key: 'Enter' });
    await advance(0);
    expect(screen.getAllByPlaceholderText('an idea…')).toHaveLength(2);
    view.unmount();
    expect(calls('add_braindump')).toHaveLength(0);
    expect(calls('update_braindump')).toHaveLength(0);
  });

  it('asks before closing the tab only while an edit is unsaved', async () => {
    const { box } = await renderPage();
    expect(fireBeforeUnload().defaultPrevented).toBe(false);
    fireEvent.change(box, { target: { value: 'a dragon who hoards maps' } });
    expect(fireBeforeUnload().defaultPrevented).toBe(true);
    await advance(IDEA_AUTOSAVE_MS);
    await flushPromises();
    expect(fireBeforeUnload().defaultPrevented).toBe(false);
  });

  it('keeps the text and stays unsaved when the save fails, then retries on blur', async () => {
    failUpdates = true;
    const { box } = await renderPage();
    act(() => box.focus());
    fireEvent.change(box, { target: { value: 'a dragon who hoards maps' } });
    await advance(IDEA_AUTOSAVE_MS);
    await flushPromises();
    expect(calls('update_braindump')).toHaveLength(1);
    expect(box.value).toBe('a dragon who hoards maps');
    expect(fireBeforeUnload().defaultPrevented).toBe(true);

    failUpdates = false;
    act(() => box.blur());
    await flushPromises();
    expect(calls('update_braindump')).toHaveLength(2);
    expect(screen.getByDisplayValue('a dragon who hoards maps')).toBeTruthy();
    expect(fireBeforeUnload().defaultPrevented).toBe(false);
  });
});
