import { useMemo } from 'react';
import { usePendingByCapability } from '../../../modules/proposal';

/**
 * Threads page surface for pending storyline proposals. Sits at the top of the
 * threads page and renders each pending suggestion as a green-tinted, read-only
 * storyline preview — same visual rhythm as a real ThreadCard so the writer is
 * comparing apples-to-apples before accepting.
 *
 * Covers every capability that produces a storyline: `generate_thread` and its
 * description-seeded sibling `generate_thread_from_description` (both nest the
 * outline under `plot_thread`), plus `run_user_wishes_rough` (the "Extract user
 * plot" button → `rough_outline`). `generate_thread_from_description` is what a
 * gold story-seed "Explore further" chains into (see <StorySeedSuggestions> +
 * gateway follow-up push), so it MUST land here or an explored seed would vanish
 * after accept. Same {title, items[]} shape, same surface — without this, a
 * rough/seeded plot has nowhere to land on the threads page (the rail hides
 * same-section proposals).
 *
 * Same source-of-truth as every other proposal surface: reads
 * `useProposalStore` via `usePendingByCapability`, so accepting/cancelling
 * here dismisses the chat surface, toast, and any other render in lockstep.
 */
interface PreviewBeat {
  id: string;
  kind: 'heading' | 'text' | 'placeholder';
  text: string;
}

// Flatten the proposal's items into renderable beats. Headings stay INLINE as
// 'heading' rows — exactly like the live <ThreadCard> now renders them — rather
// than being lifted out into phase labels.
function toPreviewBeats(items: any[]): PreviewBeat[] {
  const out: PreviewBeat[] = [];
  for (const it of items || []) {
    if (!it || typeof it !== 'object') continue;
    const text = String(it.text || '').trim();
    if (!text) continue;
    const kind = it.kind === 'heading' ? 'heading' : it.kind === 'placeholder' ? 'placeholder' : 'text';
    out.push({ id: String(it.id ?? `${out.length}`), kind, text });
  }
  return out;
}

/** The suggested-storyline cards (or []) — exposed so a parent (the Threads
 *  "Create" section) can decide whether to render at all. Single source of truth
 *  with the component below, which reads the same hook. */
export function useThreadSuggestionCards() {
  const generated = usePendingByCapability('generate_thread');
  const fromDescription = usePendingByCapability('generate_thread_from_description');
  const rough = usePendingByCapability('run_user_wishes_rough');
  const pending = useMemo(
    () => [...generated, ...fromDescription, ...rough],
    [generated, fromDescription, rough],
  );
  return useMemo(
    () =>
      pending
        .map((p) => {
          const pt = p.result?.plot_thread || p.result?.rough_outline || p.result || {};
          const items = Array.isArray(pt.items) ? pt.items : [];
          return {
            proposalId: p.proposalId,
            title: String(pt.title || 'New storyline').trim(),
            scopeName: pt?.scope?.name || pt?.scope?.type || null,
            beats: toPreviewBeats(items),
            onAccept: p.onAccept,
            onCancel: p.onCancel,
          };
        })
        .filter((c) => c.beats.length > 0),
    [pending],
  );
}

export function ThreadSuggestions() {
  const cards = useThreadSuggestionCards();

  if (cards.length === 0) return null;

  const acceptAll = () => cards.forEach((c) => c.onAccept());

  return (
    <div className="thr-suggest">
      <div className="thr-suggest-head">
        <span className="thr-suggest-spark" aria-hidden="true">✦</span>
        <span className="thr-suggest-ttl">Suggested storylines</span>
        <span className="thr-suggest-meta">
          generated · <b>{cards.length} {cards.length === 1 ? 'thread' : 'threads'}</b>
        </span>
      </div>

      <div className="thr-suggest-list">
        {cards.map((c) => (
          <article key={c.proposalId} className="thr-sug-card">
            <header className="thr-sug-head">
              <div className="thr-sug-nm">
                <span className="thr-sug-swatch" />
                <span className="thr-sug-title">{c.title}</span>
                {c.scopeName && <span className="thr-sug-scope">{c.scopeName}</span>}
              </div>
              <div className="thr-sug-acts">
                <button
                  type="button"
                  className="thr-sug-dismiss"
                  title="Dismiss"
                  onClick={c.onCancel}
                >
                  <svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" /></svg>
                </button>
                <button
                  type="button"
                  className="thr-sug-accept"
                  onClick={c.onAccept}
                >
                  <svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" /></svg>
                  Make real
                </button>
              </div>
            </header>

            <div className="thr-sug-body">
              {/* Read-only preview beats reuse the live .thr-beat* styling
                  verbatim — headings inline + bold, text = solid dot, placeholder
                  = dashed ring — so a suggestion reads exactly like a real
                  ThreadCard. Sage-tinted to the suggestion card's theme; no
                  editing/drag/delete affordances, so the bare classes stay static. */}
              <ol className="thr-beats">
                {c.beats.map((b) => {
                  const isHeading = b.kind === 'heading';
                  const isPh = b.kind === 'placeholder';
                  return (
                    <li key={b.id} className="thr-beat-wrapper">
                      <div className={`thr-beat${isHeading ? ' heading' : isPh ? ' placeholder' : ''}`}>
                        {!isHeading && (
                          <span
                            className="thr-beat-mk"
                            style={
                              isPh
                                ? { background: 'transparent', border: '1.5px dashed var(--sage)' }
                                : { background: 'var(--sage)' }
                            }
                          />
                        )}
                        <span className="thr-beat-text">{b.text}</span>
                      </div>
                    </li>
                  );
                })}
              </ol>
            </div>
          </article>
        ))}
      </div>

      {cards.length > 1 && (
        <div className="thr-suggest-foot">
          <button type="button" className="thr-suggest-all" onClick={acceptAll}>
            Make all real
          </button>
        </div>
      )}
    </div>
  );
}
