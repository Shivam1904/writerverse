// SA-132: a failed load must never look like an empty project. With the backend
// down, every page loader used to swallow the error into the same empty shape a
// new project has, so pages showed "A BLANK BOOK" over the author's real work.
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadWriteData } from './pages/write/data';
import { loadBraindumps } from './pages/braindumps/data';
import { loadCharacters } from './pages/characters/data';
import { loadOutline } from './pages/outline/data';
import { loadThreads } from './pages/threads/data';
import { loadWorld } from './pages/world/data';
import { PreviewPage } from './pages/preview/PreviewPage';
import { LoadError } from './components/LoadError';

const callOp = vi.fn();
const callResource = vi.fn();
vi.mock('./gateway', () => ({
  callOp: (...a: unknown[]) => callOp(...a),
  callResource: (...a: unknown[]) => callResource(...a),
}));

const down = () => Promise.reject(new Error('Network Error'));

describe('page loaders reject when the backend is down', () => {
  beforeEach(() => {
    callOp.mockReset().mockImplementation(down);
    callResource.mockReset().mockImplementation(down);
  });

  it.each([
    ['manuscript', () => loadWriteData('1')],
    ['braindumps', () => loadBraindumps('1')],
    ['characters', () => loadCharacters('1')],
    ['outline', () => loadOutline('1')],
    ['threads', () => loadThreads('1')],
    ['world', () => loadWorld('1')],
  ])('%s', async (_name, load) => {
    await expect(load()).rejects.toThrow('Network Error');
  });

  // SA-77: one failed read of the author's content must fail the whole load,
  // not quietly drop that part (a world without its sections, threads without beats).
  it('world rejects when only its section headings fail', async () => {
    callOp.mockReset().mockImplementation((_pid: string, op: string) =>
      op === 'get_world_blocks' ? down() : Promise.resolve({}));
    await expect(loadWorld('1')).rejects.toThrow('Network Error');
  });

  it('threads reject when the threads read fails, even if the decorations load', async () => {
    callOp.mockReset().mockImplementation((_pid: string, op: string) =>
      op === 'get_threads_with_beats' ? down() : Promise.resolve({}));
    callResource.mockReset().mockResolvedValue({});
    await expect(loadThreads('1')).rejects.toThrow('Network Error');
  });

  it('still returns real data when the backend is up', async () => {
    callOp.mockReset().mockResolvedValue({ braindumps: [{ id: 1, content: 'a dragon' }] });
    const { braindumps } = await loadBraindumps('1');
    expect(braindumps).toHaveLength(1);
  });
});

describe('a failed load shows "Couldn\'t load", not the empty state', () => {
  beforeEach(() => {
    callOp.mockReset().mockImplementation(down);
  });

  it('Preview offers a retry instead of "Nothing to preview yet"', async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter initialEntries={['/project/1/preview']}>
          <Routes>
            <Route path="/project/:projectId/preview" element={<PreviewPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
    expect(await screen.findByText(/couldn.t load your manuscript/i)).toBeTruthy();
    expect(screen.queryByText(/nothing to preview yet/i)).toBeNull();

    callOp.mockResolvedValue({ grand_outline: { acts: [] } });
    fireEvent.click(screen.getByRole('button', { name: /retry/i }));
    expect(await screen.findByText(/nothing to preview yet/i)).toBeTruthy();
  });

  it('LoadError names what failed and retries', () => {
    const onRetry = vi.fn();
    render(<LoadError what="your outline" onRetry={onRetry} />);
    expect(screen.getByRole('alert').textContent).toContain('Couldn’t load your outline');
    fireEvent.click(screen.getByRole('button', { name: /retry/i }));
    expect(onRetry).toHaveBeenCalled();
  });
});
