import * as React from 'react';
import { cn } from '../lib/utils';

/** Spark — the gold ✦ AI brand mark. */
export function Spark({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn('kit-spark text-ai', className)} aria-hidden {...props}>✦</span>;
}

/** Kbd — a keyboard-shortcut cap. */
export function Kbd({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <kbd
      className={cn(
        'inline-grid h-[18px] min-w-[18px] place-items-center rounded-[var(--r-xs)] border border-border bg-secondary px-1 font-sans text-[10px] text-muted-foreground',
        className,
      )}
    >
      {children}
    </kbd>
  );
}

/** Spinner — inline loading indicator. */
export function Spinner({ className }: { className?: string }) {
  return (
    <span
      role="status"
      aria-label="Loading"
      className={cn('inline-block h-4 w-4 animate-spin rounded-full border-2 border-[var(--line-2)] border-t-[var(--terra)]', className)}
    />
  );
}

/** DragHandle — the ⋮⋮ grip. */
export function DragHandle({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span className={cn('cursor-grab select-none leading-none text-muted-foreground/60', className)} aria-hidden {...props}>
      ⋮⋮
    </span>
  );
}

/** EntityDot — a small glossy entity-identity dot. */
export function EntityDot({ color, size = 8, className }: { color: string; size?: number; className?: string }) {
  return (
    <span
      className={cn('inline-block shrink-0 rounded-full', className)}
      style={{
        width: size, height: size, background: color,
        boxShadow: 'inset 0 1px 1px rgba(255,255,255,.45), 0 1px 1px rgba(0,0,0,.2)',
      }}
    />
  );
}

/** Progress — a thin fill track. */
export function Progress({ value, className }: { value: number; className?: string }) {
  return (
    <div className={cn('h-1.5 w-full overflow-hidden rounded-full bg-[var(--surface-3)]', className)}>
      <div
        className="h-full rounded-full bg-[var(--sage)] transition-[width]"
        style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
      />
    </div>
  );
}
