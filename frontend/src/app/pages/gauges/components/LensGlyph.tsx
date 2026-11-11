import { glyphFor } from './glyphs';

/**
 * The typed glyph tile on each lens card — a small rounded square holding the
 * lens's line-icon, tinted by kind (the color taxonomy). Replaces the old
 * mini-chart preview; the chart now lives only inside the configure modal.
 * `flat` shrinks it for the catalogue rows.
 */
export function LensGlyph({ id, kind, flat = false }) {
  return (
    <span className={`lens-glyph lens-g-${kind}${flat ? ' is-flat' : ''}`}>
      <svg viewBox="0 0 24 24">{glyphFor(id)}</svg>
    </span>
  );
}
