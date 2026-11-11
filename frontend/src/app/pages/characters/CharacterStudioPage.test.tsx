// SA-131: the studio used to say "Character not found." while the cast was still
// loading (every cold open of a character) and when the backend was down. It
// must show a spinner while loading, "Couldn't load" + Retry on failure, and
// "Character not found." only once the cast has loaded without that id.
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CharacterStudioPage } from './CharacterStudioPage';

const callOp = vi.fn();
const callResource = vi.fn();
vi.mock('../../gateway', () => ({
  callOp: (...a: unknown[]) => callOp(...a),
  callResource: (...a: unknown[]) => callResource(...a),
}));

// Only the cast read (GET characters/) matters here; everything else can wait.
let castRead: () => Promise<unknown>;

function renderStudio(characterId = '7') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/project/1/characters/${characterId}`]}>
        <Routes>
          <Route path="/project/:projectId/characters/:characterId" element={<CharacterStudioPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('character studio before the cast has loaded', () => {
  beforeEach(() => {
    callOp.mockReset().mockImplementation(() => new Promise(() => {}));
    callResource.mockReset().mockImplementation((_pid: unknown, method: string, path: string) =>
      method === 'GET' && path === 'characters/' ? castRead() : new Promise(() => {}));
  });

  it('shows a spinner while loading, not "Character not found."', async () => {
    castRead = () => new Promise(() => {});
    renderStudio();
    expect(await screen.findByRole('status', { name: 'Loading' })).toBeTruthy();
    expect(screen.queryByText('Character not found.')).toBeNull();
  });

  it('shows "Couldn\'t load" with a Retry when the cast read fails', async () => {
    castRead = () => Promise.reject(new Error('Network Error'));
    renderStudio();
    expect((await screen.findByRole('alert')).textContent).toContain('Couldn’t load this character');
    expect(screen.queryByText('Character not found.')).toBeNull();

    // Retry re-reads the cast; a cast without this id is a real "not found".
    castRead = () => Promise.resolve({ characters: [] });
    fireEvent.click(screen.getByRole('button', { name: /retry/i }));
    expect(await screen.findByText('Character not found.')).toBeTruthy();
  });

  it('says "Character not found." once a loaded cast lacks the id', async () => {
    castRead = () => Promise.resolve({ characters: [{ id: 3, name: 'Someone else' }] });
    renderStudio('7');
    expect(await screen.findByText('Character not found.')).toBeTruthy();
  });
});

// SA-139: the studio needs three yes/no answers from the outline (any chapters?
// any beats? any mentions?). It must read the LEAN outline (no scene prose,
// SA-306) — the same cached entry the sidebar counts already hold — and never
// the manuscript.
describe('character studio reads the outline without prose', () => {
  beforeEach(() => {
    callOp.mockReset().mockImplementation(() => new Promise(() => {}));
    callResource.mockReset().mockImplementation((_pid: unknown, method: string, path: string) =>
      method === 'GET' && path === 'characters/'
        ? Promise.resolve({ characters: [{ id: 7, name: 'Mara', description: 'A pilot.' }] })
        : new Promise(() => {}));
  });

  it('asks for the outline with include_prose: false and reads no prose', async () => {
    renderStudio('7');
    expect(await screen.findAllByText(/Mara/)).not.toHaveLength(0);
    const ops = callOp.mock.calls.map((c) => c[1]);
    const outlineReads = callOp.mock.calls.filter((c) => c[1] === 'get_grand_outline');
    expect(outlineReads.length).toBeGreaterThan(0);
    for (const call of outlineReads) expect(call[2]).toEqual({ include_prose: false });
    for (const prose of ['get_chapter_docs', 'get_full_scene', 'get_scene_paragraphs', 'get_chapter_prose']) {
      expect(ops).not.toContain(prose);
    }
  });
});
