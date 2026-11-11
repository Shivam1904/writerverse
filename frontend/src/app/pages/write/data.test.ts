import { describe, expect, it, vi } from 'vitest';

vi.mock('../../gateway', () => ({
  callOp: vi.fn(async () => ({
    grand_outline: {
      acts: [
        { id: 'ac-1', text: 'Act One: The Drowned Coast', chapters: [] },
        { id: 'ac-2', text: '', chapters: [{ id: 'ch-1', text: 'The Bell Tower', scenes: [] }] },
      ],
    },
  })),
}));

import { loadWriteData } from './data';

describe('loadWriteData', () => {
  it('names each act by its title, falling back to "Act"', async () => {
    const { acts } = await loadWriteData('1');
    expect(acts.map((a) => [a.id, a.name])).toEqual([
      ['ac-1', 'Act One: The Drowned Coast'],
      ['ac-2', 'Act'],
    ]);
    expect(acts[1].chapters[0].title).toBe('The Bell Tower');
  });
});
