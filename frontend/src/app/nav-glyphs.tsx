import type { ReactNode, SVGProps } from 'react';

/**
 * Custom nav-rail glyphs ported from the WriterVerse design handoff
 * (glyphs-c2.html — "Round 2: threads & a merge"; lens mark from glyphs.html's
 * "In the rail" set). One monoline family — 1.6 stroke, rounded ends, the same
 * filled-dot / open-ring vocabulary — so the rail reads as one system.
 *
 *   • PlotThreadGlyph — the design's "original C" ("Dotted ahead"): solid road
 *     behind, dotted road ahead, an open-ring destination.
 *   • OutlineGlyph    — the design's "M5" ("Mixed progress"): two plots merging
 *     into one — one written (solid), one still planned (dotted) — running on to
 *     a single open-ring ending.
 *
 * Drop-in replacements for the lucide icons in `nav.ts`: same call shape
 * (`size` / `strokeWidth` / `className`), drawn in `currentColor` so they pick
 * up the rail's ink and active-accent colours like every other nav icon. Open
 * rings are filled with `--paper` (the rail's surface) so the road's dashes are
 * masked at the node centre and the ring reads hollow — circles paint after the
 * paths, exactly as in the source.
 */

type GlyphProps = Omit<SVGProps<SVGSVGElement>, 'children'> & { size?: number };

function GlyphSvg({ size = 24, strokeWidth = 1.6, children, ...rest }: GlyphProps & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...rest}
    >
      {children}
    </svg>
  );
}

// node fills: a solid beat (currentColor) and an "open" ring (filled with the
// rail surface so the road's dashes don't poke through the centre).
const SOLID = { fill: 'currentColor', stroke: 'none' } as const;
const OPEN = { fill: 'var(--paper)' } as const;

/** Plot threads — "original C": solid behind, dotted ahead, open-ring destination. */
export function PlotThreadGlyph(props: GlyphProps) {
  return (
    <GlyphSvg {...props}>
      <path d="M3.7 19.5 C 8 19.5, 7.5 12.5, 12 12" />
      <path d="M12 12 C 16.5 11.5, 15.5 5, 20.5 5" strokeDasharray="0.2 3" />
      <circle {...SOLID} cx="3.7" cy="19.5" r="1.8" />
      <circle {...SOLID} cx="12" cy="12" r="1.7" />
      <circle {...OPEN} cx="20.5" cy="5" r="1.9" />
    </GlyphSvg>
  );
}

/** Outline — "M5": one plot written (solid), one planned (dotted), merging into one. */
export function OutlineGlyph(props: GlyphProps) {
  return (
    <GlyphSvg {...props}>
      <path d="M3.4 6.5 C 8 6.5, 9 12, 13 12" />
      <path d="M3.4 17.5 C 8 17.5, 9 12, 13 12" strokeDasharray="0.2 3" />
      <path d="M13 12 C 16.5 12, 17.5 12, 20.6 12" />
      <circle {...SOLID} cx="3.4" cy="6.5" r="1.6" />
      <circle {...OPEN} cx="3.4" cy="17.5" r="1.7" />
      <circle {...OPEN} cx="20.6" cy="12" r="1.9" />
    </GlyphSvg>
  );
}

