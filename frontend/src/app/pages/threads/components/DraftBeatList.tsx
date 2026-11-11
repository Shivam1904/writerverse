import { useCallback, useEffect, useRef } from 'react';
import { Trash2 } from 'lucide-react';

export type DraftBeatKind = 'text' | 'placeholder' | 'heading';

export interface DraftBeat {
  /** Stable React/focus key — never persisted. */
  key: string;
  text: string;
  /** `text` = a beat you've written (solid dot); `placeholder` = a templated
   *  slot to fill (dashed dot); `heading` = a bold section label (no dot, no
   *  number). Carried through to the backend `beats` arg. */
  kind: DraftBeatKind;
}

let seq = 0;
export const newDraftBeat = (text = '', kind: DraftBeatKind = 'text'): DraftBeat => ({
  key: `db-${(seq++).toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
  text,
  kind,
});

function autoGrow(el: HTMLTextAreaElement | null) {
  if (!el) return;
  el.style.height = 'auto';
  el.style.height = `${el.scrollHeight}px`;
}

interface Props {
  beats: DraftBeat[];
  onChange: (beats: DraftBeat[]) => void;
  /** Marker tint — defaults to the modal accent (terra). */
  color?: string;
}

/**
 * Editable beats list for the New-storyline modal. Renders with the SAME
 * `.thr-beat*` classes the live <ThreadCard> uses, so the draft reads almost
 * exactly like the storyline once created: a dot on a left rail (solid = a beat
 * you wrote, dashed = a templated placeholder to fill), serif text, an
 * auto-number, hover-delete, and a trailing "+ Add a beat".
 *
 * Pure local editing — the parent owns the array; nothing persists until the
 * thread is created.
 */
export function DraftBeatList({ beats, onChange, color = 'var(--terra)' }: Props) {
  const taRefs = useRef(new Map<string, HTMLTextAreaElement>());
  // Set just before an onChange that should land focus on a (possibly new) row;
  // applied on the next commit once its textarea has mounted.
  const focusKey = useRef<string | null>(null);

  useEffect(() => {
    const k = focusKey.current;
    if (!k) return;
    focusKey.current = null;
    const el = taRefs.current.get(k);
    if (el) {
      el.focus();
      const len = el.value.length;
      el.setSelectionRange(len, len);
      autoGrow(el);
    }
  });

  const setText = useCallback(
    (key: string, text: string, el: HTMLTextAreaElement) => {
      autoGrow(el);
      onChange(beats.map((b) => (b.key === key ? { ...b, text } : b)));
    },
    [beats, onChange],
  );

  const remove = useCallback(
    (key: string) => onChange(beats.filter((b) => b.key !== key)),
    [beats, onChange],
  );

  const addAfter = useCallback(
    (index: number) => {
      const fresh = newDraftBeat('', 'text');
      const next = [...beats];
      next.splice(index + 1, 0, fresh);
      focusKey.current = fresh.key;
      onChange(next);
    },
    [beats, onChange],
  );

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>, key: string, index: number) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        addAfter(index);
        return;
      }
      // Backspace on an empty row removes it and hops focus to the neighbour.
      if (e.key === 'Backspace' && e.currentTarget.value === '' && beats.length > 1) {
        e.preventDefault();
        focusKey.current = beats[index - 1]?.key ?? beats[index + 1]?.key ?? null;
        remove(key);
      }
    },
    [addAfter, beats, remove],
  );

  return (
    <>
      <ol className="thr-beats thr-draft-beats">
        {beats.map((b, i) => (
          <li key={b.key} className="thr-beat-wrapper">
            <div
              className={`thr-beat editing${b.kind === 'placeholder' ? ' placeholder' : ''}${
                b.kind === 'heading' ? ' heading' : ''
              }`}
            >
              {b.kind !== 'heading' && (
                <span
                  className="thr-beat-mk"
                  style={
                    b.kind === 'placeholder'
                      ? { background: 'transparent', border: `1.5px dashed ${color}` }
                      : { background: color }
                  }
                />
              )}
              <textarea
                ref={(el) => {
                  if (el) {
                    taRefs.current.set(b.key, el);
                    autoGrow(el);
                  } else {
                    taRefs.current.delete(b.key);
                  }
                }}
                className="thr-beat-input"
                rows={1}
                value={b.text}
                placeholder={
                  b.kind === 'heading'
                    ? 'Section heading…'
                    : b.kind === 'placeholder'
                      ? 'Name this beat…'
                      : 'Write a beat…'
                }
                spellCheck
                onChange={(e) => setText(b.key, e.target.value, e.currentTarget)}
                onKeyDown={(e) => onKeyDown(e, b.key, i)}
              />
              <button
                type="button"
                className="thr-beat-del"
                title="Remove beat"
                aria-label="Remove beat"
                onClick={() => remove(b.key)}
              >
                <Trash2 size={12} strokeWidth={1.8} />
              </button>
            </div>
          </li>
        ))}
      </ol>

      <button
        type="button"
        className="thr-beat-add"
        onClick={() => addAfter(beats.length - 1)}
      >
        <span className="thr-beat-add-plus">+</span> Add a beat
      </button>
    </>
  );
}
