import { useId } from 'react';
import { GlossyStoryIcon, normalizeGlyphKey, type StoryIconKey } from './StoryIconsRegistry';

export interface SectionMarkProps {
  /** A real EntityKind, a bespoke section shape, or 'generic'/unknown. */
  glyph: string;
  /** Tint — a hex/colour or a CSS var like `var(--teal)`. */
  color: string;
  /** The section name — its first letter stamps the generic token. */
  label?: string;
  /** Rendered px (square). */
  size?: number;
  title?: string;
  className?: string;
}

export function SectionMark({ glyph, color, label, size = 28, title, className }: SectionMarkProps) {
  const normKey = normalizeGlyphKey(glyph);

  if (normKey !== 'generic') {
    return (
      <GlossyStoryIcon
        iconKey={normKey as StoryIconKey}
        color={color}
        size={size}
        title={title ?? label ?? glyph}
        className={className}
      />
    );
  }

  return <GenericToken color={color} label={label} size={size} title={title} className={className} />;
}

function GenericToken({
  color, label, size = 28, title, className,
}: { color: string; label?: string; size?: number; title?: string; className?: string }) {
  const uid = useId().replace(/:/g, '');
  const hi = `sm-h-${uid}`;
  const sh = `sm-d-${uid}`;
  const initial = (label || '?').trim().charAt(0).toUpperCase() || '?';

  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 64 64"
      role="img"
      aria-label={title ?? label ?? 'section'}
      style={{
        color,
        display: className?.includes('inline') ? 'inline-block' : 'block',
        flex: `0 0 ${size}px`,
        filter: 'drop-shadow(0 1px 1.5px rgba(20,25,35,.22))',
      }}
    >
      <defs>
        <radialGradient id={hi} cx="36%" cy="24%" r="80%">
          <stop offset="0%" stopColor="#fff" stopOpacity=".6" />
          <stop offset="52%" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={sh} x1="0" y1="0" x2="0" y2="1">
          <stop offset="48%" stopColor="#000" stopOpacity="0" />
          <stop offset="100%" stopColor="#000" stopOpacity=".24" />
        </linearGradient>
      </defs>
      {/* tinted base → depth → gloss, painted in order (cf. EntityMark / Avatar) */}
      <rect x="9" y="9" width="46" height="46" rx="13" fill="currentColor" />
      <rect x="9" y="9" width="46" height="46" rx="13" fill={`url(#${sh})`} />
      <text
        x="32"
        y="33"
        textAnchor="middle"
        dominantBaseline="central"
        fontFamily="'Lora', Georgia, serif"
        fontSize="28"
        fontWeight="600"
        fill="#fff"
        fillOpacity=".88"
      >
        {initial}
      </text>
      <rect x="9" y="9" width="46" height="46" rx="13" fill={`url(#${hi})`} />
    </svg>
  );
}
