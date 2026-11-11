import { beforeEach, describe, expect, it } from 'vitest';
import { useWriteStore } from './writeStore';
import { stashUnsavedProse } from './unsavedStash';

const doc = (t: string) =>
  ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: t }] }] }) as any;
// Real scene ids are strings like "sc_41e5c549" (typed as number in the store).
const A = 'sc_aaaa1111' as any;
const B = 'sc_bbbb2222' as any;
const OTHER = 'sc_other999' as any;

// What WritePage / ChaptersV2Page do after loadWriteData: setData(scenes), then
// initContent with an EMPTY map (contentById only fills as the author edits).
function openProject(...sceneIds: any[]) {
  const scenes = sceneIds.map((id) => ({ id, text: '', content: doc('server copy'), words: 2 }));
  useWriteStore.getState().setData({ chapters: [{ id: 1, number: 1, scenes }], totalWords: 0 } as any);
  useWriteStore.getState().initContent({});
}

describe('unsaved prose stash', () => {
  beforeEach(() => localStorage.clear());

  it('restores stashed dirty scenes into the editor and marks them dirty', () => {
    stashUnsavedProse({ [A]: doc('new'), [B]: doc('clean') }, [A]);
    openProject(A, B);
    const s = useWriteStore.getState();
    expect(s.contentById[A]).toEqual(doc('new'));
    expect(s.contentById[B]).toBeUndefined();
    expect([...s.dirtySceneIds]).toEqual([A]);
    expect(localStorage.getItem('wv:unsaved-prose')).toBeNull();
  });

  it('keeps stashed scenes from another project until that project opens', () => {
    stashUnsavedProse({ [OTHER]: doc('elsewhere') }, [OTHER]);
    openProject(A);
    expect(useWriteStore.getState().dirtySceneIds.size).toBe(0);
    openProject(OTHER);
    expect(useWriteStore.getState().contentById[OTHER]).toEqual(doc('elsewhere'));
    expect(localStorage.getItem('wv:unsaved-prose')).toBeNull();
  });

  it('does nothing when nothing is stashed', () => {
    openProject(A);
    expect(useWriteStore.getState().dirtySceneIds.size).toBe(0);
  });
});
