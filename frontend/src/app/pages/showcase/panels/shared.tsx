import { useRef } from 'react';
import { SectionMark } from '../../../components/SectionMark';

/** Aspect (category-identity) colours as CSS vars — shared by the panels + pages. */
export const ASP = {
    char: 'var(--asp-characters)',
    loc: 'var(--asp-locations)',
    idea: 'var(--asp-braindumps)',
    thread: 'var(--asp-threads)',
};

/** HeadingMargin — our shadcn entry for the left-margin gutter (fed to the margin
 *  library's MarginBlock gutter + MarginOverlay ghosts). A boxed concept glyph
 *  tinted by the page's aspect + label + sub. No world.css — Tailwind/inline. */
export function HeadingMargin({ glyph, label, sub, color, onClick }: {
    glyph: React.ReactNode;
    label: string;
    sub?: string;
    color: string;
    onClick?: () => void;
}) {
    return (
        <div
            className={`flex items-start gap-2${onClick ? ' cursor-pointer' : ''}`}
            onClick={onClick}
            role={onClick ? 'button' : undefined}
        >
            <span
                className="grid h-7 w-7 shrink-0 place-items-center rounded-[var(--r-md)]"
                style={{ background: `color-mix(in srgb, ${color} 14%, transparent)`, color }}
            >
                {glyph}
            </span>
            <div className="min-w-0 pt-px">
                <div className="ty-system-label truncate">{label}</div>
                {sub && <div className="ty-system-caption">{sub}</div>}
            </div>
        </div>
    );
}

/** SectionMargin — the gutter heading for a WORLD section: a glossy SectionMark
 *  (story icon — NO box) + label + hint. The world-section counterpart to
 *  HeadingMargin (which boxes a flat concept glyph for whole pages). */
export function SectionMargin({ glyph, color, label, hint, onClick }: {
    glyph: string;
    color: string;
    label: string;
    hint?: string;
    onClick?: () => void;
}) {
    return (
        <div
            className={`flex items-start gap-2${onClick ? ' cursor-pointer' : ''}`}
            onClick={onClick}
            role={onClick ? 'button' : undefined}
        >
            <SectionMark glyph={glyph} color={color} label={label} size={22} className="shrink-0" />
            <div className="min-w-0 pt-px">
                {/* heading = STORY (serif); subheading = SYSTEM (sans). */}
                <div className="ty-story-heading truncate" style={{ fontSize: 14.5, lineHeight: 1.2 }}>{label}</div>
                {hint && <div className="ty-system-caption">{hint}</div>}
            </div>
        </div>
    );
}

/** ClickFocus — clicking any non-interactive whitespace inside focuses the first
 *  field. Used by the composer + Night Eyes (idea cards use useFieldList instead). */
export function ClickFocus({ children, className }: { children: React.ReactNode; className?: string }) {
    const ref = useRef<HTMLDivElement>(null);
    return (
        <div
            ref={ref}
            className={className}
            onMouseDown={(e) => {
                const t = e.target as HTMLElement;
                if (t.closest('button, a, input, textarea, select, label, [data-no-focus]')) return;
                const field = ref.current?.querySelector('input, textarea') as HTMLElement | null;
                if (field) { e.preventDefault(); field.focus(); }
            }}
        >
            {children}
        </div>
    );
}
