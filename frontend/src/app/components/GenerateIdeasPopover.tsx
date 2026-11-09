import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import './generate-ideas-popover.css';

interface IdeaItem {
  id: number | string;
  body: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  /** The element the popover anchors below (its right edge aligns to it). */
  anchorRef: React.RefObject<HTMLElement>;
  braindumps: IdeaItem[];
  /**
   * Idea typed into the page's describe field — pre-seeded as the first added
   * idea row when the popover opens. Empty when opened from a plain button.
   */
  initialIdea?: string;
  /** Header title (e.g. "Generate a character"). */
  title?: string;
  /** One-line intro under the title, framing this as gathering ideas. */
  hint?: string;
  /** Label for the primary action button. */
  generateLabel?: string;
  busyLabel?: string;
  /** Placeholder for the inline add-an-idea field. */
  addPlaceholder?: string;
  /** Small footnote shown under the list (e.g. "New ideas are saved to your braindumps"). */
  saveNote?: string;
  /**
   * The caller has its OWN content (e.g. a filled describe box), so Generate may
   * fire even when no idea is selected here. Characters set this from the
   * describe textarea; threads leave it false (an idea is required).
   */
  extraReady?: boolean;
  /**
   * Does the action really run AI? Drives the ✦ marks on the title and button.
   * The Characters "describe one" flow passes false: it saves the author's own
   * words as a character, no AI involved (SA-151).
   */
  ai?: boolean;
  /**
   * `focus` = the ideas the writer hand-picked (selected braindumps + the ones
   * typed in here). `all` = every braindump (whole-story context). `added` = the
   * newly typed ideas alone, so the caller can persist them as braindumps.
   */
  onGenerate: (payload: { focus: string[]; all: string[]; added: string[] }) => Promise<void>;
}

const POPOVER_WIDTH = 440;

const Check = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12l4 4 10-10" /></svg>
);

/**
 * GenerateIdeasPopover — the shared "generate from your ideas" panel. One list:
 * each braindump is a selectable row (all selected by default), and the last row
 * is an inline field styled like a blank braindump waiting to be written. Used by
 * the plot-threads page and the character init page; the caller maps the emitted
 * idea sets onto its own generate call and persists the new ideas.
 *
 * Portaled to <body> so no scroll/overflow ancestor can clip it — which also
 * means it sits OUTSIDE `.wv2-root`, so generate-ideas-popover.css re-declares
 * the `--ui`/`--serif` font tokens on the root (color tokens ride on <html>).
 */
export function GenerateIdeasPopover({
  open,
  onClose,
  anchorRef,
  braindumps,
  initialIdea,
  title = 'Generate from your ideas',
  hint,
  generateLabel = 'Generate',
  busyLabel = 'Generating…',
  addPlaceholder = 'add an idea…',
  saveNote,
  extraReady = false,
  ai = true,
  onGenerate,
}: Props) {
  const [selected, setSelected] = useState<Set<IdeaItem['id']>>(new Set());
  const [draft, setDraft] = useState('');
  const [added, setAdded] = useState<string[]>([]);
  const [generating, setGenerating] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  // Portaled to <body>, positioned next to the anchor (right edges aligned),
  // kept on-screen, recomputed on scroll/resize. Opens below by default, flips
  // above when the button sits too low for the popover to fit beneath it.
  useLayoutEffect(() => {
    if (!open) return;
    const update = () => {
      const el = anchorRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const left = Math.max(8, Math.min(r.right - POPOVER_WIDTH, window.innerWidth - POPOVER_WIDTH - 8));

      const GAP = 6;
      const ph = ref.current?.offsetHeight ?? 0;
      const spaceBelow = window.innerHeight - r.bottom;
      const spaceAbove = r.top;
      const placeAbove = spaceBelow < ph + GAP + 8 && spaceAbove > spaceBelow;
      const top = placeAbove ? r.top - ph - GAP : r.bottom + GAP;
      const clampedTop = Math.max(8, Math.min(top, window.innerHeight - ph - 8));
      setPos({ top: clampedTop, left });
    };
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [open, anchorRef]);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      const t = e.target as Node;
      if (ref.current?.contains(t)) return;
      if (anchorRef.current?.contains(t)) return; // let the toggle button handle itself
      onClose();
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open, onClose, anchorRef]);

  // Every braindump starts selected so Generate works in one click — the writer
  // unticks the ones they don't want. Init once per open (guarded) so re-renders
  // or a late fetch don't clobber deselections; reset on close re-arms it.
  const inited = useRef(false);
  const seeded = useRef(false);
  useEffect(() => {
    if (open) {
      if (!inited.current && braindumps.length > 0) {
        setSelected(new Set(braindumps.map((bd) => bd.id)));
        inited.current = true;
      }
      if (!seeded.current) {
        seeded.current = true;
        const seed = (initialIdea ?? '').trim();
        if (seed) setAdded([seed]);
      }
    } else {
      inited.current = false;
      seeded.current = false;
      setSelected(new Set());
      setDraft('');
      setAdded([]);
      setGenerating(false);
    }
  }, [open, braindumps, initialIdea]);

  const toggle = useCallback((id: IdeaItem['id']) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const commitDraft = useCallback(() => {
    const t = draft.trim();
    if (!t) return;
    setAdded((prev) => [...prev, t]);
    setDraft('');
  }, [draft]);

  const removeAdded = useCallback((idx: number) => {
    setAdded((prev) => prev.filter((_, i) => i !== idx));
  }, []);

  const handleSubmit = useCallback(async () => {
    // Forgive a half-typed idea on submit so it isn't silently lost.
    const pending = draft.trim();
    const addedAll = pending ? [...added, pending] : added;

    const focus = [
      ...braindumps.filter((bd) => selected.has(bd.id)).map((bd) => bd.body),
      ...addedAll,
    ];
    const all = [...braindumps.map((bd) => bd.body), ...addedAll];

    if (focus.length === 0 && !extraReady) return;
    setGenerating(true);
    try {
      await onGenerate({ focus, all, added: addedAll });
      onClose();
    } catch {
      setGenerating(false);
    }
  }, [braindumps, selected, draft, added, extraReady, onGenerate, onClose]);

  const hasContent = selected.size > 0 || added.length > 0 || draft.trim().length > 0 || extraReady;

  if (!open) return null;

  return createPortal(
    <div
      className="gip-pop"
      ref={ref}
      style={pos ? { top: pos.top, left: pos.left } : { visibility: 'hidden' }}
    >
      <div className="gip-head">
        {ai && <span className="gip-spark">✦</span>}
        <span className="gip-title">{title}</span>
        <button type="button" className="gip-x" onClick={onClose} aria-label="close">×</button>
      </div>
      {hint && <p className="gip-hint">{hint}</p>}

      <div className="gip-list" role="list">
        {braindumps.map((bd) => {
          const on = selected.has(bd.id);
          return (
            <button
              key={bd.id}
              type="button"
              role="listitem"
              className={`gip-item${on ? ' is-on' : ''}`}
              onClick={() => toggle(bd.id)}
              aria-pressed={on}
            >
              <span className="gip-check"><Check /></span>
              <span className="gip-item-txt">{bd.body.length > 160 ? bd.body.slice(0, 160) + '…' : bd.body}</span>
            </button>
          );
        })}

        {added.map((t, i) => (
          <div key={`added-${i}`} className="gip-item gip-item--new is-on" role="listitem">
            <span className="gip-check"><Check /></span>
            <span className="gip-item-txt">{t.length > 160 ? t.slice(0, 160) + '…' : t}</span>
            <button
              type="button"
              className="gip-item-x"
              onClick={() => removeAdded(i)}
              aria-label="remove idea"
            >
              ×
            </button>
          </div>
        ))}

        {/* last row — a blank braindump waiting to be written */}
        <label className="gip-item gip-item--add">
          <span className="gip-add-plus" aria-hidden="true">+</span>
          <input
            className="gip-add-input"
            placeholder={addPlaceholder}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                commitDraft();
              }
            }}
          />
          {draft.trim() && (
            <button type="button" className="gip-add-go" onClick={commitDraft} aria-label="add idea">
              add
            </button>
          )}
        </label>
      </div>

      {saveNote && <p className="gip-savenote">{saveNote}</p>}

      <div className="gip-actions">
        <button
          type="button"
          className="gip-go"
          disabled={!hasContent || generating}
          onClick={handleSubmit}
        >
          {ai && <span className="gip-go-spark">✦</span>}
          {generating ? busyLabel : generateLabel}
        </button>
        <button type="button" className="gip-cancel" onClick={onClose} disabled={generating}>
          Cancel
        </button>
      </div>
    </div>,
    document.body,
  );
}
