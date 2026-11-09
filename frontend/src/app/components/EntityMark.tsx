import { GlossyStoryIcon, normalizeGlyphKey, type StoryIconKey, type EntityKind } from './StoryIconsRegistry';

export type { EntityKind };

export interface EntityMarkProps {
  kind: string;
  /** Tint — a hex/colour or a CSS var like `var(--thr-c)`. */
  color: string;
  /** Rendered px (square). */
  size?: number;
  title?: string;
  className?: string;
}

export function EntityMark({ kind, color, size = 22, title, className }: EntityMarkProps) {
  const normKey = normalizeGlyphKey(kind);
  // If the normalized key is one of the valid entity marks, render it.
  // Otherwise, default to location / item depending on fallback or render null/generic.
  const iconKey = normKey === 'generic' ? 'location' : normKey;

  return (
    <GlossyStoryIcon
      iconKey={iconKey as StoryIconKey}
      color={color}
      size={size}
      title={title ?? kind}
      className={className}
    />
  );
}

/* Convenience named marks — same call shape, fixed kind. */
export const ItemMark = (p: Omit<EntityMarkProps, 'kind'>) => <EntityMark kind="item" {...p} />;
