// Unsent text in a "new idea" box (the top composer, and the first-run
// brain-dump box) is kept on this device per project, so leaving the page
// before pressing Enter loses nothing — and no idea is created until Enter.
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BraindumpsPage } from './BraindumpsPage';
import { ideaDraftKey } from './useIdeaDraft';
import { TooltipProvider } from '../../ui';

const callOp = vi.fn();
vi.mock('../../gateway', () => ({
  callOp: (...a: unknown[]) => callOp(...a),
  callResource: () => Promise.resolve({}),
}));

const SAVED = 'an idea that is already saved';
const HALF = 'a lighthouse keeper who';
let existing: any[] = [];

beforeEach(() => {
  localStorage.clear();
  existing = [{ id: 7, content: SAVED }];
  callOp.mockReset().mockImplementation((_pid: unknown, op: string, args: any) => {
    if (op === 'get_braindumps') return Promise.resolve({ braindumps: existing });
    if (op === 'add_braindump') return Promise.resolve({ braindump: { id: 9, content: args.body } });
    return Promise.resolve({ braindump: { id: 9, content: 'x' } });
  });
});
afterEach(() => {
  vi.restoreAllMocks();
});

function renderPage(projectId = '1') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/project/${projectId}/braindumps`]}>
        <TooltipProvider>
          <Routes>
            <Route path="/project/:projectId/braindumps" element={<BraindumpsPage />} />
          </Routes>
        </TooltipProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const composer = async () => (await screen.findByPlaceholderText(/add an idea/i)) as HTMLInputElement;
const firstRunBox = async () => (await screen.findByLabelText('your first idea')) as HTMLTextAreaElement;
const adds = () => callOp.mock.calls.filter((c) => c[1] === 'add_braindump');
function fireBeforeUnload() {
  const e = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(e);
  return e;
}

describe('top composer draft', () => {
  it('comes back after leaving the page, and no idea was created', async () => {
    const view = renderPage();
    fireEvent.change(await composer(), { target: { value: HALF } });
    view.unmount(); // navigate away without pressing Enter

    renderPage();
    expect((await composer()).value).toBe(HALF);
    expect(adds()).toHaveLength(0);
  });

  it('is cleared once the idea is sent', async () => {
    const view = renderPage();
    const box = await composer();
    fireEvent.change(box, { target: { value: HALF } });
    fireEvent.keyDown(box, { key: 'Enter' });
    await waitFor(() => expect(adds()).toHaveLength(1));
    await waitFor(() => expect(box.value).toBe(''));
    expect(localStorage.getItem(ideaDraftKey('1')!)).toBeNull();
    view.unmount();

    renderPage();
    expect((await composer()).value).toBe('');
  });

  it("is kept per project — another project's page starts empty", async () => {
    const view = renderPage('1');
    fireEvent.change(await composer(), { target: { value: HALF } });
    view.unmount();

    renderPage('2');
    expect((await composer()).value).toBe('');
  });

  it('does not ask before closing the tab when the draft is stored', async () => {
    renderPage();
    fireEvent.change(await composer(), { target: { value: HALF } });
    expect(fireBeforeUnload().defaultPrevented).toBe(false);
  });

  it('asks before closing the tab while storage refuses the draft', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    renderPage();
    const box = await composer();
    fireEvent.change(box, { target: { value: HALF } });
    expect(box.value).toBe(HALF); // typing still works
    expect(fireBeforeUnload().defaultPrevented).toBe(true);

    fireEvent.change(box, { target: { value: '' } });
    expect(fireBeforeUnload().defaultPrevented).toBe(false);
  });

  it('still opens with an empty box when storage cannot be read', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    renderPage();
    expect((await composer()).value).toBe('');
  });
});

describe('first-run brain-dump box draft', () => {
  beforeEach(() => {
    existing = []; // an empty project opens on the first-run box
  });

  it('comes back after leaving the page, and is cleared once sent', async () => {
    const view = renderPage();
    fireEvent.change(await firstRunBox(), { target: { value: HALF } });
    view.unmount();

    renderPage();
    const box = await firstRunBox();
    expect(box.value).toBe(HALF);
    expect(adds()).toHaveLength(0);

    fireEvent.keyDown(box, { key: 'Enter' });
    await waitFor(() => expect(adds()).toHaveLength(1));
    expect(localStorage.getItem(ideaDraftKey('1')!)).toBeNull();
  });
});
