import { useCallback, useState } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '../../../ui';
import { StreamView } from './StreamView';

// A refetch (X-Invalidates, SSE push, another tab) replaces the whole items
// array with server data. It must never overwrite the field being typed in (SA-112).
let refetch: (items: any[]) => void = () => {};

function Harness({ initial, onEditBody = vi.fn(), onAddBraindump = vi.fn() }: any) {
  const [items, setItems] = useState<any[]>(initial);
  refetch = (next) => setItems(next);
  const writeItems = useCallback((fn: (prev: any[]) => any[]) => setItems((p) => fn(p)), []);
  return (
    <TooltipProvider>
      <StreamView
        visibleItems={items}
        writeItems={writeItems}
        onEditBody={onEditBody}
        onAddBraindump={onAddBraindump}
      />
    </TooltipProvider>
  );
}

const boxes = () => screen.getAllByRole('textbox') as HTMLTextAreaElement[];

describe('StreamView: refetch while typing', () => {
  it('keeps the focused field text when a refetch brings old server text', () => {
    const onEditBody = vi.fn();
    render(<Harness initial={[{ id: 'a', body: 'dragon', tags: [] }]} onEditBody={onEditBody} />);
    const box = boxes()[0];
    act(() => box.focus());
    fireEvent.change(box, { target: { value: 'dragon who hoards maps' } });

    act(() => refetch([{ id: 'a', body: 'dragon', tags: ['creature'] }]));

    expect(boxes()[0].value).toBe('dragon who hoards maps');
    expect(document.activeElement).toBe(boxes()[0]);
    // ...and the typed text is what gets saved on blur.
    act(() => boxes()[0].blur());
    expect(onEditBody).toHaveBeenCalledWith('a', 'dragon who hoards maps');
  });

  it('keeps a new unsaved row the author is typing in when a refetch drops it', () => {
    const onAddBraindump = vi.fn();
    render(
      <Harness
        initial={[{ id: 'a', body: 'dragon', tags: [] }, { id: 'tmp-1', body: '', tags: [] }]}
        onAddBraindump={onAddBraindump}
      />,
    );
    const box = boxes()[1];
    act(() => box.focus());
    fireEvent.change(box, { target: { value: 'a second idea' } });

    act(() => refetch([{ id: 'a', body: 'dragon', tags: [] }]));

    expect(boxes()).toHaveLength(2);
    expect(boxes()[1].value).toBe('a second idea');
    expect(document.activeElement).toBe(boxes()[1]);
    act(() => boxes()[1].blur());
    expect(onAddBraindump).toHaveBeenCalledWith('a second idea');
  });

  it('shows refetched text again once the field loses focus', () => {
    render(<Harness initial={[{ id: 'a', body: 'dragon', tags: [] }]} />);
    const box = boxes()[0];
    act(() => box.focus());
    act(() => box.blur());
    act(() => refetch([{ id: 'a', body: 'dragon (edited in another tab)', tags: [] }]));
    expect(boxes()[0].value).toBe('dragon (edited in another tab)');
  });
});

// SA-117: a failed add must not swallow what the author typed on the blur path.
describe('StreamView: failed add on blur', () => {
  it('keeps the typed text on screen as an editable row', async () => {
    const onAddBraindump = vi.fn().mockResolvedValue(false);
    render(
      <Harness
        initial={[{ id: 'a', body: 'dragon', tags: [] }, { id: 'tmp-1', body: '', tags: [] }]}
        onAddBraindump={onAddBraindump}
      />,
    );
    const box = boxes()[1];
    act(() => box.focus());
    fireEvent.change(box, { target: { value: 'an idea the backend refuses' } });
    await act(async () => box.blur());

    expect(onAddBraindump).toHaveBeenCalledWith('an idea the backend refuses');
    expect(boxes().map((b) => b.value)).toContain('an idea the backend refuses');
  });
});

// SA-140: Backspace in an emptied field must really delete a saved idea (with
// Undo, via onDelete), not just drop it from the screen until the next refetch.
describe('StreamView: Backspace on an emptied idea', () => {
  function HarnessWithDelete({ initial, onDelete }: any) {
    const [items, setItems] = useState<any[]>(initial);
    const writeItems = useCallback((fn: (prev: any[]) => any[]) => setItems((p) => fn(p)), []);
    // Mirrors the page: onDelete removes the row (the real one also calls the server).
    const del = (id: string) => {
      setItems((p) => {
        onDelete(id, p.find((it) => it.id === id));
        return p.filter((it) => it.id !== id);
      });
    };
    return (
      <TooltipProvider>
        <StreamView visibleItems={items} writeItems={writeItems} onDelete={del} />
      </TooltipProvider>
    );
  }

  it('deletes a saved idea through onDelete, with its saved text put back for Undo', () => {
    const onDelete = vi.fn();
    render(
      <HarnessWithDelete
        initial={[{ id: 'a', body: 'dragon', tags: [] }, { id: 'b', body: 'a lost map', tags: [] }]}
        onDelete={onDelete}
      />,
    );
    const box = boxes()[1];
    act(() => box.focus());
    fireEvent.change(box, { target: { value: '' } });
    fireEvent.keyDown(box, { key: 'Backspace' });

    expect(onDelete).toHaveBeenCalledWith('b', expect.objectContaining({ body: 'a lost map' }));
    expect(boxes().map((b) => b.value)).toEqual(['dragon']);
  });

  it('drops a fresh unsaved row without calling onDelete', () => {
    const onDelete = vi.fn();
    render(
      <HarnessWithDelete
        initial={[{ id: 'a', body: 'dragon', tags: [] }, { id: 'tmp-1', body: '', tags: [] }]}
        onDelete={onDelete}
      />,
    );
    const box = boxes()[1];
    act(() => box.focus());
    fireEvent.keyDown(box, { key: 'Backspace' });

    expect(onDelete).not.toHaveBeenCalled();
    expect(boxes().map((b) => b.value)).toEqual(['dragon']);
  });
});

// SA-158: a failed AI tagging shows a quiet note with a re-run.
describe('StreamView: failed tagging', () => {
  it('shows the note only for a failed annotation, and Try again re-runs it', () => {
    const onRetryAnnotate = vi.fn();
    render(
      <TooltipProvider>
        <StreamView
          visibleItems={[
            { id: 1, body: 'tagging failed here', tags: [], aiData: { status: 'failed', error: 'LLM 500' } },
            { id: 2, body: 'nothing to tag here', tags: [], aiData: { status: 'ok' } },
          ]}
          writeItems={() => {}}
          onRetryAnnotate={onRetryAnnotate}
        />
      </TooltipProvider>,
    );
    expect(screen.getAllByText(/Couldn't tag this idea/)).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetryAnnotate).toHaveBeenCalledWith(1);
  });

  it('says AI is not configured, with no Try again, when the server has no AI key', () => {
    const message = 'AI is not configured on this server. Everything else works.';
    render(
      <TooltipProvider>
        <StreamView
          visibleItems={[
            {
              id: 1, body: 'no key here', tags: [],
              aiData: { status: 'failed', error_code: 'ai_not_configured', error_message: message },
            },
          ]}
          writeItems={() => {}}
          onRetryAnnotate={vi.fn()}
        />
      </TooltipProvider>,
    );
    expect(screen.getByText(message)).toBeTruthy();
    expect(screen.queryByText(/Couldn't tag this idea/)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
  });
});

// wrt-121: a lone short idea uses the full row instead of half the page.
// wrt-139: one idea per row, under a header that names the two columns.
describe('StreamView: one idea per row', () => {
  it('lists ideas in one column with an Idea / Shows up on header', () => {
    render(<Harness initial={[{ id: 'a', body: 'dragon', tags: [] }, { id: 'b', body: 'castle', tags: [] }]} />);
    expect(screen.getByText('Idea')).toBeTruthy();
    expect(screen.getByText('Shows up on')).toBeTruthy();
    const row = screen.getByDisplayValue('dragon').closest('[data-bd-id]')!;
    expect(row.className).not.toContain('col-span');
    expect(row.parentElement!.className).toContain('flex-col');
  });
});

// wrt-140: a card's text field re-measures when its width changes after mount
// (font load, the action column settling), so its last line is never hidden.
describe('StreamView: re-grow on width change', () => {
  it('sets the field height again when the observer reports a new width', () => {
    let fire: (w: number) => void = () => {};
    const RealRO = (globalThis as any).ResizeObserver;
    (globalThis as any).ResizeObserver = class {
      cb: ResizeObserverCallback;
      targets: Element[] = [];
      constructor(cb: ResizeObserverCallback) { this.cb = cb; fire = (w) => this.cb(this.targets.map((t) => ({ target: t, contentRect: { width: w } }) as any), this as any); }
      observe(t: Element) { this.targets.push(t); }
      unobserve() {}
      disconnect() {}
    };
    const cw = vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(300);
    let sh = 40;
    const scroll = vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockImplementation(() => sh);
    try {
      render(<Harness initial={[{ id: 'a', body: 'Milo and Otto go to get the TV back and come home without their pants.', tags: [] }]} />);
      const box = boxes()[0];
      expect(box.style.height).toBe('40px');
      sh = 60; // narrower box → one more line
      act(() => fire(250));
      expect(box.style.height).toBe('60px');
    } finally {
      cw.mockRestore();
      scroll.mockRestore();
      (globalThis as any).ResizeObserver = RealRO;
    }
  });
});
