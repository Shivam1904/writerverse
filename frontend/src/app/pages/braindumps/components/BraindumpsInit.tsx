import { useEffect, useRef, useState } from 'react';
import { braindumpsCopy } from '../../../../config/braindumps';
import { IDEAS } from '../../../../config/lexicon';
import { InitHead } from '../../../components/InitHead';
import '../braindumps.css';
import { Kbd, Spark } from '../../../ui';
import { useIdeaDraft } from '../useIdeaDraft';

interface Props {
  /** Persist one brain dump line; resolves true on success. Called per Enter. */
  onSubmit: (body: string) => Promise<boolean>;
  /** Leave the init surface and switch to the normal stream/canvas view. */
  onDone: () => void;
  /** Keep unsent text on this device under this key (see useIdeaDraft). */
  draftKey?: string;
}

/**
 * Starter chips under the empty box. A click writes the starter into the box so
 * a stuck writer has half a sentence to finish (SA-274). The author still writes
 * the idea; we only remove the blank page.
 */
const SEEDS = [
  { label: 'a character', starter: 'A character who ' },
  { label: 'a world', starter: 'A world where ' },
  { label: 'a what-if', starter: 'What if ' },
  { label: 'a scrap of dialogue', starter: '"' },
];
const STARTERS = new Set(SEEDS.map((s) => s.starter));

/** The box text after a starter click: an empty box (or one still holding an
 *  untouched starter) gets the new starter; the author's own words are kept,
 *  and the starter begins a new line under them. */
function withStarter(text: string, starter: string): string {
  if (!text.trim() || STARTERS.has(text)) return starter;
  return `${text.trimEnd()}\n${starter}`;
}

/**
 * Braindumps init — first-touch brain-dump surface.
 *
 * One input: type the first thought, press Enter, and as soon as it saves we
 * drop straight into the notebook (the normal stream/canvas view), where the
 * always-present chat input handles every subsequent dump. The init surface is
 * purely the empty-state on-ramp — it doesn't try to be a second place to keep
 * adding ideas.
 */
export function BraindumpsInit({ onSubmit, onDone, draftKey }: Props) {
  const { text, setText, clear } = useIdeaDraft(draftKey);
  const [busy, setBusy] = useState(false);
  const taRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.focus();
    // A restored draft: carry on typing at its end.
    ta.setSelectionRange(ta.value.length, ta.value.length);
  }, []);

  const commit = async () => {
    const body = text.trim();
    if (!body || busy) return;
    setBusy(true);
    try {
      const ok = await onSubmit(body);
      if (ok) {
        // first spark is saved — leave init and let the notebook take over.
        clear();
        onDone();
      } else {
        setBusy(false);
        taRef.current?.focus();
      }
    } catch {
      setBusy(false);
      taRef.current?.focus();
    }
  };

  const applySeed = (starter: string) => {
    const next = withStarter(text, starter);
    setText(next);
    // Back to the box with the caret after the starter, ready to type.
    requestAnimationFrame(() => {
      const ta = taRef.current;
      if (!ta) return;
      ta.focus();
      ta.setSelectionRange(next.length, next.length);
    });
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter adds; Shift+Enter keeps a soft break for the rare multi-line dump.
    // ⌘/Ctrl+Enter also adds, matching the keyhint.
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void commit();
    }
  };

  return (
    <div className="wv2-init-stage bdi-shell">
      <div className="wv2-init bdi-field">
        <InitHead
          section="braindumps"
          eyebrow="Imagine · ideas"
          title={<>Jot down<br />your ideas<em>.</em></>}
          sub="Characters, places, scenes, world rules, what-ifs. One line at a time, in any order."
        />

        {/* the paper — live input + foot */}
        <div className="bdi-paper" data-label={IDEAS.one}>
          <textarea
            ref={taRef}
            className="bdi-input"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="a name, a place, a what-if, a line you overheard…"
            rows={3}
            aria-label={`your first ${IDEAS.one}`}
            disabled={busy}
          />

          <div className="bdi-foot">
            <div className="bdi-seeds">
              {SEEDS.map((seed) => (
                <button
                  key={seed.label}
                  type="button"
                  className="bdi-seed"
                  disabled={busy}
                  onClick={() => applySeed(seed.starter)}
                >
                  {seed.label}
                </button>
              ))}
            </div>
            <span className="bdi-keyhint">
              <Kbd>⌘</Kbd>
              <Kbd>↵</Kbd>
              <span className="bdi-keyhint-w">to begin</span>
            </span>
          </div>
        </div>

        {/* quiet note about where the ideas end up — no big visual treatment */}
        <p className="bdi-becomes">
          they show up as cards you can <b>pin</b>, <b>tag</b> and <b>filter</b>.
        </p>

        {/* what happens to each idea — keep the pearl-glass flourish */}
        <div className="bdi-organize">
          <Spark style={{ fontSize: 12 }} />
          <span className="txt">{braindumpsCopy.taggingHint}</span>
        </div>
      </div>
    </div>
  );
}
