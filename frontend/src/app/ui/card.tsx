import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../lib/utils';
import { Spark } from './marks';

/**
 * Card — base kinds + states:
 *   container — a base container that holds a section (paper bg, no border).
 *   inner     — a container nested inside a container (slight border, NO bg).
 *   item      — a single item card (entity/list/grid tile); hover-lifts.
 *   dashed    — an add / empty slot.
 *   pending   — a ghosted AI-extracted item.
 *   problem   — something went wrong (red border + text), e.g. a failed save.
 * `accent` adds a left colour bar (idea colour / dominant entity).
 */
export const cardVariants = cva('relative transition-all', {
  variants: {
    variant: {
      container: 'rounded-[var(--r-lg)] bg-[var(--container)] p-5',
      inner: 'rounded-[var(--r-lg)] border border-border bg-transparent p-4',
      item: 'rounded-[var(--r-lg)] bg-[var(--surface)] p-5 transition-shadow hover:shadow-[var(--sh-2)]',
      dashed: 'rounded-[var(--r-lg)] border border-dashed border-input bg-transparent p-5',
      pending: 'rounded-[var(--r-lg)] bg-[var(--surface)] p-5 opacity-70',
      problem: 'rounded-[var(--r-lg)] border border-destructive bg-[var(--surface)] text-destructive p-5',
      idea: 'kit-idea-row border border-transparent rounded-[var(--r-lg)] p-2.5 px-3',
    },
  },
  defaultVariants: { variant: 'container' },
});

export interface CardProps
  extends React.HTMLAttributes<HTMLElement>,
    VariantProps<typeof cardVariants> {
  as?: React.ElementType;
  accent?: string;
  pinned?: boolean;
  selected?: boolean;
  dragging?: boolean;
}

export const Card = React.forwardRef<HTMLElement, CardProps>(function Card({
  className,
  variant = 'container',
  as: Component = 'div',
  accent,
  pinned,
  selected,
  dragging,
  style,
  children,
  ...props
}: CardProps, ref) {
  const isIdea = variant === 'idea';
  const customStyles = {
    ...style,
    ...(accent ? (isIdea ? { '--idea-c': accent } : { borderLeft: `3px solid ${accent}` }) : null),
  };

  return (
    <Component
      ref={ref}
      className={cn(
        cardVariants({ variant }),
        accent && (isIdea ? 'has-color' : 'pl-3'),
        pinned && 'pinned',
        selected && 'is-sel bg-[color-mix(in_srgb,_var(--teal)_8%,_transparent)] hover:bg-[color-mix(in_srgb,_var(--teal)_12%,_transparent)] shadow-[inset_3px_0_0_var(--teal)]',
        dragging && 'opacity-40',
        className
      )}
      style={customStyles}
      {...props}
    >
      {children}
    </Component>
  );
});

/**
 * CardHead — the gradient header for a container card (surface→surface-2 with a
 * bottom rule): an avatar plinth (default ✦ spark), title + subtitle, an optional
 * badge beside the title, and an optional right-aligned action cluster. Use on a
 * `Card variant="container"` set to `p-0 overflow-hidden`.
 */
export function CardHead({
  icon, title, subtitle, badge, actions, className,
}: {
  icon?: React.ReactNode;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  badge?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('kit-cardhead', className)}>
      <span className="kit-cardhead-avatar">{icon ?? <Spark style={{ fontSize: 17 }} />}</span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="kit-cardhead-title truncate">{title}</span>
          {badge}
        </div>
        {subtitle && <div className="kit-cardhead-sub">{subtitle}</div>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-1">{actions}</div>}
    </div>
  );
}
