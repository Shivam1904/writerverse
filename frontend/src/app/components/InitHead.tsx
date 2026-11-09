import type { ReactNode } from 'react';
import { pageGlyph } from '../pageGlyphs';

/**
 * InitHead — the shared first-touch hero head.
 * Centred badge + eyebrow + big serif title + sub, used by every page's init
 * surface (PeopleInit, ThreadsStart, BraindumpsInit, OutlineScaffoldPickerFull).
 *
 * The badge is the page's lit CONCEPT glyph — resolved once from pageGlyphs.ts
 * (same mark the sidebar + page header use), so the empty state announces the
 * same page identity as the populated page. `title`/`sub` are ReactNode so the
 * hero can keep its <em>/<br/> flourishes.
 */
export function InitHead({
  section,
  eyebrow,
  title,
  sub,
  className,
  glyphSize = 26,
}: {
  section?: string;
  eyebrow: ReactNode;
  title: ReactNode;
  sub: ReactNode;
  className?: string;
  glyphSize?: number;
}) {
  const g = section ? pageGlyph(section) : undefined;
  const Glyph = g?.icon;
  return (
    <header className={`wv2-init-head${className ? ` ${className}` : ''}`}>
      {Glyph && (
        <span className="wv2-init-glyph">
          <Glyph size={glyphSize} strokeWidth={1.6} />
        </span>
      )}
      <span className="wv2-init-eyebrow">{eyebrow}</span>
      <h1 className="wv2-init-title">{title}</h1>
      <p className="wv2-init-sub">{sub}</p>
    </header>
  );
}
