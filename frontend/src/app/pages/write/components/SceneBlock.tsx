import { useRef, useCallback, useEffect, useMemo, useState } from 'react';
import DraftingTipTapEditor, {
  type TipTapEditorHandle,
} from '../../../components/DraftingCanvas/DraftingTipTapEditor';
import {
  acceptAllAiGenerated,
  jsonHasAiGenerated,
} from '../../../components/DraftingCanvas/AiGeneratedBlock';
import type { MentionItemInput } from '../../../components/DraftingCanvas/useMentionExtension';
import type {
  Braindump,
  Worldbuilding,
} from '../../../components/DraftingCanvas/useLinkedItems';
import type { WriteScene, TipTapDoc } from '../data';
import type { SaveStatus } from '../writeStore';
import { useWriteStore } from '../writeStore';
import { useChatStore } from '../../../modules/chat/useChatStore';
import { SCENE_NIGHT_EYES } from '../../../../config/write';
import { AnalysisMenu, type AnalysisResult } from './AnalysisMenu';
import { AnalysisResults } from './AnalysisResults';

interface Props {
  projectId?: string;
  scene: WriteScene;
  index: number;
  chapterNumber: number;
  isFocused: boolean;
  content: TipTapDoc;
  saveStatus: SaveStatus;
  isDirty: boolean;
  onFocus: () => void;
  onContentChange: (doc: TipTapDoc) => void;
  onTitleChange: (title: string) => void;
  onTitleBlur?: (title: string) => void;
  onSave: () => void;
  onFocusPrev?: () => void;
  onFocusNext?: () => void;
  mentionItems: MentionItemInput[];
  braindumps: Braindump[];
  worldbuildings: Worldbuilding[];
}

const _statusClass: Record<string, string> = {
  drafted: 'wr-stat-drafted',
  drafting: 'wr-stat-drafting',
  sketch: 'wr-stat-sketch',
};

// A scene counts as "empty" when its TipTap doc has no real text and no
// non-paragraph blocks (an image, etc.). Empty scenes swap the small header
// pills for a large centred Night Eyes call-to-action. Derived from the live
// `content` doc so it flips off the moment the author types a character.
function isDocEmpty(doc: any): boolean {
  const nodes = doc?.content;
  if (!Array.isArray(nodes) || nodes.length === 0) return true;
  let hasContent = false;
  const walk = (list: any[]) => {
    for (const n of list) {
      if (hasContent || !n) continue;
      if (typeof n.text === 'string' && n.text.trim().length > 0) {
        hasContent = true;
        return;
      }
      if (n.type && n.type !== 'doc' && n.type !== 'paragraph' && n.type !== 'text') {
        hasContent = true;
        return;
      }
      if (Array.isArray(n.content)) walk(n.content);
    }
  };
  walk(nodes);
  return !hasContent;
}

export function SceneBlock({
  projectId,
  scene,
  index,
  chapterNumber,
  isFocused,
  content,
  saveStatus,
  isDirty,
  onFocus,
  onContentChange,
  onTitleChange,
  onTitleBlur,
  onSave,
  onFocusPrev,
  onFocusNext,
  mentionItems,
  braindumps,
  worldbuildings,
}: Props) {
  const editorRef = useRef<TipTapEditorHandle>(null);
  const editorWrapRef = useRef<HTMLDivElement>(null);
  const articleRef = useRef<HTMLElement>(null);
  const setHoveredEntityKey = useWriteStore((s) => s.setHoveredEntityKey);
  const setChatSeed = useChatStore((s) => s.setSeed);
  const openChat = useChatStore((s) => s.open);
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);

  // Per-scene Night Eyes shortcuts. Both drop a starter prompt into the chat
  // composer (prefill only, not auto-sent) and pop the panel open, reusing the
  // store `seed` channel the hint cards already ride. Numbers come from the
  // live chapter/scene position.
  const sceneNumber = index + 1;
  const seedChat = useCallback(
    (build: (chapter: number, scene: number) => string) => (e: React.MouseEvent) => {
      e.stopPropagation();
      setChatSeed(build(chapterNumber, sceneNumber));
      openChat();
    },
    [chapterNumber, sceneNumber, setChatSeed, openChat],
  );

  const isEmpty = useMemo(() => isDocEmpty(content), [content]);

  // The two shortcut buttons, rendered identically as small header pills (when
  // the scene has prose) or inside the large centred empty-state CTA. Sizing is
  // driven by the parent (`.wr-scene-empty-cta` overrides the pill metrics).
  const neButtons = (
    <>
      <button
        type="button"
        className="wr-scene-act-btn wr-scene-ne-btn"
        onClick={seedChat(SCENE_NIGHT_EYES.discuss.seed)}
        title="Talk this scene over with Night Eyes"
      >
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path d="M3 3.5h10a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1H7l-3 2.5V10.5H3a1 1 0 0 1-1-1v-5a1 1 0 0 1 1-1Z" />
        </svg>
        {SCENE_NIGHT_EYES.discuss.label}
      </button>
      <button
        type="button"
        className="wr-scene-act-btn wr-scene-ne-btn"
        onClick={seedChat(SCENE_NIGHT_EYES.buildOn.seed)}
        title="Develop this scene further with Night Eyes"
      >
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path d="M8 2.2l1.45 4.35L13.8 8l-4.35 1.45L8 13.8l-1.45-4.35L2.2 8l4.35-1.45z" />
        </svg>
        {SCENE_NIGHT_EYES.buildOn.label}
      </button>
    </>
  );

  useEffect(() => {
    const el = editorWrapRef.current;
    if (!el) return;

    function getEntityKey(target: EventTarget | null): string | null {
      const node = (target as HTMLElement)?.closest?.(
        '[data-entity-type]',
      ) as HTMLElement | null;
      if (!node) return null;
      const type = node.getAttribute('data-entity-type');
      const id = node.getAttribute('data-entity-id') || node.getAttribute('data-id');
      return type && id ? `${type}-${id}` : null;
    }

    const onOver = (e: MouseEvent) => {
      const key = getEntityKey(e.target);
      if (key) setHoveredEntityKey(key);
    };
    const onOut = (e: MouseEvent) => {
      const key = getEntityKey(e.target);
      if (key) setHoveredEntityKey(null);
    };

    el.addEventListener('mouseover', onOver);
    el.addEventListener('mouseout', onOut);
    return () => {
      el.removeEventListener('mouseover', onOver);
      el.removeEventListener('mouseout', onOut);
    };
  }, [setHoveredEntityKey]);

  const cls = [
    'wr-scene-block',
    isFocused && 'is-focused',
    scene.status === 'sketch' && 'is-sketch',
    isEmpty && 'is-empty',
  ]
    .filter(Boolean)
    .join(' ');

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      if ((e.target as HTMLElement).closest('.wr-scene-act-btn')) return;
      onFocus();
    },
    [onFocus],
  );

  // Pending AI paragraphs in this scene → show the scene-level "Accept all"
  // button, which strips every `ai-generated` ref at once (autosave follows the
  // resulting onChange).
  const hasAiGenerated = jsonHasAiGenerated(content);
  const handleAcceptAll = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    const ed = editorRef.current?.getEditor();
    if (ed) acceptAllAiGenerated(ed);
  }, []);

  // Becoming the focused scene (rail click, deep link, prev/next) → centre it in
  // the viewport and drop the caret into its prose. Skip the caret move when the
  // user clicked into this scene's own title/controls, so we don't yank focus
  // away from the title input they just selected.
  useEffect(() => {
    if (!isFocused) return;
    const article = articleRef.current;
    const active = document.activeElement;
    if (!article || !active || !article.contains(active)) {
      editorRef.current?.focusAtStart();
    }
    article?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [isFocused]);

  // Auto-save: persist a scene a short beat after the author stops typing, and
  // flush any pending save the instant they leave the scene (rail click,
  // prev/next, unmount) so edits are never stranded. Ctrl/Cmd+S is just a manual
  // flush of the same path. Dirty state is read from the store at fire time so a
  // queued timer never re-saves a scene whose save already landed.
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;
  const autoSaveTimer = useRef<number | null>(null);

  const flushSave = useCallback(() => {
    if (autoSaveTimer.current != null) {
      window.clearTimeout(autoSaveTimer.current);
      autoSaveTimer.current = null;
    }
    if (useWriteStore.getState().dirtySceneIds.has(scene.id as any)) {
      onSaveRef.current();
    }
  }, [scene.id]);

  const scheduleAutoSave = useCallback(() => {
    if (autoSaveTimer.current != null) window.clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = window.setTimeout(() => {
      autoSaveTimer.current = null;
      if (useWriteStore.getState().dirtySceneIds.has(scene.id as any)) {
        onSaveRef.current();
      }
    }, 1500);
  }, [scene.id]);

  const handleContentChange = useCallback(
    (doc: TipTapDoc) => {
      onContentChange(doc);
      scheduleAutoSave();
    },
    [onContentChange, scheduleAutoSave],
  );

  const handleTitleChange = useCallback(
    (title: string) => {
      onTitleChange(title);
      scheduleAutoSave();
    },
    [onTitleChange, scheduleAutoSave],
  );

  // Flush a pending save when the scene loses focus or unmounts.
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

  const saveLabel =
    saveStatus === 'saving' ? 'Saving…' :
      saveStatus === 'error' ? 'Save failed' :
        saveStatus === 'saved' ? 'Saved' :
          isDirty ? 'Unsaved' : null;

  const saveCls =
    saveStatus === 'error' ? 'wr-save-err' :
      saveStatus === 'saving' ? 'wr-save-saving' :
        saveStatus === 'saved' ? 'wr-save-done' :
          isDirty ? 'wr-save-unsaved' :
            '';

  return (
    <article ref={articleRef} className={cls} onClick={handleClick}>
      <div className="wr-scene-head">
        <div className="wr-scene-head-lhs">
        </div>
        <div className="wr-scene-stmeta">

          <span className="wr-scene-num">{index + 1}</span>
          <input
            className={`wr-scene-ttl${scene.text ? '' : ' is-placeholder'}`}
            value={scene.text || ''}
            placeholder="..."
            onChange={(e) => handleTitleChange(e.target.value)}
            onBlur={(e) => onTitleBlur?.(e.target.value)}
            spellCheck={false}
          />

          {hasAiGenerated && (
            <button
              type="button"
              className="wr-scene-acceptall"
              onClick={handleAcceptAll}
              title="Accept all paragraphs in this scene"
            >
              <svg viewBox="0 0 16 16" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M3.5 8.5l3 3 6-7" />
              </svg>
              Accept all
            </button>
          )}

          <span className="wr-scene-acts">
            {!isEmpty && neButtons}
            <AnalysisMenu sceneId={scene.id} onResult={setAnalysisResult} />
          </span>
        </div>
      </div>

      <div className="wr-editor" ref={editorWrapRef}>
        {isEmpty && (
          <div className="wr-scene-empty-cta">
            <div className="wr-cta-row">{neButtons}</div>
          </div>
        )}
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

      {analysisResult && (
        <AnalysisResults
          result={analysisResult}
          onDismiss={() => setAnalysisResult(null)}
        />
      )}

      {saveLabel && (
        <div className="wr-scene-foot">
          <span className={`wr-save ${saveCls}`}>
            <span className="wr-save-pip" />
            {saveLabel}
          </span>
        </div>
      )}
    </article>
  );
}
