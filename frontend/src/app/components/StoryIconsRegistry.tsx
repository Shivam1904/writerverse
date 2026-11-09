import { useId, type ReactNode } from 'react';

export const ENTITY_KINDS = ['person', 'location', 'item', 'rule', 'thread'] as const;
export type EntityKind = typeof ENTITY_KINDS[number];

export const WORLD_SECTION_KINDS = ['faction', 'magic', 'creature', 'history', 'culture'] as const;
export type WorldSectionKind = typeof WORLD_SECTION_KINDS[number];

export type StoryIconKey =
  | EntityKind
  | WorldSectionKind
  | 'story'
  | 'world';

export function normalizeGlyphKey(key?: string | null): StoryIconKey | 'generic' {
  const k = String(key ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
  switch (k) {
    // Entity keys + short codes + aliases
    case 'person':
    case 'char':
    case 'character':
    case 'characters':
      return 'person';
    case 'location':
    case 'locations':
    case 'loc':
    case 'place':
    case 'places':
      return 'location';
    case 'item':
    case 'items':
    case 'thing':
    case 'things':
    case 'object':
    case 'objects':
      return 'item';
    case 'rule':
    case 'rules':
      return 'rule';
    case 'thread':
    case 'threads':
    case 'plot':
    case 'plot-threads':
      return 'thread';
    // Section keys + aliases
    case 'faction':
    case 'factions':
    case 'organization':
    case 'organizations':
      return 'faction';
    case 'magic':
    case 'supernatural':
      return 'magic';
    case 'creature':
    case 'creatures':
    case 'species':
      return 'creature';
    case 'history':
    case 'histories':
      return 'history';
    case 'culture':
    case 'cultures':
    case 'society':
      return 'culture';
    case 'story':
    case 'outline':
      return 'story';
    case 'world':
      return 'world';
    default:
      return 'generic';
  }
}

export const STORY_ICONS_SILHOUETTES: Record<StoryIconKey, ReactNode> = {
  person: (
    <>
      <circle cx="32" cy="21" r="13" />
      <path d="M9 56C9 37 55 37 55 56Z" />
    </>
  ),
  location: <path d="M32 7C20 7 11 16 11 27c0 14 21 30 21 30s21-16 21-30C53 16 44 7 32 7z" />,
  item: <path d="M20 10h24l11 16-23 31L9 26z" />,
  rule: <path d="M32 6 54 14v17c0 14-9 23-22 27C19 54 10 45 10 31V14z" />,
  thread: (
    <>
      <path d="M17 41c14 0 16-18 30-18" stroke="currentColor" strokeWidth="5" fill="none" strokeLinecap="round" />
      <circle cx="17" cy="41" r="11" />
      <circle cx="47" cy="23" r="11" />
    </>
  ),
  faction: <path d="M18 9h28v38l-14-8-14 8z" />,
  magic: <path d="M32 6q3 23 26 26-23 3-26 26-3-23-26-26 23-3 26-26z" />,
  creature: (
    <>
      <ellipse cx="32" cy="43" rx="13" ry="11" />
      <circle cx="17" cy="29" r="6" />
      <circle cx="26" cy="20" r="6.5" />
      <circle cx="38" cy="20" r="6.5" />
      <circle cx="47" cy="29" r="6" />
    </>
  ),
  history: (
    <>
      <rect x="14" y="8" width="36" height="5" rx="2" />
      <rect x="14" y="51" width="36" height="5" rx="2" />
      <path d="M18 13h28L32 32 46 51H18L32 32z" />
    </>
  ),
  culture: (
    <>
      <path d="M32 9 56 27H8z" />
      <rect x="13" y="27" width="38" height="24" rx="2" />
      <rect x="9" y="51" width="46" height="5" rx="2" />
    </>
  ),
  story: (
    <path d="M 32 22 C 32 14, 17 14, 4 18 L 4 47 C 17 43, 32 43, 32 51 C 32 43, 47 43, 60 47 L 60 18 C 47 14, 32 14, 32 22 Z" />
  ),
  world: <circle cx="32" cy="32" r="23" />,
};

export const STORY_ICONS_DETAILS: Partial<Record<StoryIconKey, ReactNode>> = {
  location: <circle cx="32" cy="25" r="6" fill="#fff" fillOpacity=".5" />,
  item: <path d="M9 26h46M20 10 32 26 44 10M32 26v31" stroke="#fff" strokeOpacity=".42" strokeWidth="1.4" fill="none" />,
  rule: <path d="M32 21l2.6 5.6 6 .5-4.6 4 1.4 6L32 38.4 26.6 42l1.4-6-4.6-4 6-.5z" fill="#fff" fillOpacity=".8" />,
  faction: <path d="M32 19l2.2 4.8 5.2.5-4 3.5 1.2 5.2L32 36l-4.6 2.5 1.2-5.2-4-3.5 5.2-.5z" fill="#fff" fillOpacity=".6" />,
  magic: <circle cx="32" cy="32" r="3.4" fill="#fff" fillOpacity=".7" />,
  history: <path d="M27 19h10l-5 9z" fill="#fff" fillOpacity=".55" />,
  culture: (
    <path
      d="M20 31v17M28 31v17M36 31v17M44 31v17"
      stroke="#fff"
      strokeOpacity=".42"
      strokeWidth="1.5"
      fill="none"
    />
  ),
  story: (
    <>
      {/* Inset white page sheets */}
      <path
        d="M 32 20 C 32 12, 19 12, 7 16 L 7 44 C 19 40, 32 40, 32 48 C 32 40, 45 40, 57 44 L 57 16 C 45 12, 32 12, 32 20 Z"
        fill="#fff"
        fillOpacity=".9"
      />
      {/* Center split line */}
      <line x1="32" y1="20" x2="32" y2="48" stroke="#000" strokeOpacity=".2" strokeWidth="1.6" />
      {/* Text lines */}
      <path
        d="M12 23h11M12 29h11M12 35h11M12 41h11M41 23h11M41 29h11M41 35h11M41 41h11"
        stroke="#000"
        strokeOpacity=".35"
        strokeWidth="2"
        strokeLinecap="round"
        fill="none"
      />
    </>
  ),
  world: (
    <>
      <circle cx="32" cy="32" r="23" stroke="#fff" strokeOpacity=".45" strokeWidth="2" fill="none" />
      <path
        d="M9 32h46M32 9v46M32 32m-23 0a23 10 0 0146 0a23 10 0 01-46 0"
        stroke="#fff"
        strokeOpacity=".45"
        strokeWidth="2"
        fill="none"
      />
    </>
  ),
};

export interface GlossyStoryIconProps {
  iconKey: StoryIconKey;
  color: string;
  size?: number;
  title?: string;
  className?: string;
}

export function GlossyStoryIcon({
  iconKey,
  color,
  size = 22,
  title,
  className,
}: GlossyStoryIconProps) {
  const uid = useId().replace(/:/g, '');
  const sil = `si-s-${uid}`;
  const hi = `si-h-${uid}`;
  const sh = `si-d-${uid}`;

  const silhouette = STORY_ICONS_SILHOUETTES[iconKey];
  const detail = STORY_ICONS_DETAILS[iconKey];

  if (!silhouette) return null;

  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 64 64"
      role="img"
      aria-label={title ?? iconKey}
      style={{
        color,
        display: className?.includes('inline') ? 'inline-block' : 'block',
        flex: `0 0 ${size}px`,
        filter: 'drop-shadow(0 1px 1.5px rgba(20,25,35,.22))',
      }}
    >
      <defs>
        {/* glossy top-left highlight */}
        <radialGradient id={hi} cx="36%" cy="24%" r="80%">
          <stop offset="0%" stopColor="#fff" stopOpacity=".6" />
          <stop offset="52%" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
        {/* shading toward the base for depth */}
        <linearGradient id={sh} x1="0" y1="0" x2="0" y2="1">
          <stop offset="48%" stopColor="#000" stopOpacity="0" />
          <stop offset="100%" stopColor="#000" stopOpacity=".24" />
        </linearGradient>
        <g id={sil}>{silhouette}</g>
      </defs>

      <use href={`#${sil}`} fill="currentColor" />
      <use href={`#${sil}`} fill={`url(#${sh})`} />
      <use href={`#${sil}`} fill={`url(#${hi})`} />
      {detail}
    </svg>
  );
}
