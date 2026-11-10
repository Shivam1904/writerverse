import { describe, expect, it } from 'vitest';
import { deleteConfirmMessage, outlineChapters, subtreeContents } from './tree';

const outline = {
  acts: [
    { id: 'ac1', chapters: [
      { id: 'ch1', scenes: [
        { id: 'sc1', words: 0, beats: [{ id: 'b1' }, { id: 'b2' }] },
        { id: 'sc2', words: 120, beats: [{ id: 'b3' }] },
      ] },
      { id: 'ch2', scenes: [] },
    ] },
    { id: 'ac2', chapters: [] },
  ],
};

describe('subtreeContents', () => {
  it('counts the chapters, scenes, beats and words inside an act', () => {
    expect(subtreeContents(outline, 'act', 'ac1'))
      .toEqual({ chapters: 2, scenes: 2, beats: 3, words: 120 });
  });

  it('does not count the item itself', () => {
    expect(subtreeContents(outline, 'chapter', 'ch1'))
      .toEqual({ chapters: 0, scenes: 2, beats: 3, words: 120 });
    expect(subtreeContents(outline, 'scene', 'sc1'))
      .toEqual({ chapters: 0, scenes: 0, beats: 2, words: 0 });
  });

  it('returns null for an unknown item', () => {
    expect(subtreeContents(outline, 'act', 'nope')).toBeNull();
  });
});

describe('deleteConfirmMessage', () => {
  it('asks with counts when there is structure but no prose yet', () => {
    expect(deleteConfirmMessage('act', { chapters: 1, scenes: 3, beats: 12, words: 0 }))
      .toBe("Delete this act? It contains 1 chapter, 3 scenes, 12 beats. This can't be undone.");
  });

  it('mentions prose words when there are any', () => {
    expect(deleteConfirmMessage('scene', { chapters: 0, scenes: 0, beats: 1, words: 1 }))
      .toBe("Delete this scene? It contains 1 beat, 1 word of prose. This can't be undone.");
  });

  it('does not ask for an empty item or a missing one', () => {
    expect(deleteConfirmMessage('chapter', { chapters: 0, scenes: 0, beats: 0, words: 0 })).toBeNull();
    expect(deleteConfirmMessage('act', null)).toBeNull();
  });
});

describe('outlineChapters', () => {
  const book = {
    acts: [
      { id: 'a1', chapters: [{ id: 'c1', scenes: [] }, { id: 'c2', scenes: [] }] },
      { id: 'a2', chapters: [{ id: 'c3', scenes: [{ id: 's1', beats: [{ id: 'b1', from_rough: 't1' }] }] }] },
    ],
  };

  it('numbers chapters across the whole book, like the chapter chips', () => {
    expect(outlineChapters(book).map((c) => c.n)).toEqual([1, 2, 3]);
  });

  it('numbers only the chapters a thread filter keeps', () => {
    expect(outlineChapters(book, new Set(['t1'])).map((c) => [c.id, c.n])).toEqual([['c3', 1]]);
  });
});
