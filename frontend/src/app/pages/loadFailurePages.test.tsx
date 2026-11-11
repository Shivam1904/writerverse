// SA-132: with the backend down, each TanStack-backed page shows "Couldn't
// load" + Retry — never its first-run screen. The first-run components are
// stubbed with a marker so the test checks the page's branching, not their UI.
import type { ReactElement } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BraindumpsPage } from './braindumps/BraindumpsPage';
import { CharactersPage } from './characters/CharactersPage';
import { ThreadsPage } from './threads/ThreadsPage';
import { OutlinePage } from './outline/OutlinePage';

const callOp = vi.fn();
const callResource = vi.fn();
vi.mock('../gateway', () => ({
  callOp: (...a: unknown[]) => callOp(...a),
  callResource: (...a: unknown[]) => callResource(...a),
}));

const FIRST_RUN = 'FIRST-RUN SCREEN';
vi.mock('./braindumps/components/BraindumpsInit', () => ({ BraindumpsInit: () => <div>{FIRST_RUN}</div> }));
vi.mock('./characters/components/PeopleInit', () => ({ PeopleInit: () => <div>{FIRST_RUN}</div> }));
vi.mock('./threads/components/ThreadsStart', () => ({ ThreadsStart: () => <div>{FIRST_RUN}</div> }));
vi.mock('./outline/components/OutlineScaffoldPickerFull', () => ({ OutlineScaffoldPickerFull: () => <div>{FIRST_RUN}</div> }));

const down = () => Promise.reject(new Error('Network Error'));
// An empty-but-reachable project: every read answers with nothing.
const empty = () => Promise.resolve({});

function renderPage(path: string, page: ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/project/1/${path}`]}>
        <Routes>
          <Route path={`/project/:projectId/${path}`} element={page} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('a failed load shows "Couldn\'t load" + Retry, never the first-run screen', () => {
  beforeEach(() => {
    callOp.mockReset().mockImplementation(down);
    callResource.mockReset().mockImplementation(down);
  });

  it.each([
    ['braindumps', <BraindumpsPage />, /couldn.t load your braindumps/i],
    ['characters', <CharactersPage />, /couldn.t load your characters/i],
    ['plot-threads', <ThreadsPage />, /couldn.t load your plot threads/i],
    ['outline', <OutlinePage />, /couldn.t load your outline/i],
  ])('%s', async (path, page, message) => {
    renderPage(path, page);
    expect(await screen.findByText(message)).toBeTruthy();
    expect(screen.queryByText(FIRST_RUN)).toBeNull();

    // Backend back (and this project really is empty) → Retry refetches and
    // the page moves on to its normal first-run screen.
    callOp.mockImplementation(empty);
    callResource.mockImplementation(empty);
    fireEvent.click(screen.getByRole('button', { name: /^retry$/i }));
    expect(await screen.findByText(FIRST_RUN)).toBeTruthy();
    expect(screen.queryByText(message)).toBeNull();
  });
});

// SA-154: "still loading" is not "empty". While the first load is in flight the
// page shows a spinner; the first-run takeover must not flash for a returning
// author whose data simply hasn't arrived yet.
describe('a page still loading shows a spinner, never the first-run screen', () => {
  let answer: (v: unknown) => void;

  beforeEach(() => {
    // Every read hangs until the test answers it.
    const pending = new Promise((resolve) => { answer = resolve; });
    callOp.mockReset().mockImplementation(() => pending);
    callResource.mockReset().mockImplementation(() => pending);
  });

  it.each([
    ['characters', <CharactersPage />],
    ['plot-threads', <ThreadsPage />],
    ['outline', <OutlinePage />],
  ])('%s', async (path, page) => {
    renderPage(path, page);
    expect(await screen.findByRole('status', { name: /loading/i })).toBeTruthy();
    expect(screen.queryByText(FIRST_RUN)).toBeNull();

    // The load lands and the project really is empty → only now the first-run screen.
    answer({});
    expect(await screen.findByText(FIRST_RUN)).toBeTruthy();
    expect(screen.queryByRole('status', { name: /loading/i })).toBeNull();
  });
});
