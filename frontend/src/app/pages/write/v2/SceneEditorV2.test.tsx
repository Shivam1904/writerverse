import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '../../../ui';
import { useWriteStore } from '../writeStore';
import { SceneEditorV2 } from './SceneEditorV2';

vi.mock('../../../gateway', () => ({ callOp: vi.fn() }));

const SCENE = { id: 7, text: 'Storm', beats: [], words: 3 } as any;
const DOC = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Rain.' }] }] };

// Leaving the Write page (e.g. clicking a scene-notes card in the drawer that
// links to a character) unmounts the editor. Unsaved prose must be sent then,
// not left waiting on the 1.5 s autosave timer.
describe('SceneEditorV2 leave flush', () => {
  it('saves a dirty focused scene when it unmounts', () => {
    useWriteStore.setState({ contentById: { 7: DOC }, dirtySceneIds: new Set([7]) } as any);
    const onSave = vi.fn();
    const qc = new QueryClient();
    const { unmount } = render(
      <QueryClientProvider client={qc}>
        <TooltipProvider>
          <SceneEditorV2
            projectId="p1"
            scene={SCENE}
            showBreak={false}
            isFocused
            content={DOC as any}
            saveStatus="idle"
            isDirty
            onFocus={() => {}}
            onContentChange={() => {}}
            onSave={onSave}
            mentionItems={[]}
            braindumps={[]}
            worldbuildings={[]}
          />
        </TooltipProvider>
      </QueryClientProvider>,
    );
    expect(onSave).not.toHaveBeenCalled();
    unmount();
    expect(onSave).toHaveBeenCalledTimes(1);
  });
});
