import { Plus } from 'lucide-react';
import { Card } from '../../../ui';

export type WorldCardItem = { name: string; line?: string; from?: string; hasImage?: boolean };

/* A photo-ish placeholder fill + an empty "plate" fill for image-less entries.
 * Inline (JSX) — kept out of any CSS file per the styling rules; these are
 * stand-in art, not theme chrome. */
const IMG_FILL = 'linear-gradient(165deg, #dccba0 0%, #b09a6a 100%)';
const PLATE_FILL = 'linear-gradient(165deg, color-mix(in srgb, var(--paper) 70%, var(--surface)) 0%, var(--surface-2) 100%)';

/**
 * WorldCardGrid — Places (top image) / Items (side thumb) as plain Card divs.
 * The Card is just a container: everything below is composed markup, no slots
 * (no CardHead title/body/cta). `layout="top"` stacks image-over-text in a grid;
 * `layout="side"` is a thumb-left row. An add tile (dashed Card) closes each list.
 */
export function WorldCardGrid({ items, layout, addLabel }: {
    items: WorldCardItem[];
    layout: 'top' | 'side';
    addLabel: string;
}) {
    if (layout === 'side') {
        return (
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                {items.map((it) => (
                    <Card key={it.name} variant="item" className="flex cursor-pointer items-start gap-3 p-3">
                        <div
                            className="grid h-[68px] w-[68px] shrink-0 place-items-center overflow-hidden rounded-[var(--r-sm)] border border-border"
                            style={{ background: it.hasImage ? IMG_FILL : PLATE_FILL }}
                        >
                            {!it.hasImage && (
                                <span className="ty-story-heading italic" style={{ fontSize: 24 }}>
                                    {(it.name || '?').trim().charAt(0)}
                                </span>
                            )}
                        </div>
                        <CardText it={it} />
                    </Card>
                ))}
                <AddTile layout="side" addLabel={addLabel} />
            </div>
        );
    }

    return (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {items.map((it) => (
                <Card key={it.name} variant="item" className="flex cursor-pointer flex-col overflow-hidden p-0">
                    <div
                        className="grid aspect-[4/3] place-items-center border-b border-border px-3"
                        style={{ background: it.hasImage ? IMG_FILL : PLATE_FILL }}
                    >
                        {!it.hasImage && (
                            <span className="ty-story-heading text-balance text-center italic" style={{ fontSize: 19 }}>
                                {it.name}
                            </span>
                        )}
                    </div>
                    <div className="flex flex-1 flex-col gap-0.5 px-3 pb-2.5 pt-2">
                        {it.hasImage && <div className="ty-story-heading" style={{ fontSize: 13.5 }}>{it.name}</div>}
                        <CardText it={it} hideName />
                    </div>
                </Card>
            ))}
            <AddTile layout="top" addLabel={addLabel} />
        </div>
    );
}

/* Name (optional) + one-line description + "from" caption — shared by both layouts. */
function CardText({ it, hideName }: { it: WorldCardItem; hideName?: boolean }) {
    return (
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            {!hideName && <div className="ty-story-heading" style={{ fontSize: 13.5 }}>{it.name}</div>}
            {it.line && (
                <p className="ty-story-body m-0 line-clamp-3 text-[11.5px] leading-snug text-muted-foreground">{it.line}</p>
            )}
            {it.from && <div className="ty-system-caption mt-auto pt-1">from {it.from}</div>}
        </div>
    );
}

function AddTile({ layout, addLabel }: { layout: 'top' | 'side'; addLabel: string }) {
    return (
        <Card
            as="button"
            variant="dashed"
            className={`flex items-center justify-center gap-1.5 text-muted-foreground transition-colors hover:border-[var(--terra-soft)] hover:text-[var(--terra-deep)] ${layout === 'top' ? 'aspect-[4/3] flex-col' : 'p-3'}`}
        >
            <Plus size={layout === 'top' ? 20 : 16} />
            <span className="ty-system-label">{addLabel}</span>
        </Card>
    );
}
