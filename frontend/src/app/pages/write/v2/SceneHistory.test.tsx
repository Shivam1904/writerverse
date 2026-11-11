import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '../../../ui';
import { useWriteStore } from '../writeStore';
import { SceneEditorV2 } from './SceneEditorV2';
import { SceneHistory } from './SceneHistory';

const callOp = vi.fn();
vi.mock('../../../gateway', () => ({ callOp: (...a: unknown[]) => callOp(...a) }));

const doc = (text: string) => ({
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
});
const OLD = doc('The hero walked into the storm.');
const NOW = doc('A second draft.');
const SCENE = { id: 7, text: 'Storm', beats: [], content: NOW, words: 3 } as any;

// The real editor, fed the way ManuscriptV2 feeds it: store content first.
function Harness({ onSave }: { onSave: (id: any) => unknown }) {
  const content = useWriteStore((s) => s.contentById[7]);
  return (
    <>
      <SceneEditorV2
        projectId="p1"
        scene={SCENE}
        showBreak={false}
        isFocused={false}
        content={content}
        saveStatus="idle"
        isDirty={false}
        onFocus={() => {}}
        onContentChange={(d) => useWriteStore.getState().setSceneContent(7, d)}
        onSave={() => onSave(7)}
        mentionItems={[]}
        braindumps={[]}
        worldbuildings={[]}
      />
      <SceneHistory projectId="p1" sceneId={7} title="Storm" onSaveScene={onSave} />
    </>
  );
}

function renderHarness(onSave: (id: any) => unknown = vi.fn()) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <TooltipProvider>
        <Harness onSave={onSave} />
      </TooltipProvider>
    </QueryClientProvider>,
  );
}

async function openAndPickOldVersion() {
  fireEvent.click(screen.getByRole('button', { name: /history/i }));
  const versions = await screen.findByRole('list', { name: 'Versions' });
  fireEvent.click(within(versions).getByRole('button', { name: /6 w/ }));
  const preview = await screen.findByLabelText('Version preview');
  expect(preview.textContent).toContain('The hero walked into the storm.');
}

describe('SceneHistory', () => {
  beforeEach(() => {
    callOp.mockReset().mockImplementation(async (_p: string, op: string, args: any) => {
      if (op === 'list_scene_revisions')
        return { scene_id: '7', revisions: [{ id: 11, created_at: '2026-09-30T10:00:00Z', words: 6 }] };
      if (op === 'get_scene_revision') return { scene_id: '7', revision_id: args.revision_id, content: OLD };
      if (op === 'restore_scene_revision')
        return { scene_id: '7', revision_id: args.revision_id, content: OLD, scene: { words: 6 } };
      throw new Error(`unexpected op ${op}`);
    });
    useWriteStore.setState({
      data: { chapters: [{ id: 1, scenes: [SCENE] }], totalWords: 3 } as any,
      contentById: { 7: NOW },
      dirtySceneIds: new Set(),
      saveStatusById: {},
    });
  });

  it('lists versions, previews one, and restoring puts its text in the editor', async () => {
    const { container } = renderHarness();
    await waitFor(() => expect(container.textContent).toContain('A second draft.'));

    await openAndPickOldVersion();
    fireEvent.click(screen.getByRole('button', { name: 'Restore this version' }));
    expect(callOp).not.toHaveBeenCalledWith('p1', 'restore_scene_revision', expect.anything());
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Yes, restore' }));
    });

    expect(callOp).toHaveBeenCalledWith('p1', 'restore_scene_revision', {
      scene_id: '7',
      revision_id: 11,
    });
    await waitFor(() => expect(screen.queryByLabelText('Version preview')).toBeNull());
    const editor = container.querySelector('.ProseMirror') as HTMLElement;
    await waitFor(() => expect(editor.textContent).toContain('The hero walked into the storm.'));
    expect(editor.textContent).not.toContain('A second draft.');
    // Restored text is already on the server: nothing left to autosave.
    expect(useWriteStore.getState().dirtySceneIds.has(7)).toBe(false);
  });

  it('saves unsaved typing before restoring, so it is kept as a version', async () => {
    const order: string[] = [];
    const onSave = vi.fn(async () => {
      order.push('save');
      useWriteStore.getState().clearDirty(7);
    });
    const base = callOp.getMockImplementation()!;
    callOp.mockImplementation(async (...a: any[]) => {
      order.push(a[1]);
      return base(...a);
    });
    useWriteStore.setState({ dirtySceneIds: new Set([7]) });
    renderHarness(onSave);

    await openAndPickOldVersion();
    fireEvent.click(screen.getByRole('button', { name: 'Restore this version' }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Yes, restore' }));
    });

    expect(onSave).toHaveBeenCalledWith(7);
    expect(order.indexOf('save')).toBeLessThan(order.indexOf('restore_scene_revision'));
  });

  it('does not restore while unsaved typing could not be saved', async () => {
    useWriteStore.setState({ dirtySceneIds: new Set([7]) });
    renderHarness(vi.fn()); // the save does not land: scene stays dirty

    await openAndPickOldVersion();
    fireEvent.click(screen.getByRole('button', { name: 'Restore this version' }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Yes, restore' }));
    });

    expect(callOp).not.toHaveBeenCalledWith('p1', 'restore_scene_revision', expect.anything());
    expect(screen.getByText(/still saving/i)).toBeTruthy();
    expect(useWriteStore.getState().contentById[7]).toEqual(NOW);
  });
});
