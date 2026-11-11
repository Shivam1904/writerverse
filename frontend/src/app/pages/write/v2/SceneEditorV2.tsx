import { useCallback, useEffect, useRef } from 'react';
import DraftingTipTapEditor, {
  type TipTapEditorHandle,
} from '../../../components/DraftingCanvas/DraftingTipTapEditor';
import {
  acceptAllAiGenerated,
  jsonHasAiGenerated,
} from '../../../components/DraftingCanvas/AiGeneratedBlock';
import type { MentionItemInput } from '../../../components/DraftingCanvas/useMentionExtension';
import type { Braindump, Worldbuilding } from '../../../components/DraftingCanvas/useLinkedItems';
import type { TipTapDoc, WriteScene } from '../data';
import type { SaveStatus } from '../writeStore';
import { useWriteStore } from '../writeStore';

interface Props {
  projectId?: string;
  scene: WriteScene;
  showBreak: boolean;
  isFocused: boolean;
  content: TipTapDoc;
  saveStatus: SaveStatus;
  isDirty: boolean;
  onFocus: () => void;
  onContentChange: (doc: TipTapDoc) => void;
  onSave: () => void;
  onFocusPrev?: () => void;
  onFocusNext?: () => void;
  mentionItems: MentionItemInput[];
  braindumps: Braindump[];
  worldbuildings: Worldbuilding[];
}

/**
 * The real TipTap editor for one scene, rendered as the prose column of a
 * `.wmock-scene-block`. Forked from the v1 SceneBlock — keeps the auto-save +
 * dirty-flush + entity-hover + focus-scroll wiring, drops the v1 chrome (title
 * input, per-scene analysis menu, Night Eyes buttons) since the v2 layout moves
 * those to the scene margin and drawer.
 */
export function SceneEditorV2({
  projectId,
  scene,
  isFocused,
  content,
  saveStatus,
  isDirty,
  onFocus,
  onContentChange,
  onSave,
  onFocusPrev,
  onFocusNext,
  mentionItems,
  braindumps,
  worldbuildings,
}: Props) {
  const editorRef = useRef<TipTapEditorHandle>(null);
  const editorWrapRef = useRef<HTMLDivElement>(null);
  const proseRef = useRef<HTMLDivElement>(null);
  const setHoveredEntityKey = useWriteStore((s) => s.setHoveredEntityKey);

  // Hover an entity reference in the prose → publish the key so other surfaces
  // can highlight the matching entity (kept from v1 for parity).
  useEffect(() => {
    const el = editorWrapRef.current;
    if (!el) return;
    const keyOf = (target: EventTarget | null): string | null => {
      const node = (target as HTMLElement)?.closest?.('[data-entity-type]') as HTMLElement | null;
      if (!node) return null;
      const type = node.getAttribute('data-entity-type');
      const id = node.getAttribute('data-entity-id') || node.getAttribute('data-id');
      return type && id ? `${type}-${id}` : null;
    };
    const onOver = (e: MouseEvent) => {
      const k = keyOf(e.target);
      if (k) setHoveredEntityKey(k);
    };
    const onOut = (e: MouseEvent) => {
      const k = keyOf(e.target);
      if (k) setHoveredEntityKey(null);
    };
    el.addEventListener('mouseover', onOver);
    el.addEventListener('mouseout', onOut);
    return () => {
      el.removeEventListener('mouseover', onOver);
      el.removeEventListener('mouseout', onOut);
    };
  }, [setHoveredEntityKey]);

  // Auto-save: persist a short beat after the author stops typing; flush on
  // leave/unmount and Ctrl/Cmd+S. Dirty state is read at fire time so a queued
  // timer never re-saves a scene whose save already landed.
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;
  const autoSaveTimer = useRef<number | null>(null);

  const flushSave = useCallback(() => {
    if (autoSaveTimer.current != null) {
      window.clearTimeout(autoSaveTimer.current);
      autoSaveTimer.current = null;
    }
    if (useWriteStore.getState().dirtySceneIds.has(scene.id as any)) onSaveRef.current();
  }, [scene.id]);

  const scheduleAutoSave = useCallback(() => {
    if (autoSaveTimer.current != null) window.clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = window.setTimeout(() => {
      autoSaveTimer.current = null;
      if (useWriteStore.getState().dirtySceneIds.has(scene.id as any)) onSaveRef.current();
    }, 1500);
  }, [scene.id]);

  const handleContentChange = useCallback(
    (doc: TipTapDoc) => {
      onContentChange(doc);
      scheduleAutoSave();
    },
    [onContentChange, scheduleAutoSave],
  );

  useEffect(() => {
    if (!isFocused) return;
    return () => flushSave();
  }, [isFocused, flushSave]);

  useEffect(() => {
    if (!isFocused) return;
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        flushSave();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isFocused, flushSave]);

  // Becoming the focused scene (rail double-click, deep link) → drop the caret
  // into its prose unless the user is already typing inside it.
  useEffect(() => {
    if (!isFocused) return;
    const prose = proseRef.current;
    const active = document.activeElement;
    if (!prose || !active || !prose.contains(active)) editorRef.current?.focusAtStart();
  }, [isFocused]);

  const hasAiGenerated = jsonHasAiGenerated(content);
  const handleAcceptAll = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    const ed = editorRef.current?.getEditor();
    if (ed) acceptAllAiGenerated(ed);
  }, []);

  const saveLabel =
    saveStatus === 'saving'
      ? 'Saving…'
      : saveStatus === 'error'
        ? 'Save failed'
        : isDirty
          ? 'Unsaved'
          : null;

  return (
    <div className="wmock-scene-prose" ref={proseRef}>

      {hasAiGenerated ? (
        <button
          type="button"
          className="wmock-acceptall"
          onClick={handleAcceptAll}
          title="Accept all paragraphs in this scene"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            margin: '0 0 8px',
            padding: '4px 9px',
            borderRadius: 7,
            border: '1px solid color-mix(in srgb, var(--gold) 45%, var(--line))',
            background: 'color-mix(in srgb, var(--gold) 12%, var(--paper))',
            color: 'var(--ink-2)',
            font: '600 11px var(--ui)',
            cursor: 'pointer',
          }}
        >
          Accept all
        </button>
      ) : null}

      <div className="" ref={editorWrapRef}>
        <DraftingTipTapEditor
          ref={editorRef}
          content={content}
          onChange={handleContentChange}
          placeholder="Start writing…"
          onFocus={onFocus}
          onExitUp={onFocusPrev}
          onExitDown={onFocusNext}
          projectId={projectId}
          sceneId={scene.id}
          mentionItems={mentionItems}
          braindumps={braindumps}
          worldbuildings={worldbuildings}
        />
      </div>

      {saveLabel ? (
        <div
          style={{
            marginTop: 4,
            font: '600 10px var(--ui)',
            letterSpacing: '.04em',
            color: saveStatus === 'error' ? 'var(--clay)' : 'var(--ink-4)',
          }}
        >
          {saveLabel}
        </div>
      ) : null}
    </div>
  );
}
