import type { ReactNode } from 'react';
import { pageGlyph } from '../pageGlyphs';

/**
 * PageHeader — the one header layout every app page uses. Replaces the per-page `.thr-head` /
 * `.ol-head` / `.braindumps-head` one-offs.
 *
 *   eyebrow (uppercase, GROUP · PAGE)
 *   ┌ serif H1  [lit concept glyph] Title · suffix ┐   [actions cluster, right]
 *   caption (own line, never inside the action row)
 *
 * The title glyph is the page's CONCEPT mark, resolved once from pageGlyphs.ts
 * (single source of truth) and lit with a soft drop-shadow so it sits in the
 * same light as the glossy entity marks — a section, not an entity.
 */
export interface PageHeaderProps {
  /** Section id — resolves the lit concept glyph via pageGlyphs.ts. */
  section: string;
  /** Uppercase eyebrow, e.g. "Plan · plot threads". */
  eyebrow?: string;
  title: string;
  /** Muted trailing bit, e.g. a count `· 8`. */
  suffix?: ReactNode;
  /** Right-aligned action cluster (buttons / segmented switch). */
  actions?: ReactNode;
  /** Descriptive line — rendered on its own row below, never in the actions. */
  caption?: ReactNode;
  glyphSize?: number;
}

export function PageHeader({ section, eyebrow, title, suffix, actions, caption, glyphSize = 22 }: PageHeaderProps) {
  const g = pageGlyph(section);
  const Glyph = g?.icon;
  return (
    <header className="wv2-phead">
      <div className="wv2-phead-top">
        <div className="wv2-phead-lhs">
          {eyebrow && <div className="wv2-phead-eyebrow">{eyebrow}</div>}
          <h1 className="wv2-phead-title">
            {Glyph && (
              <span className="wv2-phead-glyph">
                <Glyph size={glyphSize} strokeWidth={1.7} />
              </span>
            )}
            {title}
            {suffix != null && <span className="wv2-phead-suffix">{suffix}</span>}
          </h1>
        </div>
        {actions && <div className="wv2-phead-actions">{actions}</div>}
      </div>
      {caption && <div className="wv2-phead-caption">{caption}</div>}
    </header>
  );
}

export interface SegmentedOption {
  value: string;
  label: ReactNode;
  title?: string;
}

/**
 * Segmented — the one either/or switch. A soft
 * pill-track with a raised active chip. Replaces outline's `.ol-zoom` and the
 * braindumps `.view-toggle`; use it for every Beats/Scenes, Stream/Canvas,
 * All/Pinned style toggle.
 */
export function Segmented({
  value,
  options,
  onChange,
  ariaLabel,
}: {
  value: string;
  options: SegmentedOption[];
  onChange: (value: string) => void;
  ariaLabel?: string;
}) {
  return (
    <div className="wv2-seg" role="group" aria-label={ariaLabel}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          className={value === o.value ? 'is-on' : undefined}
          aria-pressed={value === o.value}
          title={o.title}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
