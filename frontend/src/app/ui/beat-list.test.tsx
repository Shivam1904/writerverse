import { act, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BeatList, type Beat } from './beat-list';

const beats: Beat[] = [
  { id: 'b1', text: 'One', kind: 'text' },
  { id: 'b2', text: 'Two', kind: 'text' },
  { id: 'b3', text: 'Three', kind: 'text' },
];

// jsdom has no layout: give each beat row a 40px-tall slot, top to bottom, so
// dnd-kit can measure the rows and find the one a dragged beat lands on.
const realRect = Element.prototype.getBoundingClientRect;
beforeEach(() => {
  Element.prototype.getBoundingClientRect = function (this: Element) {
    const row = this.closest('.kit-beat-row');
    const i = row ? Array.from(document.querySelectorAll('.kit-beat-row')).indexOf(row) : -1;
    const top = i < 0 ? 0 : i * 40;
    const height = i < 0 ? 0 : 30;
    return { x: 0, y: top, top, left: 0, width: 300, height, right: 300, bottom: top + height, toJSON() {} } as DOMRect;
  };
});
afterEach(() => { Element.prototype.getBoundingClientRect = realRect; });

function renderList(onReorder = vi.fn()) {
  const view = render(
    <BeatList beats={beats} onChangeText={() => {}} onReorder={onReorder} />,
  );
  const handles = Array.from(view.container.querySelectorAll('[aria-roledescription="sortable"]')) as HTMLElement[];
  return { ...view, handles, onReorder };
}

describe('BeatList drag handle', () => {
  it('each beat has a keyboard-reachable sortable handle', () => {
    const { handles } = renderList();
    expect(handles).toHaveLength(3);
    for (const h of handles) {
      expect(h.getAttribute('role')).toBe('button');
      expect(h.getAttribute('tabindex')).toBe('0');
      expect(h.getAttribute('aria-label')).toBe('Drag to reorder');
    }
  });

  it('a keyboard drag (Space, ↓, Space) reports the move', async () => {
    const { handles, onReorder } = renderList();
    const h = handles[0];
    h.focus();
    // dnd-kit starts listening for the next keys a tick after the pick-up.
    const press = async (code: string, key: string) => act(async () => {
      fireEvent.keyDown(h, { code, key });
      await new Promise((r) => setTimeout(r, 0));
    });
    await press('Space', ' ');
    await press('ArrowDown', 'ArrowDown');
    await press('Space', ' ');
    expect(onReorder).toHaveBeenCalledWith('b1', 'b2');
  });
});
