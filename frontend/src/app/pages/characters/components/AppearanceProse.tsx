import { useCallback, useEffect, useRef, useState } from 'react';
import { FieldEdit, type FieldProposal } from './FieldEdit';

/**
 * AppearanceProse — band ① sub-block: a character's physical appearance, authored
 * as a "fill-in-the-blank" natural-language template (Mad-Libs style).
 *
 * Two paths, both visible, no mode toggle:
 *  - FILL THE BLANKS — the structured slots (age, gender, build, hair, eyes,
 *    clothing, home, costumes, features) are woven into prose as inline blanks.
 *    Click one to start, type, press Tab to jump to the next blank (Shift-Tab for
 *    previous, Enter advances, Esc exits). The active blank is highlighted.
 *  - WRITE A DESCRIPTION — a free `description` line above the template. If the
 *    author writes one, that's enough; the blanks stay optional.
 *
 * Everything persists into the single `appearance` JSON dict on the character via
 * `onCommit` (Route.WRITE — the same direct-CRUD tier the rest of the hero uses).
 * We keep a local mirror of the dict so a chain of rapid Tabs never clobbers a
 * sibling slot, and only write when something actually changed.
 */

// The blanks, in Tab order. `lead`/`tail` are the scaffolding words around each
// value so the sentence reads naturally; `prompt` is the muted gap text.
// NOTE: `home` lives in the WORLD facet now (2026-06-08 redesign), so it's no
// longer one of these appearance blanks — the World facet reads/writes
// appearance.home directly.
const BLANKS = [
  { key: 'age',      prompt: 'how old?' },
  { key: 'gender',   prompt: 'gender?' },
  { key: 'build',    prompt: 'build & height?' },
  { key: 'hair',     prompt: 'hair?' },
  { key: 'eyes',     prompt: 'eyes?' },
  { key: 'clothing', prompt: 'everyday clothes?' },
  { key: 'costumes', prompt: 'special-occasion outfits?' },
  { key: 'features', prompt: 'anything distinctive?' },
] as const;

const ORDER: string[] = BLANKS.map((b) => b.key);

const DESC_HINT =
  'Their look — age, gender, build, hair, eyes, what they wear, costumes, ' +
  'distinguishing marks. Write it in a sentence, or fill the blanks below.';

// Keys this component owns inside the appearance dict (used for the dirty check).
const OWNED = ['description', ...ORDER];

function shallowSame(a: any, b: any): boolean {
  const x = a || {};
  const y = b || {};
  for (const k of OWNED) {
    if (String(x[k] ?? '') !== String(y[k] ?? '')) return false;
  }
  return true;
}

export function AppearanceProse({
  characterName,
  appearance,
  onCommit,
  proposedFor,
}: {
  characterName?: string;
  appearance: any;
  onCommit: (next: Record<string, any>) => void;
  // Per-sub-key proposal overlay: returns a FieldProposal for one appearance key
  // (age/eyes/…/description) when the AI has a pending value for it, else undefined.
  // Each blank then edits / accepts / rejects independently, just like top-level fields.
  proposedFor?: (subkey: string) => FieldProposal | undefined;
}) {
  // Which structured blank is open (null = none). Description has its own flag.
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [descEditing, setDescEditing] = useState(false);

  // Local mirror of the WHOLE appearance dict — we always persist from this so a
  // single-slot write never drops the others (or the free description).
  const [appear, setAppear] = useState<Record<string, any>>(() => ({ ...(appearance || {}) }));
  const appearRef = useRef(appear);
  const writeMirror = useCallback((obj: Record<string, any>) => {
    appearRef.current = obj;
    setAppear(obj);
  }, []);

  // Re-sync from upstream only while idle, so an in-flight refetch can't stomp a
  // value the author is mid-typing.
  useEffect(() => {
    if (activeKey === null && !descEditing) writeMirror({ ...(appearance || {}) });
  }, [appearance, activeKey, descEditing, writeMirror]);

  const setField = useCallback((key: string, v: string) => {
    writeMirror({ ...appearRef.current, [key]: v });
  }, [writeMirror]);

  const persist = useCallback(() => {
    if (shallowSame(appearRef.current, appearance)) return; // no-op write guard
    onCommit({ ...appearRef.current });
  }, [appearance, onCommit]);

  // When Tab/Shift-Tab jumps to another blank we set this so the unmounting
  // input's blur handler doesn't race the jump back to null.
  const movingRef = useRef(false);

  const advance = useCallback((dir: 1 | -1) => {
    persist();
    const i = ORDER.indexOf(activeKey ?? '');
    const ni = i + dir;
    const next = ni >= 0 && ni < ORDER.length ? ORDER[ni] : null;
    movingRef.current = next !== null;
    setActiveKey(next);
  }, [activeKey, persist]);

  const onBlankKey = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Tab') { e.preventDefault(); advance(e.shiftKey ? -1 : 1); }
    else if (e.key === 'Enter') { e.preventDefault(); advance(1); }
    else if (e.key === 'Escape') { e.preventDefault(); persist(); setActiveKey(null); }
  }, [advance, persist]);

  const onBlankBlur = useCallback(() => {
    if (movingRef.current) { movingRef.current = false; return; }
    persist();
    setActiveKey(null);
  }, [persist]);

  const focusEnd = (el: HTMLInputElement | HTMLTextAreaElement | null) => {
    if (!el) return;
    el.focus();
    const n = el.value.length;
    try { el.setSelectionRange(n, n); } catch { /* ignore */ }
  };

  // One blank: input when active, else the value (click to edit) or the gap prompt.
  // When a proposal is pending for this key, hand off to FieldEdit (green, editable,
  // its own ✓/✗) so the blank behaves exactly like every other proposed field.
  const blank = (key: string) => {
    const b = BLANKS.find((x) => x.key === key)!;
    const fp = proposedFor?.(key);
    if (fp) {
      return (
        <FieldEdit
          value={String(appear[key] ?? '')}
          onCommit={(v) => onCommit({ ...(appearance || {}), [key]: v })}
          placeholder={b.prompt}
          restClassName="cst-sent-val"
          editClassName="cst-fe-inline"
          proposed={fp}
          stop
        />
      );
    }
    if (activeKey === key) {
      return (
        <input
          className="cst-fe-inline"
          autoFocus
          value={appear[key] ?? ''}
          placeholder={b.prompt}
          spellCheck={false}
          onChange={(e) => setField(key, e.target.value)}
          onBlur={onBlankBlur}
          onKeyDown={onBlankKey}
          onFocus={(e) => focusEnd(e.currentTarget)}
        />
      );
    }
    const v = String(appear[key] ?? '').trim();
    return v ? (
      <span className="cst-sent-val" onClick={() => setActiveKey(key)} title="Click to edit">{v}</span>
    ) : (
      <span className="cst-sent-gap" onClick={() => setActiveKey(key)} title="Click to fill">— {b.prompt}</span>
    );
  };

  const name = characterName || 'They';
  const desc = String(appear.description ?? '');
  const descProp = proposedFor?.('description');

  return (
    <div className="cst-appear">
      {/* free description — the "or write your own" path; enough on its own.
          A pending proposal hands off to FieldEdit (green, editable, own ✓/✗). */}
      {descProp ? (
        <FieldEdit
          value={desc}
          onCommit={(v) => onCommit({ ...(appearance || {}), description: v })}
          multiline
          restTag="p"
          restClassName="cst-desc"
          editClassName="cst-fe-block"
          placeholder={DESC_HINT}
          proposed={descProp}
        />
      ) : descEditing ? (
        <textarea
          className="cst-fe-block"
          autoFocus
          value={desc}
          placeholder={DESC_HINT}
          onChange={(e) => setField('description', e.target.value)}
          onBlur={() => { persist(); setDescEditing(false); }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') { e.preventDefault(); persist(); setDescEditing(false); }
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); persist(); setDescEditing(false); }
          }}
          onFocus={(e) => focusEnd(e.currentTarget)}
        />
      ) : desc ? (
        <p className="cst-desc" onClick={() => setDescEditing(true)} title="Click to edit">{desc}</p>
      ) : (
        <button type="button" className="cst-appear-write" onClick={() => setDescEditing(true)}>
          + describe their look in your own words
        </button>
      )}

      {/* fill-in-the-blank template — natural-language prose with inline slots */}
      <div className="cst-appear-tpl">
        <p className="cst-sent">
          <span className="cst-sent-subj">{name}</span>{' '}
          is {blank('age')}, {blank('gender')}, {blank('build')} in build, with{' '}
          {blank('hair')} hair and {blank('eyes')} eyes.
        </p>
        <p className="cst-sent">
          Day to day they wear {blank('clothing')}.
        </p>
        <p className="cst-sent">
          For special occasions: {blank('costumes')}. What stands out: {blank('features')}.
        </p>
        {activeKey && (
          <span className="cst-appear-kbd">Tab ↹ next · ⇧Tab back · Esc done</span>
        )}
      </div>
    </div>
  );
}
