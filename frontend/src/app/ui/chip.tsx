import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../lib/utils';
import { EntityMark, type EntityKind } from '../components/EntityMark';
import { withTooltip } from './overlays';

/**
 * Chip — distinct kinds (shape + treatment carry meaning):
 *   entity — a story entity; tinted pill by its `dot` colour, glossy dot.
 *   tag    — a passive label; faint outlined pill.
 *   inside — a tag living inside a list/phrase; NO border, just a delete (+opt dot).
 *   button — an interactive facet; raised, squarer, bevelled (reads as a button).
 *   filter — the braindumps filter strip; no idle border/background.
 * Slots: dot, count, onRemove. `pressed` = on-state (entity/button). `author`
 * = hand-placed entity (dashed gold). Spoken "entity chip sm", "inside tag chip".
 */
export const chipVariants = cva(
  'inline-flex items-center gap-1.5 whitespace-nowrap font-sans transition-colors max-w-full',
  {
    variants: {
      variant: { entity: 'kit-chip-entity', tag: 'kit-chip-tag', inside: 'kit-chip-inside', button: 'kit-chip-button', filter: 'kit-chip-filter' },
      size: { sm: 'h-[26px] px-2.5 text-[11px]', xs: 'h-5 px-2 text-[10.5px]' },
    },
    defaultVariants: { variant: 'tag', size: 'sm' },
  },
);

export interface ChipProps
  extends Omit<React.HTMLAttributes<HTMLSpanElement>, 'color'>,
    VariantProps<typeof chipVariants> {
  /** Entity/facet colour. For entity it tints the whole pill + the glossy dot;
      for tag/button it renders a small leading swatch dot. */
  dot?: string;
  count?: number;
  onRemove?: () => void;
  /** On-state for entity/button/filter chips. */
  pressed?: boolean;
  /** Hand-placed entity → dashed gold (entity variant only). */
  author?: boolean;
  /** A resolved/real entity → the dot becomes the glossy entity glyph. */
  real?: boolean;
  /** Which entity mark to show when `real` (default: person). */
  entityKind?: EntityKind;
  /** Hover/focus hint. String or any node. Falls back to aria-label/title. */
  tooltip?: React.ReactNode;
}

const BaseChip = React.forwardRef<HTMLSpanElement, ChipProps>(({
  className, variant = 'tag', size, dot, count, onRemove, pressed, author, real, entityKind, children, style, ...props
}, ref) => {
  const isEntity = variant === 'entity';
  return (
    <span
      ref={ref}
      className={cn(chipVariants({ variant, size }), pressed && 'is-on', author && isEntity && 'is-author', className)}
      style={isEntity && dot ? ({ ['--chip-c' as any]: dot, ...style }) : style}
      {...props}
    >
      {isEntity && real ? (
        <EntityMark kind={entityKind || 'person'} color={dot || 'var(--terra)'} size={13} className="shrink-0" />
      ) : dot ? (
        isEntity
          ? <span className="kit-chip-dot shrink-0" />
          : <span
              className="shrink-0 rounded-full"
              style={{ width: 7, height: 7, background: dot, boxShadow: variant === 'filter' ? '0 0 0 1.5px rgba(255,255,255,.6)' : undefined }}
            />
      ) : null}
      <span className="inline-flex min-w-0 items-center gap-1">{children}</span>
      {typeof count === 'number' && (
        <span className="ml-0.5 tabular-nums opacity-70">{count}</span>
      )}
      {onRemove && (
        <button
          type="button"
          aria-label="Remove"
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
          className="ml-0.5 -mr-1 grid h-4 w-4 place-items-center rounded-full opacity-60 hover:bg-black/10 hover:opacity-100"
        >
          ×
        </button>
      )}
    </span>
  );
});
BaseChip.displayName = 'BaseChip';

export const Chip = withTooltip<ChipProps>(BaseChip);
Chip.displayName = 'Chip';

/** Badge — pure quantity (count) or a state (status: tone-coloured, light
 * border, low roundness). */
export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'count' | 'status';
  tone?: 'neutral' | 'terra' | 'clay' | 'teal' | 'gold' | 'sage';
}

export function Badge({ className, variant = 'count', tone = 'neutral', ...props }: BadgeProps) {
  if (variant === 'count') {
    return <span className={cn('font-sans text-[11px] font-semibold tabular-nums text-muted-foreground', className)} {...props} />;
  }
  return <span className={cn('kit-badge', tone !== 'neutral' && `kit-badge-${tone}`, className)} {...props} />;
}

/** Swatch — round colour choice; ring when selected. */
export interface SwatchProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  color: string;
  selected?: boolean;
  /** Hover/focus hint (e.g. the colour name). Falls back to aria-label/title. */
  tooltip?: React.ReactNode;
}

const BaseSwatch = React.forwardRef<HTMLButtonElement, SwatchProps>(
  ({ color, selected, className, ...props }, ref) => (
    <button
      ref={ref}
      type="button"
      aria-pressed={selected}
      className={cn('h-[18px] w-[18px] rounded-full transition-transform hover:scale-110', className)}
      style={{
        background: color,
        boxShadow: selected
          ? `0 0 0 2px var(--surface), 0 0 0 3.5px ${color}`
          : 'inset 0 0 0 1px rgba(20,16,10,.14)',
      }}
      {...props}
    />
  ),
);
BaseSwatch.displayName = 'BaseSwatch';

export const Swatch = withTooltip<SwatchProps>(BaseSwatch);
Swatch.displayName = 'Swatch';
