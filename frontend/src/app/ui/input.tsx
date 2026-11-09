import * as React from 'react';
import { Search } from 'lucide-react';
import { cn } from '../lib/utils';

/**
 * Input — one field, three variants: search (leading 🔍, find-not-create),
 * text (standard bordered), inline (borderless edit-in-place; +serif for the
 * editorial click-to-edit fields). Slots: leadingIcon, trailingAction.
 */
export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  variant?: 'text' | 'search' | 'inline';
  fieldSize?: 'sm' | 'md';
  serif?: boolean;
  leadingIcon?: React.ReactNode;
  trailingAction?: React.ReactNode;
  wrapClassName?: string;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ variant = 'text', fieldSize = 'md', serif, leadingIcon, trailingAction, className, wrapClassName, ...props }, ref) => {
    const boxed = variant !== 'inline';
    const wrap = cn(
      'inline-flex items-center gap-2',
      boxed
        ? cn('rounded-[var(--r-md)] border border-input bg-[var(--surface)] px-3 transition-colors focus-within:border-[var(--terra)]', fieldSize === 'sm' ? 'h-8' : 'h-9')
        // inline = a truly transparent field: no box, no padding, NO focus styling.
        // The surrounding box owns the focus state (see .kit-focus-box).
        : 'border-0 bg-transparent p-0',
      wrapClassName,
    );
    return (
      <div className={wrap}>
        {variant === 'search' && <Search size={14} className="shrink-0 text-muted-foreground" />}
        {leadingIcon}
        <input
          ref={ref}
          className={cn(
            // min-w-0: the field shrinks to fit its box (a popup, a phone screen).
            // Callers set the width on the wrapper (wrapClassName) when they want one.
            'min-w-0 w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground/70',
            variant === 'search' && 'text-muted-foreground',
            serif && 'font-serif',
            className,
          )}
          {...props}
        />
        {trailingAction}
      </div>
    );
  },
);
Input.displayName = 'Input';

/** Textarea — default, or `paper` (the main writing act: big serif, low ceremony). */
export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  variant?: 'default' | 'paper';
}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ variant = 'default', className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        'w-full resize-y text-foreground outline-none transition-colors placeholder:text-muted-foreground/70 focus:border-[var(--terra)]',
        variant === 'paper'
          ? 'rounded-[var(--r-lg)] border border-input bg-[var(--surface)] p-4 font-serif text-base leading-relaxed shadow-[var(--sh-1)]'
          : 'rounded-[var(--r-md)] border border-input bg-[var(--surface)] p-3 font-sans text-sm',
        className,
      )}
      {...props}
    />
  ),
);
Textarea.displayName = 'Textarea';
