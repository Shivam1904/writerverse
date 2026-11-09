import * as React from 'react';
import { cn } from '../lib/utils';

/**
 * Typography primitives. serif = story voice; sans = app chrome.
 * page heading · section heading · eyebrow label · micro label.
 */

export interface HeadingProps extends React.HTMLAttributes<HTMLHeadingElement> {
  as?: 'h1' | 'h2' | 'h3';
  size?: 'page' | 'section';
}

export function Heading({ as: Tag = 'h1', size = 'page', className, ...props }: HeadingProps) {
  return (
    <Tag
      className={cn(
        'font-serif font-semibold tracking-tight text-foreground',
        size === 'page' ? 'text-2xl' : 'text-base leading-tight',
        className,
      )}
      {...props}
    />
  );
}

/** SectionHeading — a sub-section title with an optional subtitle line. */
export function SectionHeading({
  title, sub, className,
}: { title: React.ReactNode; sub?: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <div className="font-serif text-base font-semibold leading-tight text-foreground">{title}</div>
      {sub && <div className="text-xs italic text-muted-foreground">{sub}</div>}
    </div>
  );
}

/** Eyebrow — uppercase wayfinding line. */
export function Eyebrow({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('font-sans text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground', className)}
      {...props}
    />
  );
}

/** Label — micro metadata / status text. `muted` for transient states. */
export function Label({
  muted, className, ...props
}: React.HTMLAttributes<HTMLSpanElement> & { muted?: boolean }) {
  return (
    <span
      className={cn('font-sans text-[11px]', muted ? 'text-muted-foreground' : 'text-foreground', className)}
      {...props}
    />
  );
}
