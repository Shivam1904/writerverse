import { useMemo, useState } from 'react';
import { usePendingByCapability } from '../../../modules/proposal';

/**
 * Threads page surface for `run_init_elements` STORY seeds — the "half proposal"
 * cousin of <ThreadSuggestions>. Where the green block shows fully-drafted
 * storylines (beats and all) ready to "Make real", this gold block shows the
 * raw story idea a braindump extraction surfaced: just a title + summary, no
 * beats yet.
 *
 * Accepting one ("Explore further") commits the story element and chains a
 * `generate_thread_from_description` follow-up on the backend
 * (commit/_proposals.py `_followup_story_to_thread`), which lands as a full
 * green storyline suggestion. So a seed doesn't become a thread directly — it
 * blooms into a draftable thread the author still gets to approve.
 *
 * `run_init_elements` fans out one proposal per extracted element; we keep only
 * the `story` slice here (characters land on the cast page, items/rules in the
 * world). Same source of truth as every other surface: reads `useProposalStore`
 * via `usePendingByCapability`, so accepting/dismissing here dismisses the chat
 * surface, toast, and any other render in lockstep.
 */
/** The story-seed cards (or []) — exposed so a parent (the Threads "Create"
 *  section) can decide whether to render at all. Single source of truth with the
 *  component below, which reads the same hook. */
export function useStorySeeds() {
  const extracted = usePendingByCapability('run_init_elements');
  return useMemo(
    () =>
      extracted
        .filter((p) => p.result?.type === 'story')
        .map((p) => {
          const story =
            p.result?.story && typeof p.result.story === 'object' ? p.result.story : p.result;
          return {
            proposalId: p.proposalId,
            title: String(story?.title || p.result?.title || 'Story idea').trim(),
            summary: String(story?.summary || story?.description || '').trim(),
            onAccept: p.onAccept,
            onCancel: p.onCancel,
          };
        })
        .filter((s) => s.summary.length > 0),
    [extracted],
  );
}

export function StorySeedSuggestions() {
  const seeds = useStorySeeds();

  // Per-card "exploring" flag. Accept kicks off a multi-second thread
  // generation; the proposal stays in the store (card stays mounted) until it
  // resolves, then is removed — so the card unmounts and takes its busy state
  // with it. That's why we only ever ADD to `busy` and never clear it by hand
  // (onAccept is fire-and-forget — the store wiring hands back no promise).
  const [busy, setBusy] = useState<Set<string | number>>(new Set());
  const explore = (id: string | number, onAccept: () => void) => {
    if (busy.has(id)) return;
    setBusy((prev) => new Set(prev).add(id));
    onAccept();
  };

  if (seeds.length === 0) return null;

  const exploreAll = () => seeds.forEach((s) => explore(s.proposalId, s.onAccept));
  const allBusy = seeds.every((s) => busy.has(s.proposalId));

  return (
    <div className="thr-seed">
      <div className="thr-seed-head">
        <span className="thr-seed-spark" aria-hidden="true">✦</span>
        <span className="thr-seed-ttl">Story ideas to explore</span>
        <span className="thr-seed-meta">
          extracted · <b>{seeds.length} {seeds.length === 1 ? 'idea' : 'ideas'}</b>
        </span>
      </div>

      <div className="thr-seed-list">
        {seeds.map((s) => {
          const isBusy = busy.has(s.proposalId);
          return (
            <article key={s.proposalId} className="thr-seed-card">
              <div className="thr-seed-card-head">
                <div className="thr-seed-nm">
                  <span className="thr-seed-swatch" aria-hidden="true" />
                  <span className="thr-seed-title">{s.title}</span>
                </div>
                <div className="thr-seed-acts">
                  <button
                    type="button"
                    className="thr-seed-dismiss"
                    title="Dismiss"
                    onClick={s.onCancel}
                    disabled={isBusy}
                  >
                    <svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" /></svg>
                  </button>
                  <button
                    type="button"
                    className="thr-seed-explore"
                    onClick={() => explore(s.proposalId, s.onAccept)}
                    disabled={isBusy}
                  >
                    {isBusy ? (
                      <>
                        <span className="thr-seed-spinner" aria-hidden="true" />
                        Exploring…
                      </>
                    ) : (
                      <>
                        <span className="thr-seed-explore-spark" aria-hidden="true">✦</span>
                        Explore further
                      </>
                    )}
                  </button>
                </div>
              </div>

              <p className="thr-seed-summary">{s.summary}</p>
            </article>
          );
        })}
      </div>

      {seeds.length > 1 && (
        <div className="thr-seed-foot">
          <button type="button" className="thr-seed-all" onClick={exploreAll} disabled={allBusy}>
            {allBusy ? 'Exploring…' : '✦ Explore all'}
          </button>
        </div>
      )}
    </div>
  );
}
