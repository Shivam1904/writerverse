import * as React from 'react';
import { createPortal } from 'react-dom';
import * as RTooltip from '@radix-ui/react-tooltip';
import { X } from 'lucide-react';
import { cn } from '../lib/utils';
import { Icon } from './icon';
import { Heading } from './typography';

/**
 * Popover — a contextual surface card (surface bg + soft shadow) anchored under
 * a trigger. Lightweight for now (no Radix): click toggles, outside-click closes.
 *
 * Uncontrolled by default. Pass `open` + `onOpenChange` to control it from the
 * parent (e.g. a card that needs to keep its hover gutter pinned while open).
 */
export function Popover({
  trigger, children, align = 'start', width, className, open: openProp, onOpenChange,
}: {
  trigger: React.ReactNode;
  children: React.ReactNode;
  align?: 'start' | 'end';
  width?: number;
  className?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [internal, setInternal] = React.useState(false);
  const isControlled = openProp !== undefined;
  const open = isControlled ? openProp : internal;
  const setOpen = (v: boolean) => {
    if (!isControlled) setInternal(v);
    onOpenChange?.(v);
  };
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <div ref={ref} className="relative inline-flex">
      <span className="contents" onClick={() => setOpen(!open)}>{trigger}</span>
      {open && (
        <div
          role="dialog"
          style={width ? { width } : undefined}
          className={cn(
            'absolute top-full z-50 mt-2 min-w-[12rem] rounded-[var(--r-lg)] border border-border bg-[var(--surface)] p-2 shadow-[var(--sh-3)]',
            align === 'end' ? 'right-0' : 'left-0',
            className,
          )}
        >
          {children}
        </div>
      )}
    </div>
  );
}

/**
 * Dialog — the one centered-modal surface. Portals to <body> (via
 * createPortal), so it always escapes ancestor `overflow-hidden` containers —
 * unlike Popover, which is positioned relative to its trigger and clips at
 * the nearest clipping ancestor. Use Dialog for content too big/important
 * for an anchored popover (long text, forms, confirmations); use Popover for
 * small contextual menus anchored to a specific trigger.
 *
 * Controlled only — the caller owns `open` state:
 *
 *   const [open, setOpen] = useState(false)
 *   <Dialog open={open} onOpenChange={setOpen} title="Terms">…</Dialog>
 */
export function Dialog({
  open, onOpenChange, title, children, className, width = 480,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  width?: number;
}) {
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onOpenChange(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onOpenChange]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/40" onClick={() => onOpenChange(false)} />
      <div
        style={{ width }}
        className={cn(
          'relative z-10 max-h-[85vh] w-full max-w-[calc(100vw-2rem)] overflow-y-auto rounded-[var(--r-lg)] border border-border bg-[var(--surface)] p-5 shadow-[var(--sh-3)]',
          className,
        )}
      >
        {title && (
          <div className="mb-3 flex items-center justify-between gap-3">
            <Heading as="h3" className="text-lg">{title}</Heading>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              aria-label="Close"
              className="rounded-[var(--r-sm)] p-1 text-muted-foreground hover:bg-secondary"
            >
              <Icon as={X} size={16} />
            </button>
          </div>
        )}
        {children}
      </div>
    </div>,
    document.body,
  );
}

/**
 * Tooltip — the one hover/focus hint surface. Wrap any element:
 *
 *   <Tooltip content="Save draft"><Button size="icon">…</Button></Tooltip>
 *
 * `content` takes a string OR any React node (rich content welcome). Renders
 * nothing when `content` is null/undefined, so it's safe to leave the prop off
 * conditionally — `<Tooltip content={maybe}>…</Tooltip>` just passes through.
 *
 * Built on Radix (delay, focus, collision-flip, a11y handled). It portals to
 * <body>, escaping `.wv2-root`, so the surface re-declares the kit UI font.
 *
 * The whole app is wrapped once in <TooltipProvider> (in the kit barrel), so you
 * never need to add one yourself.
 */
export interface TooltipProps {
  content?: React.ReactNode;
  children: React.ReactNode;
  side?: 'top' | 'right' | 'bottom' | 'left';
  align?: 'start' | 'center' | 'end';
  /** Override the open delay (ms). Defaults to the provider's 200ms. */
  delayDuration?: number;
  className?: string;
}

export function Tooltip({
  content, children, side = 'top', align = 'center', delayDuration, className,
}: TooltipProps) {
  if (content == null || content === '') return <>{children}</>;
  return (
    <RTooltip.Root delayDuration={delayDuration}>
      <RTooltip.Trigger asChild>{children}</RTooltip.Trigger>
      <RTooltip.Portal>
        <RTooltip.Content
          side={side}
          align={align}
          sideOffset={6}
          collisionPadding={8}
          className={cn(
            'z-[60] max-w-[18rem] rounded-[var(--r-md)] border border-border bg-[var(--surface)] px-2.5 py-1.5',
            'font-[family-name:var(--ui)] text-[12px] leading-snug text-foreground shadow-[var(--sh-3)]',
            'animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0',
            className,
          )}
        >
          {content}
          <RTooltip.Arrow className="fill-[var(--surface)]" width={10} height={5} />
        </RTooltip.Content>
      </RTooltip.Portal>
    </RTooltip.Root>
  );
}

/** App-level provider — mount once near the root. Re-exported from the kit barrel. */
export const TooltipProvider = RTooltip.Provider;

/**
 * withTooltip — the kit's "tooltip on every component" mechanism. React has no
 * base class to override (composition over inheritance), so this HOC plays that
 * role: wrap any ref-forwarding, prop-spreading component once and it gains a
 * `tooltip` prop plus an automatic fallback to `aria-label` → `title`.
 *
 *   export const Button = withTooltip(BaseButton);
 *   <Button aria-label="Delete" />            // tooltip "Delete" for free
 *   <Button tooltip={<RichNode/>} title="x" /> // explicit wins; native title dropped
 *
 * Whenever a custom tooltip renders, the native `title` is stripped so the
 * browser's own tooltip never fires alongside ours. `aria-label` is preserved.
 *
 * The wrapped component MUST forwardRef and spread its props onto a DOM node —
 * Radix needs the ref to anchor, and reads aria-label/title off the element.
 * For components with a closed prop signature (no DOM spread), wire <Tooltip>
 * in by hand instead.
 */
export function withTooltip<P extends { tooltip?: React.ReactNode }>(
  Component: React.ComponentType<any>,
): React.ForwardRefExoticComponent<React.PropsWithoutRef<P> & React.RefAttributes<any>> {
  const Wrapped = React.forwardRef<any, P>(function WithTooltip(props, ref) {
    const { tooltip, ...rest } = props as any;
    const content = tooltip ?? rest['aria-label'] ?? rest.title;
    if (content == null || content === '') return <Component ref={ref} {...rest} />;
    // We're rendering our own tooltip, so the native `title` is always redundant —
    // strip it to stop the browser's tooltip firing alongside ours (double hint).
    // `aria-label` is kept so screen readers and the custom tooltip both still work.
    const elProps = rest.title != null ? { ...rest, title: undefined } : rest;
    return (
      <Tooltip content={content}>
        <Component ref={ref} {...elProps} />
      </Tooltip>
    );
  });
  Wrapped.displayName = `withTooltip(${Component.displayName || Component.name || 'Component'})`;
  return Wrapped as any;
}
