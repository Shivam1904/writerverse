import { ArrowRight, Lightbulb, PenLine } from 'lucide-react';
import './chaptersStart.css';

interface ChaptersStartProps {
  /** Fired when the author picks "dive straight in" — seeds the blank outline. */
  onDiveIn?: () => void;
  /** Fired when the author picks "brain dump & plan" — heads to braindumps. */
  onBrainDump?: () => void;
}

/**
 * ChaptersStart — the blank-book landing.
 *
 * Shown on the chapters route when there is no first chapter to route to.
 * Poses the one fork that matters at the very start of a manuscript:
 * dive in and draft, or brain-dump and plan first. Styled to the Night Eyes
 * metallic theme (gold sparkle, beveled gradients, bold display type).
 *
 * Dive-in seeds the blank grand outline (one act "Story" + one empty chapter);
 * brain-dump routes to the braindumps page. Both wired via WritePage.
 */
export function ChaptersStart({ onDiveIn, onBrainDump }: ChaptersStartProps) {
  return (
    <div className="wv2-init-stage cs-page">
      <div className="wv2-init cs-stage">
        <header className="wv2-init-head">
          <span className="wv2-init-eyebrow">A blank book</span>
          <h1 className="wv2-init-title">Your story<br />starts <em>here.</em></h1>
          <p className="wv2-init-sub">
            Two ways in — pick whichever fits how your mind works.
          </p>
        </header>

        <div className="cs-fork">
          <button
            type="button"
            className="cs-card cs-card--plan"
            onClick={onBrainDump}
          >
            <span className="cs-card-shimmer" aria-hidden />
            <span className="cs-card-icon">
              <Lightbulb size={34} strokeWidth={2} />
            </span>
            <span className="cs-card-q">Rather think it through first?</span>
            <h2 className="cs-card-h">Ideas & plan</h2>
            <p className="cs-card-body">
              Pour out ideas, characters, and plot fragments.
              We&rsquo;ll help shape them into a plan you can write from.
            </p>
            <span className="cs-card-cta">
              Start with ideas
              <ArrowRight size={16} strokeWidth={2.4} />
            </span>
          </button>
          <div className="cs-or" aria-hidden>
            <span className="cs-or-line" />
            <span className="cs-or-word">or</span>
            <span className="cs-or-line" />
          </div>

          <button
            type="button"
            className="cs-card cs-card--write"
            onClick={onDiveIn}
          >
            <span className="cs-card-shimmer" aria-hidden />
            <span className="cs-card-icon">
              <PenLine size={34} strokeWidth={2} />
            </span>
            <span className="cs-card-q">Dive right in?</span>
            <h2 className="cs-card-h">Start writing chapter 1</h2>
            <p className="cs-card-body">
              Open a blank page and let the draft lead —
              structure and threads can catch up as you go.
            </p>
            <span className="cs-card-cta">
              Start writing
              <ArrowRight size={16} strokeWidth={2.4} />
            </span>
          </button>

        </div>

        <p className="cs-foot">Either path is reversible — switch whenever you want.</p>
      </div>
    </div>
  );
}
