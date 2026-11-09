import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../lib/utils';
import { withTooltip } from './overlays';

/**
 * Button — the one button family (demoed in pages/showcase/). Variants map the verified
 * vocabulary: ai · primary · secondary · ghost · dashed · link · destructive.
 * Spoken as "ai button sm", "ghost button icon", etc.
 */
export const buttonVariants = cva(
  'inline-flex items-center justify-center gap-1.5 whitespace-nowrap font-sans font-medium select-none transition-colors rounded-[var(--r-md)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 ring-offset-[var(--background)] disabled:opacity-50 disabled:pointer-events-none',
  {
    variants: {
      variant: {
        ai: 'kit-btn-ai',
        primary: 'kit-btn-primary',
        secondary: 'kit-btn-secondary',
        ghost: 'bg-transparent text-muted-foreground hover:bg-secondary hover:text-foreground',
        dashed: 'bg-transparent text-muted-foreground border border-dashed border-input hover:text-primary hover:border-primary',
        link: 'bg-transparent text-[var(--terra-deep)] underline-offset-2 hover:underline',
        destructive: 'bg-transparent text-muted-foreground hover:bg-destructive/10 hover:text-destructive',
      },
      size: {
        xs: 'h-6 px-2 text-[11px]',
        sm: 'h-8 px-3 text-[12.5px]',
        md: 'h-9 px-4 text-sm',
        icon: 'h-8 w-8 p-0',
        'icon-sm': 'h-6 w-6 p-0',
      },
    },
    compoundVariants: [
      // link is text-only — never carry button box metrics
      { variant: 'link', className: 'h-auto px-0 py-0' },
    ],
    defaultVariants: { variant: 'secondary', size: 'md' },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  /** Hover/focus hint. String or any node. Omit to fall back to aria-label / title. */
  tooltip?: React.ReactNode;
}

const BaseButton = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, type = 'button', ...props }, ref) => (
    <button ref={ref} type={type} className={cn(buttonVariants({ variant, size }), className)} {...props} />
  ),
);
BaseButton.displayName = 'BaseButton';

/** Button + automatic tooltip (explicit `tooltip`, else aria-label, else title). */
export const Button = withTooltip<ButtonProps>(BaseButton);
Button.displayName = 'Button';

/**
 * NavButton — a SELECTABLE rail item (the sidebar nav row), not a one-shot action.
 * Inactive it reads as ghost (no button chrome at all); active it becomes the
 * app rail pill — a metallic vertical gradient (ai-bg→terra-soft), a 1px
 * top sheen, a soft lift and a terra-tinted glyph. Hover (when inactive) gives a
 * lighter surface→surface-2 gradient. Two layouts: `normal` = inline icon + label
 * (expanded rail), `icon` = the large stacked tile, glyph above a small caption
 * (collapsed rail). Drive it with `active` (selection), not :focus.
 */
export interface NavButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Selected state — the only thing that makes it look like a button. */
  active?: boolean;
  icon?: React.ReactNode;
  /** `normal` = inline icon+label · `icon` = large stacked tile + caption. */
  layout?: 'normal' | 'icon';
  /** Hover/focus hint — handy for the collapsed (icon) rail. Falls back to aria-label/title. */
  tooltip?: React.ReactNode;
}

const BaseNavButton = React.forwardRef<HTMLButtonElement, NavButtonProps>(
  ({ active, icon, layout = 'normal', className, children, type = 'button', ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      aria-pressed={active}
      className={cn('kit-nav', layout === 'icon' && 'kit-nav--icon', active && 'is-active', className)}
      {...props}
    >
      {icon != null && <span className="kit-nav-icon">{icon}</span>}
      {children != null && <span className="kit-nav-label">{children}</span>}
    </button>
  ),
);
BaseNavButton.displayName = 'BaseNavButton';

export const NavButton = withTooltip<NavButtonProps>(BaseNavButton);
NavButton.displayName = 'NavButton';

/**
 * AiDiamond — a compact AI affordance shaped as a diamond (a 45°-rotated tile,
 * coloured like the ai button) with the metallic ✦ upright in the centre.
 */
export interface AiDiamondProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  size?: number;
  /** Hover/focus hint. Pass `tooltip` (or an aria-label/title) to describe the
      action — the built-in "AI" aria-label stays for screen readers only. */
  tooltip?: React.ReactNode;
}

const BaseAiDiamond = React.forwardRef<HTMLButtonElement, AiDiamondProps>(
  ({ size = 34, className, ...props }, ref) => (
    <button
      ref={ref}
      type="button"
      aria-label="AI"
      className={cn('kit-btn-ai kit-ai-diamond', className)}
      style={{ width: size, height: size }}
      {...props}
    >
      <span className="kit-spark" style={{ fontSize: Math.round(size * 0.54), lineHeight: 1 }}>✦</span>
    </button>
  ),
);
BaseAiDiamond.displayName = 'BaseAiDiamond';

export const AiDiamond = withTooltip<AiDiamondProps>(BaseAiDiamond);
AiDiamond.displayName = 'AiDiamond';
