import * as React from 'react';
import { Check } from 'lucide-react';

/**
 * BeatMarker — the ONE source for every beat glyph across the app: the thread
 * editor (kit BeatList), the merge thread column, the outline, and (later) the
 * chapters rail. Fully inline-styled so it carries no CSS-class baggage.
 *
 * The vocabulary (see also the "express, don't decorate" principle):
 *   · COLOUR  = thread identity (never encodes kind). Omit → neutral.
 *   · KIND    = the *fill*:  text → solid · placeholder → hollow (dashed) ·
 *               heading → two concentric circles (a bold inner dot inside a thin
 *               outer ring). The ring is DASHED while placeholder beats remain in
 *               the heading's group and SOLID once they're all filled — the
 *               group-level echo of the placeholder→text morph (pass `complete`).
 *   · FORM    = the context shape: `circle` (thread side) · `square` (outline
 *               side) · `dash` (collapsed-scene strip). Headings always read as
 *               concentric circles regardless of form.
 *   · CONTENT = what's inside: `none` · `number` (merge/outline) · `check`
 *               (chapters rail). For a heading it rides the inner dot.
 *
 * A beat's life morphs through these:
 *   hollow/solid circle  →  circle+number  →  square+number  →  square+check.
 */

export type BeatMarkerKind = 'text' | 'placeholder' | 'heading';
export type BeatMarkerForm = 'circle' | 'square' | 'dash';
export type BeatMarkerContent = 'none' | 'number' | 'check';

export function BeatMarker({
  kind = 'text',
  form = 'circle',
  content = 'none',
  num,
  color,
  size = 18,
  muted = false,
  flagged = false,
  complete = false,
}: {
  kind?: BeatMarkerKind;
  form?: BeatMarkerForm;
  content?: BeatMarkerContent;
  num?: number | null;
  color?: string;
  size?: number;
  muted?: boolean;
  flagged?: boolean;
  /** Heading only — true when its group has no placeholder beats left (ring solidifies). */
  complete?: boolean;
}) {
  const c = flagged ? 'var(--clay)' : (color || 'var(--ink-4)');
  const hollow = kind === 'placeholder';
  const heading = kind === 'heading';
  const opacity = muted ? 0.5 : 1;

  // ── dash — the compact collapsed-scene bar ──
  if (form === 'dash') {
    return (
      <span
        style={{
          display: 'inline-block', flex: '0 0 auto',
          width: heading ? size : Math.round(size * 0.85), height: 4, borderRadius: 2,
          background: hollow ? 'transparent' : c,
          border: hollow ? `1.5px dashed ${c}` : 'none',
          opacity,
        }}
        aria-hidden="true"
      />
    );
  }

  // ── heading — two concentric shapes: a bold inner dot inside a thin outer
  //    ring. The ring is DASHED while placeholder beats remain in the heading's
  //    group and turns SOLID once they're all filled. Any number/check rides the
  //    inner dot. Follows FORM like every other beat: circle on the thread side,
  //    SQUARE once merged into the outline. ──
  if (heading) {
    const inner = size - 4; // 1px ring + 1px gap on each side
    const outerR = form === 'square' ? Math.round(size * 0.3) : '50%';
    const innerR = form === 'square' ? Math.round(inner * 0.3) : '50%';
    return (
      <span
        style={{
          display: 'inline-grid', placeItems: 'center', flex: '0 0 auto',
          width: size, height: size, borderRadius: outerR,
          background: 'transparent',
          border: `1px ${complete ? 'solid' : 'solid'} ${form === 'square' ? c : '#e5e5e5'}`,
          opacity,
        }}
        aria-hidden="true"
      >
        <span style={{
          display: 'inline-grid', placeItems: 'center',
          width: inner, height: inner, borderRadius: innerR,
          background: `${form === 'square' ? c : '#e5e5e5'}`,
          color: '#fff',
          fontFamily: 'var(--ui)', fontSize: Math.round(size * 0.4), fontWeight: 700, lineHeight: 1,
        }}>
          {content === 'number' ? (num ?? '') : content === 'check' ? <Check size={Math.round(inner * 0.7)} strokeWidth={3} /> : null}
        </span>
      </span>
    );
  }

  // ── circle / square — the beat marker, optionally holding a number/check ──
  const radius = form === 'square' ? Math.round(size * 0.3) : '50%';
  const style: React.CSSProperties = {
    display: 'inline-grid', placeItems: 'center', flex: '0 0 auto',
    width: size, height: size, borderRadius: radius,
    background: hollow ? 'transparent' : c,
    border: hollow ? `1.5px dashed ${c}` : 'none',
    color: hollow ? c : '#fff',
    fontFamily: 'var(--ui)', fontSize: Math.round(size * 0.56), fontWeight: 700,
    lineHeight: 1, opacity,
  };
  return (
    <span style={style} aria-hidden="true">
      {content === 'number' ? (num ?? '') : content === 'check' ? <Check size={Math.round(size * 0.62)} strokeWidth={3} /> : null}
    </span>
  );
}
