import type { LucideIcon, LucideProps } from 'lucide-react';

/**
 * Icon — the single system-icon wrapper.
 *
 * The ONE place icon stroke-width is decided. Wrap any lucide glyph and it draws
 * at the standard concept-glyph weight (1.7) so weight stops drifting across the
 * app (the UX audit measured 8 different stroke values in the wild). Pass
 * `weight="init"` for empty-state hero glyphs, or `strokeWidth` as an explicit
 * escape hatch. Colour comes from `currentColor` like every lucide icon.
 *
 *   <Icon as={Eye} />              // 18px, stroke 1.7
 *   <Icon as={ListTree} size={17} />
 *   <Icon as={Sparkles} weight="init" size={26} />
 */
export const ICON_STROKE = { concept: 1.7, init: 1.6 } as const;
export type IconWeight = keyof typeof ICON_STROKE;

export interface IconProps extends Omit<LucideProps, 'ref'> {
  as: LucideIcon;
  weight?: IconWeight;
}

export function Icon({ as: Glyph, size = 18, weight = 'concept', strokeWidth, ...props }: IconProps) {
  return <Glyph size={size} strokeWidth={strokeWidth ?? ICON_STROKE[weight]} {...props} />;
}
