// SA-117: when the backend rejects an add, the optimistic card must disappear
// (no phantom card that looks saved but never is) and the composer keeps the
// author's text so nothing is lost.
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BraindumpsPage } from './BraindumpsPage';
import { TooltipProvider } from '../../ui';
import { ReceiptToasts } from '../../modules/receipt/ReceiptToasts';

const callOp = vi.fn();
vi.mock('../../gateway', () => ({
  callOp: (...a: unknown[]) => callOp(...a),
  callResource: () => Promise.resolve({}),
}));

const SAVED = 'an idea that is already saved';
const TYPED = 'a brand new idea the backend will refuse';

describe('a failed add leaves no phantom card', () => {
  beforeEach(() => {
    callOp.mockReset().mockImplementation((_pid: unknown, op: string) => {
      if (op === 'get_braindumps') return Promise.resolve({ braindumps: [{ id: 'bd-1', content: SAVED }] });
      if (op === 'add_braindump') return Promise.reject(new Error('500'));
      return Promise.resolve({});
    });
  });

  it('removes the optimistic card and keeps the text in the composer', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
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

    const composer = (await screen.findByPlaceholderText(/add an idea/i)) as HTMLInputElement;
    fireEvent.change(composer, { target: { value: TYPED } });
    fireEvent.keyDown(composer, { key: 'Enter' });

    await waitFor(() => expect(callOp).toHaveBeenCalledWith('1', 'add_braindump', expect.anything()));
    // The only card left is the saved one; the failed add is not on screen as a card.
    await waitFor(() => expect(screen.getAllByPlaceholderText('an idea…')).toHaveLength(1));
    expect(screen.getByDisplayValue(SAVED)).toBeTruthy();
    // Text is still in the composer, not lost.
    expect(composer.value).toBe(TYPED);
  });
});

// SA-158 / SA-123: the annotator answers 200 with ai_data.status "failed" when
// the AI call fails. The idea must say so and offer a re-run, not look untouched.
describe('a failed AI tagging is visible and can be re-run', () => {
  const ADDED = 'a lighthouse keeper who forgets one day a year';
  let annotateCalls = 0;
  beforeEach(() => {
    annotateCalls = 0;
    callOp.mockReset().mockImplementation((_pid: unknown, op: string) => {
      if (op === 'get_braindumps') return Promise.resolve({ braindumps: [{ id: 'bd-1', content: SAVED }] });
      if (op === 'add_braindump') return Promise.resolve({ braindump: { id: 9, content: ADDED } });
      if (op === 'annotate_braindump') {
        annotateCalls += 1;
        // First run fails inside a 200; the re-run works and tags the idea.
        const ai_data = annotateCalls === 1 ? { status: 'failed', error: 'LLM 500' } : { status: 'ok' };
        return Promise.resolve({ braindump: { id: 9, content: ADDED, tags: annotateCalls === 1 ? [] : ['plot'], ai_data } });
      }
      return Promise.resolve({});
    });
  });

  it('shows "Couldn\'t tag this idea" and Try again re-runs the annotation', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
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

    const composer = await screen.findByPlaceholderText(/add an idea/i);
    fireEvent.change(composer, { target: { value: ADDED } });
    fireEvent.keyDown(composer, { key: 'Enter' });

    expect(await screen.findByText(/Couldn't tag this idea/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));

    await waitFor(() => expect(annotateCalls).toBe(2));
    expect(callOp).toHaveBeenLastCalledWith('1', 'annotate_braindump', { id: 9 });
    await waitFor(() => expect(screen.queryByText(/Couldn't tag this idea/)).toBeNull());
  });
});

// wrt-117: a new idea shows the tagging placeholder from the first frame,
// before the save even returns, and it goes once the tags land.
describe('tagging placeholder on a new idea', () => {
  const ADDED = 'a girl who can hear the sea in any shell';
  let finishAdd: (v: unknown) => void = () => {};
  beforeEach(() => {
    callOp.mockReset().mockImplementation((_pid: unknown, op: string) => {
      if (op === 'get_braindumps') return Promise.resolve({ braindumps: [{ id: 'bd-1', content: SAVED }] });
      if (op === 'add_braindump') return new Promise((r) => { finishAdd = r; });
      if (op === 'annotate_braindump') {
        return Promise.resolve({ braindump: { id: 9, content: ADDED, tags: ['plot'], ai_data: { status: 'ok' } } });
      }
      return Promise.resolve({});
    });
  });

  it('shows "is tagging…" at once and clears it after tagging', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
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

    const composer = await screen.findByPlaceholderText(/add an idea/i);
    fireEvent.change(composer, { target: { value: ADDED } });
    fireEvent.keyDown(composer, { key: 'Enter' });

    expect(await screen.findByText(/is tagging…/)).toBeTruthy();
    finishAdd({ braindump: { id: 9, content: ADDED } });
    await waitFor(() => expect(screen.queryByText(/is tagging…/)).toBeNull());
  });
});

// SA-302: deleting an idea shows "Deleted — Undo"; Undo brings the idea back.
describe('delete shows an Undo toast', () => {
  beforeEach(() => {
    callOp.mockReset().mockImplementation((_pid: unknown, op: string) => {
      if (op === 'get_braindumps') return Promise.resolve({ braindumps: [{ id: 7, content: SAVED }] });
      if (op === 'delete_braindump') return Promise.resolve({ deleted: true, id: 7 });
      if (op === 'undelete_braindump') return Promise.resolve({ braindump: { id: 7, content: SAVED } });
      return Promise.resolve({});
    });
  });

  it('removes the card, then Undo restores it', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={['/project/1/braindumps']}>
          <TooltipProvider>
            <Routes>
              <Route path="/project/:projectId/braindumps" element={<BraindumpsPage />} />
            </Routes>
            <ReceiptToasts />
          </TooltipProvider>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await screen.findByDisplayValue(SAVED);
    fireEvent.click(screen.getByLabelText('Delete idea'));

    await waitFor(() => expect(callOp).toHaveBeenCalledWith('1', 'delete_braindump', { id: 7 }));
    await waitFor(() => expect(screen.queryByDisplayValue(SAVED)).toBeNull());
    expect(screen.getByText('Deleted')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    await waitFor(() => expect(callOp).toHaveBeenCalledWith('1', 'undelete_braindump', { id: 7 }));
    expect(await screen.findByDisplayValue(SAVED)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull();
  });
});

// wrt-28: editing never re-tags. An idea whose text changed since it was tagged
// offers Re-tag; it saves the text first, then re-runs tagging, and the new tags
// replace the old ones.
describe('Re-tag an edited idea', () => {
  const OLD = 'Tony fights Steve';
  const NEW = 'Nat fights Steve';
  const tagged = (text: string, who: string) => ({
    status: 'ok',
    meta: { source_text: text },
    phrases: [{ text, entities: [{ kind: 'char', name: who }], tags: [] }],
    entities: [{ kind: 'char', name: who, tags: [] }],
    tags: [],
  });
  beforeEach(() => {
    callOp.mockReset().mockImplementation((_pid: unknown, op: string) => {
      if (op === 'get_braindumps') {
        return Promise.resolve({ braindumps: [{ id: 5, content: NEW, tags: ['char[Tony]'], ai_data: tagged(OLD, 'Tony') }] });
      }
      if (op === 'update_braindump') {
        return Promise.resolve({ braindump: { id: 5, content: NEW, tags: ['char[Tony]'], ai_data: tagged(OLD, 'Tony') } });
      }
      if (op === 'annotate_braindump') {
        return Promise.resolve({ braindump: { id: 5, content: NEW, tags: ['char[Nat]'], ai_data: tagged(NEW, 'Nat') } });
      }
      return Promise.resolve({});
    });
  });

  it('saves, re-tags, and the old tag is gone', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
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

    expect(await screen.findByText(/Text changed since tagging/)).toBeTruthy();
    expect(callOp).not.toHaveBeenCalledWith('1', 'annotate_braindump', expect.anything());
    expect(screen.getAllByText('Tony').length).toBeGreaterThan(0); // card tag + side rail

    fireEvent.click(screen.getByRole('button', { name: 'Re-tag' }));

    await waitFor(() => expect(callOp).toHaveBeenCalledWith('1', 'annotate_braindump', { id: 5 }));
    const ops = callOp.mock.calls.map((c) => c[1]);
    expect(ops.indexOf('update_braindump')).toBeLessThan(ops.indexOf('annotate_braindump'));
    expect(callOp).toHaveBeenCalledWith('1', 'update_braindump', { id: 5, body: NEW });
    expect((await screen.findAllByText('Nat')).length).toBeGreaterThan(0);
    expect(screen.queryAllByText('Tony')).toHaveLength(0); // gone from card and rail
    expect(screen.queryByText(/Text changed since tagging/)).toBeNull();
  });
});
