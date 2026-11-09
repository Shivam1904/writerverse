import * as React from 'react';
import { cn } from '../lib/utils';
import { Tooltip } from './overlays';

/** Segmented — either/or mode switch (soft pill track + raised active chip). */
export interface SegmentedOption {
  value: string;
  label: React.ReactNode;
  title?: string;
}
export function Segmented({
  value, options, onChange, ariaLabel, className,
}: {
  value: string;
  options: SegmentedOption[];
  onChange: (value: string) => void;
  ariaLabel?: string;
  className?: string;
}) {
  return (
    <div role="group" aria-label={ariaLabel} className={cn('inline-flex items-center gap-0.5 rounded-[var(--r-md)] bg-secondary p-0.5', className)}>
      {options.map((o) => {
        const on = o.value === value;
        const btn = (
          <button
            key={o.value}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(o.value)}
            className={cn(
              'inline-flex h-7 items-center gap-1.5 rounded-[var(--r-sm)] px-3 font-sans text-[12.5px] font-medium transition-colors',
              on ? 'kit-raised text-foreground' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {o.label}
          </button>
        );
        return o.title ? <Tooltip key={o.value} content={o.title}>{btn}</Tooltip> : btn;
      })}
    </div>
  );
}

/** Toggle — on/off pill (accent dot when on). */
export function Toggle({
  on, onChange, children, className, tooltip,
}: {
  on: boolean;
  onChange: (next: boolean) => void;
  children: React.ReactNode;
  className?: string;
  /** Hover/focus hint. */
  tooltip?: React.ReactNode;
}) {
  const btn = (
    <button
      type="button"
      aria-pressed={on}
      onClick={() => onChange(!on)}
      className={cn(
        'inline-flex h-7 items-center gap-1.5 rounded-full border px-3 font-sans text-[12px] transition-colors',
        on ? 'kit-raised border-border text-foreground' : 'border-border text-muted-foreground hover:text-foreground',
        className,
      )}
    >
      {on && <span className="h-1.5 w-1.5 rounded-full bg-primary" />}
      {children}
    </button>
  );
  return tooltip == null ? btn : <Tooltip content={tooltip}>{btn}</Tooltip>;
}

/** PinToggle — keep/unkeep (gold ★ when on). */
export function PinToggle({
  pinned, onChange, className, tooltip,
}: {
  pinned: boolean;
  onChange: (next: boolean) => void;
  className?: string;
  /** Override the default pin/unpin hint. */
  tooltip?: React.ReactNode;
}) {
  return (
    <Tooltip content={tooltip ?? (pinned ? 'unpin' : 'pin')}>
      <button
        type="button"
        aria-pressed={pinned}
        aria-label={pinned ? 'unpin' : 'pin'}
        onClick={() => onChange(!pinned)}
        className={cn(
          'text-[15px] leading-none transition-colors',
          pinned ? 'text-ai' : 'text-muted-foreground/50 hover:text-ai',
          className,
        )}
      >
        {pinned ? '★' : '☆'}
      </button>
    </Tooltip>
  );
}

/** Checkbox — multi-select (round by default). */
export function Checkbox({
  checked, onChange, round = false, className, tooltip,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  round?: boolean;
  className?: string;
  /** Hover/focus hint. */
  tooltip?: React.ReactNode;
}) {
  const btn = (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={cn(
        'grid h-[18px] w-[18px] place-items-center border transition-colors',
        round ? 'rounded-full' : 'rounded-[var(--r-xs)]',
        checked ? 'border-primary bg-primary text-primary-foreground' : 'border-input bg-transparent hover:border-[var(--ink-3)]',
        className,
      )}
    >
      {checked && (
        <svg viewBox="0 0 12 12" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="2.5 6 5.5 9 9.5 3" />
        </svg>
      )}
    </button>
  );
  return tooltip == null ? btn : <Tooltip content={tooltip}>{btn}</Tooltip>;
}
