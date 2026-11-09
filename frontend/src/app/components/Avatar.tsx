import { useId } from 'react';
import { avatarTint } from '../modules/boxes/avatar';
import './avatar.css';

export type AvatarSize = 'xs' | 'sm' | 'md' | 'lg';

const SIZE_PX: Record<AvatarSize, number> = { xs: 16, sm: 22, md: 34, lg: 52 };

interface AvatarProps {
  /** Person name — drives the tint (and the accessible label). */
  name: string;
  /** Override the tint; defaults to a stable per-name colour. */
  color?: string;
  size?: AvatarSize;
  title?: string;
  className?: string;
  /** Optional AI portrait URL — when set, shows a frameless headshot (square,
   *  cropped top-center, with a silhouette sheen) instead of the glossy mark. */
  src?: string;
}

/**
 * A small glossy 3D person mark: a sphere (head) sitting on a hemisphere (body),
 * tinted per person, on a transparent background. Faceless by design — the name
 * sits beside it. Highlights/shading are colour-agnostic white/black overlays so
 * any tint reads as 3D. Common component — reuse via the xs/sm/md/lg variants.
 */
export function Avatar({ name, color, size = 'sm', title, className, src }: AvatarProps) {
  const uid = useId().replace(/:/g, '');
  const px = SIZE_PX[size];

  // Photo variant: a frameless headshot (square, cropped top-center) with the
  // same silhouette sheen the marks carry — so it sits in the same 3D light.
  if (src) {
    return (
      <span
        className={`wv2-av-photo${className ? ` ${className}` : ''}`}
        role="img"
        aria-label={title ?? name}
        style={{
          width: px,
          height: px,
          flex: `0 0 ${px}px`,
          ['--port-src' as any]: `url("${src}")`,
        }}
      >
        <span className="wv2-av-photo-sheen" />
      </span>
    );
  }

  const tint = color ?? avatarTint(name);
  const head = `avh-${uid}`;
  const body = `avb-${uid}`;
  const shade = `avs-${uid}`;
  const dome = 'M9 56C9 37 55 37 55 56Z';

  return (
    <svg
      className={className}
      width={px}
      height={px}
      viewBox="0 0 64 64"
      role="img"
      aria-label={title ?? name}
      style={{
        color: tint,
        display: className?.includes('inline') ? 'inline-block' : 'block',
        flex: `0 0 ${px}px`,
        filter: 'drop-shadow(0 1px 1.5px rgba(20,25,35,.22))',
      }}
    >
      <defs>
        {/* glossy top-left highlight on the head sphere */}
        <radialGradient id={head} cx="37%" cy="27%" r="78%">
          <stop offset="0%" stopColor="#fff" stopOpacity=".62" />
          <stop offset="50%" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
        {/* broad highlight across the top of the hemisphere */}
        <radialGradient id={body} cx="42%" cy="2%" r="100%">
          <stop offset="0%" stopColor="#fff" stopOpacity=".42" />
          <stop offset="58%" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
        {/* shading toward the base of each form for depth */}
        <linearGradient id={shade} x1="0" y1="0" x2="0" y2="1">
          <stop offset="50%" stopColor="#000" stopOpacity="0" />
          <stop offset="100%" stopColor="#000" stopOpacity=".22" />
        </linearGradient>
      </defs>

      {/* tinted base */}
      <g fill="currentColor">
        <circle cx="32" cy="21" r="13" />
        <path d={dome} />
      </g>

      {/* depth */}
      <circle cx="32" cy="21" r="13" fill={`url(#${shade})`} />
      <path d={dome} fill={`url(#${shade})`} />

      {/* gloss — the 3D sphere / hemisphere read */}
      <circle cx="32" cy="21" r="13" fill={`url(#${head})`} />
      <path d={dome} fill={`url(#${body})`} />
    </svg>
  );
}
