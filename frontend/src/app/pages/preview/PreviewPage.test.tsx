// SA-283: the Preview page renders without console errors (empty project, and a
// manuscript with formatting and @mentions).
// SA-308: Preview reads the lean outline, then prose ONE CHAPTER AT A TIME
// (get_chapter_docs) as the reader scrolls — never the whole manuscript.
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PreviewPage } from './PreviewPage';

const callOp = vi.fn();
vi.mock('../../gateway', () => ({
  callOp: (...a: unknown[]) => callOp(...a),
}));

function renderPreview() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/project/1/preview']}>
        <Routes>
          <Route path="/project/:projectId/preview" element={<PreviewPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const p = (...content: unknown[]) => ({ type: 'paragraph', content });
const txt = (text: string) => p({ type: 'text', text });
const doc = (...content: unknown[]) => ({ type: 'doc', content });

/** A lean outline chapter (no prose) + the prose get_chapter_docs returns for it. */
type Ch = { id: string; words: number; prose?: unknown[] };
const chapter = (id: string, words: number, ...prose: unknown[]): Ch => ({ id, words, prose });

/** Serve the lean outline and per-chapter prose for `chapters`. */
function serve(chapters: Ch[], { failChapter }: { failChapter?: string } = {}) {
  callOp.mockImplementation(async (_pid: unknown, op: string, args: any) => {
    if (op === 'get_grand_outline') {
      return {
        grand_outline: {
          acts: [{
            id: 'a1',
            chapters: chapters.map((ch) => ({
              id: ch.id,
              text: `Title ${ch.id}`,
              scenes: [{ id: `${ch.id}-s1`, text: 'Scene', words: ch.words }],
            })),
          }],
        },
      };
    }
    if (op === 'get_chapter_docs') {
      if (args.chapter_id === failChapter) throw new Error('offline');
      const ch = chapters.find((c) => c.id === args.chapter_id)!;
      return { chapter_id: ch.id, found: true, scenes: [{ id: `${ch.id}-s1`, content: doc(...(ch.prose ?? [])), rev: 1 }] };
    }
    throw new Error(`unexpected op ${op}`);
  });
}

const outlineArgs = () => callOp.mock.calls.filter((c) => c[1] === 'get_grand_outline').map((c) => c[2]);
const chapterRequests = () =>
  callOp.mock.calls.filter((c) => c[1] === 'get_chapter_docs').map((c) => (c[2] as { chapter_id: string }).chapter_id);

describe('Preview logs no console errors', () => {
  let errors: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    callOp.mockReset();
    errors = vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => errors.mockRestore());

  it('on an empty project', async () => {
    callOp.mockResolvedValue({ grand_outline: { acts: [] } });
    renderPreview();
    expect(await screen.findByText(/nothing to preview yet/i)).toBeTruthy();
    expect(errors).not.toHaveBeenCalled();
  });

  it('on a manuscript with marks, mentions, lists and scene breaks', async () => {
    serve([chapter('c1', 10,
      p({ type: 'text', text: 'Hello ' }, { type: 'mention', attrs: { label: 'Ana' } }, { type: 'text', text: '!', marks: [{ type: 'bold' }, { type: 'italic' }] }),
      { type: 'horizontalRule' },
      { type: 'bulletList', content: [{ type: 'listItem', content: [txt('a')] }, { type: 'listItem', content: [txt('b')] }] },
      txt('Second paragraph.'),
    )]);
    renderPreview();
    expect(await screen.findByText('Second paragraph.')).toBeTruthy();
    expect(screen.getByText(/Ana/)).toBeTruthy();
    expect(errors).not.toHaveBeenCalled();
  });
});

describe('Preview loads prose a chapter at a time (SA-308)', () => {
  beforeEach(() => { callOp.mockReset(); });
  afterEach(() => { vi.unstubAllGlobals(); });

  const book = () => [
    chapter('c1', 5, txt('One.')),
    chapter('c2', 0), // planned, nothing written
    chapter('c3', 5, txt('Three.')),
    chapter('c4', 5, txt('Four.')),
    chapter('c5', 5, txt('Five.')),
  ];

  it('reads the lean outline and only the first chapters with prose', async () => {
    serve(book());
    renderPreview();
    expect(await screen.findByText('Three.')).toBeTruthy();
    expect(outlineArgs()).toEqual([{ include_prose: false }]);
    // c2 has no words → never requested; c4/c5 wait for the reader.
    expect(chapterRequests()).toEqual(['c1', 'c3']);
    expect(screen.queryByText('Four.')).toBeNull();
    expect(screen.queryByText('Title c2')).toBeNull();
  });

  it('loads the next chapter when the reader asks to keep reading', async () => {
    serve(book());
    renderPreview();
    fireEvent.click(await screen.findByRole('button', { name: /keep reading/i }));
    expect(await screen.findByText('Four.')).toBeTruthy();
    expect(chapterRequests()).toEqual(['c1', 'c3', 'c4']);
    fireEvent.click(await screen.findByRole('button', { name: /keep reading/i }));
    expect(await screen.findByText('Five.')).toBeTruthy();
    // The end of the book: nothing more to fetch.
    expect(screen.queryByRole('button', { name: /keep reading/i })).toBeNull();
  });

  it('loads the next chapter when the reader scrolls near the end', async () => {
    const observers: { cb: IntersectionObserverCallback }[] = [];
    vi.stubGlobal('IntersectionObserver', class {
      cb: IntersectionObserverCallback;
      constructor(cb: IntersectionObserverCallback) { this.cb = cb; observers.push(this); }
      observe() {}
      disconnect() {}
    });
    serve(book());
    renderPreview();
    await screen.findByText('Three.');
    await waitFor(() => expect(observers.length).toBeGreaterThan(0));
    expect(chapterRequests()).toEqual(['c1', 'c3']);
    act(() => {
      observers.at(-1)!.cb([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver);
    });
    expect(await screen.findByText('Four.')).toBeTruthy();
    expect(chapterRequests()).toEqual(['c1', 'c3', 'c4']);
  });

  it('hides pending AI prose, and a chapter left with nothing readable', async () => {
    const aiInsert = { type: 'paragraph', attrs: { refs: [{ entityType: 'ai-generated' }] }, content: [{ type: 'text', text: 'AI wrote this.' }] };
    serve([
      chapter('c1', 5, txt('Mine.'), aiInsert),
      chapter('c2', 5, aiInsert),
    ]);
    renderPreview();
    expect(await screen.findByText('Mine.')).toBeTruthy();
    await waitFor(() => expect(chapterRequests()).toEqual(['c1', 'c2']));
    expect(screen.queryByText('AI wrote this.')).toBeNull();
    await waitFor(() => expect(screen.queryByText('Title c2')).toBeNull());
  });

  it('shows the empty state when the only words are pending AI prose', async () => {
    const aiInsert = { type: 'paragraph', attrs: { refs: [{ entityType: 'ai-generated' }] }, content: [{ type: 'text', text: 'AI.' }] };
    serve([chapter('c1', 5, aiInsert)]);
    renderPreview();
    expect(await screen.findByText(/nothing to preview yet/i)).toBeTruthy();
  });

  it('shows the empty state without any prose request when nothing is written', async () => {
    serve([chapter('c1', 0), chapter('c2', 0)]);
    renderPreview();
    expect(await screen.findByText(/nothing to preview yet/i)).toBeTruthy();
    expect(chapterRequests()).toEqual([]);
  });

  it("shows a retry for a chapter whose prose didn't load (not the empty state)", async () => {
    serve([chapter('c1', 5, txt('One.')), chapter('c3', 5, txt('Three.'))], { failChapter: 'c3' });
    renderPreview();
    expect(await screen.findByText('One.')).toBeTruthy();
    expect(await screen.findByText(/couldn.t load this chapter/i)).toBeTruthy();
    expect(screen.queryByText(/nothing to preview yet/i)).toBeNull();
  });

  it('Retry on a failed chapter fetches it again and shows its prose', async () => {
    const chapters = [chapter('c1', 5, txt('One.')), chapter('c3', 5, txt('Three.'))];
    serve(chapters, { failChapter: 'c3' });
    renderPreview();
    expect(await screen.findByText(/couldn.t load this chapter/i)).toBeTruthy();
    serve(chapters); // back online
    fireEvent.click(screen.getByRole('button', { name: /retry/i }));
    expect(await screen.findByText('Three.')).toBeTruthy();
    expect(screen.queryByText(/couldn.t load this chapter/i)).toBeNull();
    expect(chapterRequests().filter((id) => id === 'c3')).toHaveLength(2);
  });
});
