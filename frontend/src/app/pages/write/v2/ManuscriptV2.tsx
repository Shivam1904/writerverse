import { Plus } from 'lucide-react';
import { Button } from '../../../ui';
import type { MentionItemInput } from '../../../components/DraftingCanvas/useMentionExtension';
import type { Braindump, Worldbuilding } from '../../../components/DraftingCanvas/useLinkedItems';
import type { TipTapDoc, WriteChapter } from '../data';
import type { SaveStatus } from '../writeStore';
import { SceneEditorV2 } from './SceneEditorV2';
import { SceneMargin } from './SceneMargin';
import { sceneDoc } from '../useChapterDocs';
import type { BeatState } from './useChapterBeats';

interface Props {
  projectId?: string;
  chapter: WriteChapter;
  contentById: Record<number, TipTapDoc>;
  saveStatusById: Record<number, SaveStatus>;
  dirtySceneIds: Set<number>;
  currentSceneId: string | null; // the current scene (pages/write/currentScene.ts) — drives margin expansion
  focusedSceneId: any; // committed ?sc — drives the editor caret on navigation
  beatStates: Record<string, BeatState>;
  colorFor: (threadId?: string | null) => string;
  onCycleBeat: (id: string) => void;
  onSelectScene: (sceneId: any) => void; // scroll within the doc, no URL change
  onAddScene: () => void;
  mentionItems: MentionItemInput[];
  braindumps: Braindump[];
  worldbuildings: Worldbuilding[];
  onSceneContentChange: (sceneId: any, doc: TipTapDoc) => void;
  onSaveScene: (sceneId: any) => unknown;
  onSceneFocus: (sceneId: any) => void;
  onFocusScene: (index: number) => void; // up/down arrow hop between scenes
}

export function ManuscriptV2({
  projectId,
  chapter,
  contentById,
  saveStatusById,
  dirtySceneIds,
  currentSceneId,
  focusedSceneId,
  beatStates,
  colorFor,
  onCycleBeat,
  onSelectScene,
  onAddScene,
  mentionItems,
  braindumps,
  worldbuildings,
  onSceneContentChange,
  onSaveScene,
  onSceneFocus,
  onFocusScene,
}: Props) {
  const scenes = chapter?.scenes;

  // Which scene's margin is expanded: the current scene, by the same rule
  // Night Eyes uses for "this scene" (last scrolled to or clicked, else ?sc).
  const expandedSceneId = currentSceneId;

  return (
    <article className="wmock-paper" aria-label="Writing surface">
      <div className="wmock-doc">
        {scenes?.map((scene, i) => (
          <section
            className="wmock-scene-block"
            key={scene.id}
            data-scene={scene.id}
          >
            {sceneDoc(contentById, scene) === undefined ? (
              // Prose not loaded yet (it comes per chapter). No editor until it
              // is: typing into an empty stand-in would save over the real text.
              <p className="py-4" aria-busy="true">Loading this scene…</p>
            ) : (
            <SceneEditorV2
              projectId={projectId}
              scene={scene}
              showBreak={i > 0}
              isFocused={String(scene.id) === String(focusedSceneId)}
              content={sceneDoc(contentById, scene)}
              saveStatus={saveStatusById[scene.id] ?? 'idle'}
              isDirty={dirtySceneIds.has(scene.id as any)}
              onFocus={() => onSceneFocus(scene.id)}
              onContentChange={(doc) => onSceneContentChange(scene.id, doc)}
              onSave={() => onSaveScene(scene.id)}
              onFocusPrev={i > 0 ? () => onFocusScene(i - 1) : undefined}
              onFocusNext={i < scenes.length - 1 ? () => onFocusScene(i + 1) : undefined}
              mentionItems={mentionItems}
              braindumps={braindumps}
              worldbuildings={worldbuildings}
            />
            )}
            <SceneMargin
              projectId={projectId}
              sceneNumber={i + 1}
              sceneId={scene.id}
              title={scene.text}
              beats={scene.beats}
              active={String(scene.id) === String(expandedSceneId)}
              beatStates={beatStates}
              colorFor={colorFor}
              onCycleBeat={onCycleBeat}
              onSelect={() => onSelectScene(scene.id)}
              onSaveScene={onSaveScene}
            />
          </section>
        ))}

        <div className="wmock-addscene-row">
          <Button variant="dashed" size="sm" onClick={onAddScene} tooltip="Add a scene to this chapter">
            <Plus size={13} strokeWidth={2} />
            Add scene
          </Button>
        </div>
      </div>
    </article>
  );
}
