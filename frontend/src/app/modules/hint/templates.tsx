/**
 * Per-page hint templates — the "format differently based on the page" registry.
 *
 * Exactly parallel to the proposal card's DETAIL_BY_CAPABILITY: a small map from
 * section id → a tiny renderer that gives that page's hint its own shape. The
 * card shell (HintRailCard) stays identical everywhere; only the body + default
 * title vary. Anything unmapped falls through to GENERIC_TEMPLATE.
 *
 * Each Body reads loosely from `hint.data` (app convention) and degrades
 * to a single muted line when the richer fields aren't supplied.
 */
import type { Hint, HintTemplate } from './types';

function line(hint: Hint, fallback: string): string {
  return (hint.data?.line as string) || (hint.data?.text as string) || fallback;
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
}

/** characters — a roster nudge. With names it shows initial-avatars; else a line. */
function CharactersBody({ hint }: { hint: Hint }) {
  const names: string[] = Array.isArray(hint.data?.names) ? hint.data.names : [];
  if (names.length === 0) {
    return <p className="wv2-hint-line">{line(hint, "No one's on stage yet.")}</p>;
  }
  const shown = names.slice(0, 4);
  const extra = names.length - shown.length;
  return (
    <div className="wv2-hint-roster">
      {shown.map((n) => (
        <span key={n} className="wv2-hint-avatar" title={n}>
          {initials(n)}
        </span>
      ))}
      {extra > 0 && <span className="wv2-hint-roster-more">+{extra} more</span>}
    </div>
  );
}

/** plot-threads — a tension line, set as a quiet pull-quote. */
function ThreadsBody({ hint }: { hint: Hint }) {
  return (
    <p className="wv2-hint-line">{line(hint, 'What tension runs through the book?')}</p>
  );
}

/** outline — the story's shape, as act/chapter pills when counts are present. */
function OutlineBody({ hint }: { hint: Hint }) {
  const acts = Number(hint.data?.acts) || 0;
  const chapters = Number(hint.data?.chapters) || 0;
  if (acts === 0 && chapters === 0) {
    return <p className="wv2-hint-line">{line(hint, 'No shape yet — lay down the acts.')}</p>;
  }
  return (
    <div className="wv2-hint-shape">
      {acts > 0 && (
        <span className="wv2-hint-pill">
          {acts} {acts === 1 ? 'act' : 'acts'}
        </span>
      )}
      {chapters > 0 && (
        <span className="wv2-hint-pill">
          {chapters} {chapters === 1 ? 'chapter' : 'chapters'}
        </span>
      )}
    </div>
  );
}

/** world — a premise / worldbuilding line, with an optional section tag. */
function WorldBody({ hint }: { hint: Hint }) {
  const section = hint.data?.section as string | undefined;
  return (
    <p className="wv2-hint-line">
      {line(hint, 'Your story has no premise yet.')}
      {section && <span className="wv2-hint-tag">{section}</span>}
    </p>
  );
}

/** braindumps — a capture line, with an optional muted excerpt of the raw idea. */
function BraindumpsBody({ hint }: { hint: Hint }) {
  const excerpt = hint.data?.excerpt as string | undefined;
  return (
    <>
      <p className="wv2-hint-line">{line(hint, 'Got a loose idea? Drop it here.')}</p>
      {excerpt && <p className="wv2-hint-excerpt">{excerpt}</p>}
    </>
  );
}

/** lenses — a lens to try, plain line. */
function LensesBody({ hint }: { hint: Hint }) {
  return <p className="wv2-hint-line">{line(hint, 'A lens worth a pass over the draft.')}</p>;
}

/** chapters — on-the-page drafting line, with an optional word count. */
function ChaptersBody({ hint }: { hint: Hint }) {
  const words = Number(hint.data?.words) || 0;
  return (
    <p className="wv2-hint-line">
      {line(hint, 'Ready when you are — the page is blank.')}
      {words > 0 && <span className="wv2-hint-tag">{words.toLocaleString()} words</span>}
    </p>
  );
}

/** Fallback — a single muted line for any unmapped page. */
function GenericBody({ hint }: { hint: Hint }) {
  return <p className="wv2-hint-line">{line(hint, 'Something here is worth a look.')}</p>;
}

export const GENERIC_TEMPLATE: HintTemplate = {
  // No page identity → no forced title; an ambient one-liner just shows its body.
  title: (hint) => (hint.data?.heading as string) || '',
  cta: 'Take a look',
  Body: GenericBody,
};

/** section id → per-page template. Keys match the `:section` route segment and
 *  the pageGlyphs registry, so a hint's page resolves to the same glyph the nav
 *  and proposal cards use. */
export const HINT_TEMPLATE_BY_PAGE: Record<string, HintTemplate> = {
  characters: {
    title: () => 'Who is this about?',
    cta: 'Add a character',
    Body: CharactersBody,
  },
  'plot-threads': {
    title: () => 'Threads to pull',
    cta: 'Start a thread',
    Body: ThreadsBody,
  },
  outline: {
    title: () => 'The shape',
    cta: 'Build the outline',
    Body: OutlineBody,
  },
  world: {
    title: () => 'Your world',
    cta: 'Set the premise',
    Body: WorldBody,
  },
  braindumps: {
    title: () => 'Loose ideas',
    cta: 'Open braindumps',
    Body: BraindumpsBody,
  },
  lenses: {
    title: () => 'A lens to try',
    cta: 'Open lenses',
    Body: LensesBody,
  },
  chapters: {
    title: () => 'On the page',
    cta: 'Open the manuscript',
    Body: ChaptersBody,
  },
};

/** The template for a page (falls back to generic). */
export function hintTemplateFor(page?: string): HintTemplate {
  const section = (page || '').split('.')[0];
  return HINT_TEMPLATE_BY_PAGE[section] ?? GENERIC_TEMPLATE;
}
