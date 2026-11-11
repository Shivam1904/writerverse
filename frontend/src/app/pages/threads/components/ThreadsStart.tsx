import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { loadCharacters } from '../../characters/data';
import { ThreadSuggestions } from './ThreadSuggestions';
import { StorySeedSuggestions } from './StorySeedSuggestions';
import { InitHead } from '../../../components/InitHead';
import { Avatar } from '../../../components/Avatar';
import type { NewThreadDraft } from './NewThreadModal';

interface Props {
  projectId?: string;
  /** "Extract from my scenes" is only possible with ≥1 braindump and ≥1 character. */
  canExtract: boolean;
  /** Total beats across the whole outline. "Extract from scenes" only shows once
   *  there are ≥2 beats anywhere to mine. */
  beats: number;
  extracting: boolean;
  /** An extract proposal is waiting for the author's review (accept/reject).
   *  Extract only ever QUEUES a suggestion, so this is "queued", never "done". */
  extractQueued: boolean;
  onExtract: () => void;
  /** Opens the generate-thread popover, optionally pre-seeding it with the idea
   *  typed into the describe field. In the empty state the popover anchors to
   *  this page's own "Suggest threads" button (see `suggestRef`). */
  onSuggest: (seed?: string) => void;
  /** Anchor for the generate popover — attached to the "Suggest threads" button
   *  so the popover opens beneath it when there's no page header to anchor to. */
  suggestRef?: React.Ref<HTMLButtonElement>;
  /** Opens the New storyline modal, pre-seeded with the lane's scope. */
  onNewThread: (initial?: Partial<NewThreadDraft>) => void;
}

/**
 * Threads-start — the first time you open Plot threads (handoff: threads-start.html).
 * A thread is one promise the story keeps; the page encourages MANY, across three
 * scope lanes — story-wide, tied to a character, or carrying an idea. Each lane's
 * quick-start chips and "new" button open the New storyline modal pre-seeded with
 * that scope. A helper row offers to mine existing scenes, and a cross-door hands
 * off to the grand-outline page.
 */
export function ThreadsStart({
  projectId,
  canExtract,
  beats,
  extracting,
  extractQueued,
  onExtract,
  onSuggest,
  suggestRef,
  onNewThread,
}: Props) {
  const navigate = useNavigate();
  const [characters, setCharacters] = useState<any[]>([]);
  // The describe field above the lanes — hand its text to the generate popover
  // (which opens pre-seeded) on Enter or the Suggest button.
  const [idea, setIdea] = useState('');

  useEffect(() => {
    let cancelled = false;
    loadCharacters(projectId)
      .then((res: any) => {
        if (!cancelled) setCharacters(res?.characters ?? []);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [projectId]);

  const gotoOutline = () => projectId && navigate(`/project/${projectId}/outline`);
  const gotoPeople = () => projectId && navigate(`/project/${projectId}/characters`);

  return (
    <div className="wv2-init thr-start">
      <InitHead
        section="plot-threads"
        eyebrow="Plan · plot threads"
        title={<>Start your<br /><em>storylines.</em></>}
        sub={<>A thread is one promise your story keeps — plot, arc, or theme. Most books run several; start as many as you like.</>}
      />

      {/* 1 · suggestions (shared; null when nothing pending) — sits under the hero.
          Gold story seeds (run_init_elements) above the green drafted storylines,
          same funnel order as the populated page. */}
      <StorySeedSuggestions />
      <ThreadSuggestions />

      {/* 2 · describe → suggest — same plain format as the People page's
          describe → generate (borderless field, action in the footer). Enter or
          the button opens the generate popover, pre-seeded with the text. */}
      <div className="wv2-init-seam">
        <span className="wv2-init-seam-lbl">Describe a storyline · we&rsquo;ll draft it</span>
        <span className="wv2-init-seam-ln" />
      </div>

      <div className="thr-suggest">
        <input
          className="thr-suggest-input"
          value={idea}
          onChange={(e) => setIdea(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              onSuggest(idea.trim() || undefined);
            }
          }}
          placeholder="a sentence is plenty — “the detective realizes her own partner is the killer”…"
          aria-label="describe a storyline"
        />
        <div className="thr-suggest-foot">
          <span className="thr-suggest-hint">A promise, a tension, a question the book keeps — one line is enough.</span>
          <button
            type="button"
            className="wv2-btn wv2-btn-ai"
            ref={suggestRef}
            onClick={() => onSuggest(idea.trim() || undefined)}
          >
            <svg viewBox="0 0 24 24"><path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5L18 18M18 6l-2.5 2.5M8.5 15.5L6 18" /></svg>
            Suggest threads
          </button>
        </div>
      </div>

      <div className="thr-start-reassure">
        <svg viewBox="0 0 24 24"><path d="M9 12l2 2 4-4" /><circle cx="12" cy="12" r="9" /></svg>
        <span>Nothing&rsquo;s locked in — <b>add, rename, or drop</b> threads anytime.</span>
      </div>

      <div className="thr-lanes">
        {/* STORY-SCOPED */}
        <section className="thr-lane" style={{ ['--c' as any]: '#3a6dbe', ['--c-soft' as any]: 'var(--terra-soft)' }}>
          <div className="thr-lane-head">
            <span className="thr-lane-ic"><svg viewBox="0 0 24 24"><path d="M4 18c4-1 5-12 9-13" /><path d="M11 5c4 1 5 12 9 13" /><circle cx="4" cy="18" r="1.6" /><circle cx="20" cy="18" r="1.6" /></svg></span>
            <div>
              <div className="thr-lane-nm">Story threads</div>
              <div className="thr-lane-kick">the whole book</div>
            </div>
          </div>
          <p className="thr-lane-desc">Main plot, subplots, setups that pay off later.</p>
          <div className="thr-tchips">
            <button className="thr-tchip" onClick={() => onNewThread({ scopeType: 'story', title: 'Main plot' })}><span className="sw" />Main plot<span className="plus">+</span></button>
            <button className="thr-tchip" onClick={() => onNewThread({ scopeType: 'story', title: 'A subplot' })}><span className="sw" />Subplot<span className="plus">+</span></button>
            <button className="thr-tchip" onClick={() => onNewThread({ scopeType: 'story', title: 'Setup → payoff' })}><span className="sw" />Setup <span className="desc">→ payoff</span><span className="plus">+</span></button>
          </div>
          <button className="thr-lane-add" onClick={() => onNewThread({ scopeType: 'story' })}>
            <svg viewBox="0 0 24 24"><path d="M12 5v14" /><path d="M5 12h14" /></svg>New story thread
          </button>
        </section>

        {/* CHARACTER-SCOPED */}
        <section className="thr-lane" style={{ ['--c' as any]: '#5c5476', ['--c-soft' as any]: '#e6dadf' }}>
          <div className="thr-lane-head">
            <span className="thr-lane-ic"><svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="3.4" /><path d="M5.5 20c0-3.6 3-6 6.5-6s6.5 2.4 6.5 6" /></svg></span>
            <div>
              <div className="thr-lane-nm">Character arcs</div>
              <div className="thr-lane-kick">tied to a person</div>
            </div>
          </div>
          <p className="thr-lane-desc">How someone changes — tied to a person in your cast.</p>
          {characters.length > 0 ? (
            <div className="thr-tchips">
                {characters.slice(0, 3).map((c, i) => (
                  <button
                    key={c.id ?? i}
                    className="thr-tchip person"
                    onClick={() => onNewThread({ scopeType: 'character', scopeName: c.name, title: `${c.name}'s arc` })}
                  >
                    <Avatar name={c.name || '?'} size="sm" />
                    {c.name}'s arc<span className="plus">+</span>
                  </button>
                ))}
            </div>
          ) : (
            <div className="thr-lane-empty">
              No one in your cast yet. <a onClick={gotoPeople}>Add a person →</a>
            </div>
          )}
          <button className="thr-lane-add" onClick={() => onNewThread({ scopeType: 'character' })}>
            <svg viewBox="0 0 24 24"><path d="M12 5v14" /><path d="M5 12h14" /></svg>Arc for someone else
          </button>
        </section>

        {/* IDEA / OTHER */}
        <section className="thr-lane" style={{ ['--c' as any]: 'var(--teal)', ['--c-soft' as any]: 'var(--teal-soft)' }}>
          <div className="thr-lane-head">
            <span className="thr-lane-ic"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3" /><path d="M12 3v3" /><path d="M12 18v3" /><path d="M3 12h3" /><path d="M18 12h3" /><path d="M5.6 5.6l2.1 2.1" /><path d="M16.3 16.3l2.1 2.1" /></svg></span>
            <div>
              <div className="thr-lane-nm">Idea threads</div>
              <div className="thr-lane-kick">theme &amp; anything else</div>
            </div>
          </div>
          <p className="thr-lane-desc">Themes, motifs, mysteries — the quiet threads that bind the book.</p>
          <div className="thr-tchips">
            <button className="thr-tchip" onClick={() => onNewThread({ scopeType: 'theme', title: 'A theme' })}><span className="sw" />Theme<span className="plus">+</span></button>
            <button className="thr-tchip" onClick={() => onNewThread({ scopeType: 'theme', title: 'A motif' })}><span className="sw" />Motif<span className="plus">+</span></button>
            <button className="thr-tchip" onClick={() => onNewThread({ scopeType: 'theme', title: 'A mystery' })}><span className="sw" />Mystery<span className="plus">+</span></button>
          </div>
          <button className="thr-lane-add" onClick={() => onNewThread({ scopeType: 'theme' })}>
            <svg viewBox="0 0 24 24"><path d="M12 5v14" /><path d="M5 12h14" /></svg>New idea thread
          </button>
        </section>
      </div>

      {/* Mine existing scenes — only worth offering once there are ≥2 beats
          anywhere in the outline to read. Suggest now lives in the box above. */}
      {beats >= 2 && (
        <div className="thr-helper">
          <div className="h-txt">
            <div className="h-h"><span className="gl">✦</span>Already drafted scenes?</div>
            <div className="h-body">I can read what you have and pull the storylines already running through it.</div>
          </div>
          <div className="h-acts">
            <button
              className="thr-hbtn solid"
              onClick={onExtract}
              disabled={!canExtract || extracting || extractQueued}
              title={
                !canExtract ? 'Needs at least one braindump and one character'
                  : extractQueued ? 'Review the suggested storyline above first'
                  : undefined
              }
            >
              <svg viewBox="0 0 24 24"><path d="M14 3v4a1 1 0 0 0 1 1h4" /><path d="M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2z" /></svg>
              {extracting ? 'Extracting…' : extractQueued ? 'Queued for review' : 'Extract from scenes'}
            </button>
          </div>
        </div>
      )}

      <div className="thr-start-door">
        <div className="od-ic">
          <svg viewBox="0 0 24 24"><path d="M5 5h15" /><path d="M9 11h11" /><path d="M9 17h11" /><path d="M5 5v13" /><path d="M5 11h2" /><path d="M5 17h2" /></svg>
        </div>
        <div className="od-body">
          <div className="od-h">Prefer to start from the spine?</div>
          <p>Lay down acts and chapters first, then weave threads through them.</p>
        </div>
        <button type="button" className="od-go" onClick={gotoOutline}>
          Grand outline<svg viewBox="0 0 24 24"><path d="M5 12h14" /><path d="M13 6l6 6-6 6" /></svg>
        </button>
      </div>
    </div>
  );
}
