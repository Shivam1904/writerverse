import { useEffect, useState } from 'react';
import { cn } from '../../../lib/utils';

/* Fixed region widths (px). "Fixed" → will become user-adjustable + persisted
 * locally later; for now these are the defaults. */
export const SHELL_W = { sidebar: 76, gutter: 172, rail: 228, ne: 360 };
const CENTRAL_MIN = 460; // the central body never gets narrower than this before a region drops
const GAP = 12;

/**
 * useShellLayout — measures the shell body's live width and decides which
 * regions fit. Width is in CSS px, so this recalculates on BOTH resize and zoom
 * (zoom changes the CSS-px width). As space shrinks, regions drop in this order:
 *   right margin (2nd-right) → Night Eyes → left gutter (2nd-left).
 * Sidebar + central never drop.
 */
export function useShellLayout(ref: React.RefObject<HTMLElement | null>) {
    const [w, setW] = useState(1400);
    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        const ro = new ResizeObserver(() => setW(el.clientWidth));
        ro.observe(el);
        setW(el.clientWidth);
        return () => ro.disconnect();
    }, [ref]);

    const base = SHELL_W.sidebar + SHELL_W.gutter + CENTRAL_MIN;
    return {
        width: w,
        showGutter: w >= base + GAP,
        showNe: w >= base + SHELL_W.ne + GAP * 2,
        showRail: w >= base + SHELL_W.ne + SHELL_W.rail + GAP * 3,
    };
}

/**
 * Drawer — a floating overlay panel for a region that's been collapsed off the
 * shell; backdrop click closes. Slides in from the chosen side.
 */
export function Drawer({ side, width, onClose, children }: {
    side: 'left' | 'right';
    width: number;
    onClose: () => void;
    children: React.ReactNode;
}) {
    return (
        <div className="fixed inset-0 z-50">
            <div className="absolute inset-0 bg-black/20" onMouseDown={onClose} />
            <div
                className={cn('absolute bottom-3 top-3 flex', side === 'right' ? 'right-3' : 'left-3')}
                style={{ width }}
            >
                {children}
            </div>
        </div>
    );
}
