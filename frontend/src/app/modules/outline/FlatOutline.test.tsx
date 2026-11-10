import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { FlatOutline } from './FlatOutline';

const outline = {
  acts: [{
    id: 'ac1', text: 'Act one', chapters: [{
      id: 'ch1', text: 'Chapter one', scenes: [{ id: 'sc1', text: 'Scene one', beats: [] }],
    }],
  }],
};

const makeOps = () => ({ remove: vi.fn(), update: vi.fn(), add: vi.fn(), addChapter: vi.fn() }) as any;

describe('FlatOutline delete buttons (SA-73)', () => {
  // The × used to get `pointer-events: none` until its row was hovered, so the
  // row's wrapper <span> took the first click (a tap, a click-automation hit
  // test) and the delete never fired. Faded is fine; unclickable is not.
  it.each([
    ['Delete act', 'act', 'ac1'],
    ['Delete chapter', 'chapter', 'ch1'],
    ['Delete scene', 'scene', 'sc1'],
  ])('%s stays clickable before its row is hovered', (title, kind, id) => {
    const ops = makeOps();
    render(<FlatOutline outline={outline} ops={ops} />);
    const btn = screen.getByTitle(title);
    expect(btn.style.pointerEvents).not.toBe('none');
    expect(btn.style.opacity).toBe('0'); // still visually hidden until hover
    fireEvent.click(btn);
    expect(ops.remove).toHaveBeenCalledWith(kind, id);
  });
});

// wrt-46: ↑ ↓ on act / chapter / scene rows move it among its siblings.
const two = {
  acts: [
    { id: 'ac1', text: 'Act one', chapters: [
      { id: 'ch1', text: 'Chapter one', scenes: [
        { id: 'sc1', text: 'Scene one', beats: [] as any[] },
        { id: 'sc2', text: 'Scene two', beats: [] as any[] },
      ] },
      { id: 'ch2', text: 'Chapter two', scenes: [] },
    ] },
    { id: 'ac2', text: 'Act two', chapters: [] },
  ],
};

describe('FlatOutline move buttons (wrt-46)', () => {
  it.each([
    ['act', 'ac1', 'ac2'],
    ['chapter', 'ch1', 'ch2'],
    ['scene', 'sc1', 'sc2'],
  ])('%s: first moves down only, last moves up only', (level, first, last) => {
    const ops = { ...makeOps(), reorder: vi.fn() };
    render(<FlatOutline outline={two} ops={ops} />);
    const ups = screen.getAllByTitle(`Move ${level} up`) as HTMLButtonElement[];
    const downs = screen.getAllByTitle(`Move ${level} down`) as HTMLButtonElement[];
    expect(ups).toHaveLength(2);
    expect(ups[0].disabled).toBe(true);
    expect(downs[1].disabled).toBe(true);
    fireEvent.click(downs[0]);
    expect(ops.reorder).toHaveBeenCalledWith(level, first, 1);
    fireEvent.click(ups[1]);
    expect(ops.reorder).toHaveBeenCalledWith(level, last, -1);
  });

  it('hides the arrows while a thread filter hides siblings', () => {
    const withBeat = structuredClone(two);
    withBeat.acts[0].chapters[0].scenes[0].beats = [{ id: 'b1', text: 'x', from_rough: 't1' }];
    render(<FlatOutline outline={withBeat} ops={{ ...makeOps(), reorder: vi.fn() }} filterThreadIds={new Set(['t1'])} />);
    expect(screen.queryByTitle('Move scene up')).toBeNull();
  });

  it('read-only outline has no arrows', () => {
    render(<FlatOutline outline={two} />);
    expect(screen.queryByTitle('Move act up')).toBeNull();
  });
});
