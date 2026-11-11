// Part C: the Write page gets prose one chapter at a time. A server answer must
// fill scenes that have nothing yet, refresh clean ones, and NEVER overwrite
// text the author is typing (dirty) or typed after the read left (late answer).
import { beforeEach, describe, expect, it } from 'vitest';
import { useWriteStore } from './writeStore';

const doc = (t: string) => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: t }] }] });
const st = () => useWriteStore.getState();

beforeEach(() => {
  useWriteStore.setState({ contentById: {}, dirtySceneIds: new Set(), editedAtById: {} });
});

describe('applyChapterDocs', () => {
  it('fills scenes with no prose yet (null content → empty doc)', () => {
    st().applyChapterDocs([{ id: 'a', content: doc('A'), rev: 1 }, { id: 'b', content: null, rev: 0 }], Date.now());
    expect(st().contentById['a' as any]).toEqual(doc('A'));
    expect(st().contentById['b' as any]).toEqual({ type: 'doc', content: [] });
  });

  it('refreshes a clean scene with newer server prose (AI edit, other tab)', () => {
    st().applyChapterDocs([{ id: 'a', content: doc('old'), rev: 1 }], Date.now());
    st().applyChapterDocs([{ id: 'a', content: doc('new'), rev: 2 }], Date.now() + 1);
    expect(st().contentById['a' as any]).toEqual(doc('new'));
  });

  it('keeps a dirty scene (the author is typing)', () => {
    st().applyChapterDocs([{ id: 'a', content: doc('old'), rev: 1 }], Date.now());
    st().setSceneContent('a' as any, doc('typing'));
    expect(st().dirtySceneIds.has('a' as any)).toBe(true);
    st().applyChapterDocs([{ id: 'a', content: doc('server'), rev: 2 }], Date.now() + 10);
    expect(st().contentById['a' as any]).toEqual(doc('typing'));
  });

  it('ignores a late answer that left before the last edit, even once saved', () => {
    const before = Date.now() - 1000;
    st().applyChapterDocs([{ id: 'a', content: doc('old'), rev: 1 }], before - 1);
    st().setSceneContent('a' as any, doc('typed'));
    st().clearDirty('a' as any); // the save landed
    st().applyChapterDocs([{ id: 'a', content: doc('old'), rev: 1 }], before);
    expect(st().contentById['a' as any]).toEqual(doc('typed'));
  });
});
