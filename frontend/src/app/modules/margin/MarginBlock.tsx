import type { ReactNode } from 'react';
import './margin.css';

/* MarginBlock — one gutter row: the section's TRAVELER (its margin heading) in
 * the left gutter, the section body in the right column. Drop one per section
 * and pair the page with a single <MarginOverlay items={…}/> so off-screen
 * sections dock their (compact) marker at the rail edges.
 *
 * `gutter` is the TRAVELER entry — the live, in-flow copy that scrolls with the
 * heading, so it's the one that may carry rich detail (subheadings etc.) the
 * docks omit. MarginBlock never looks inside it. The `id` must match the id used
 * in the overlay's items so the two surfaces track the same block.
 * (See modules/margin/index.ts for the traveler / dock vocabulary.) */
export function MarginBlock({
  id,
  gutter,
  children,
  className,
}: {
  /** stable id — the overlay tracks `#wm-block-<id>` and scrolls here */
  id: string;
  /** the page's own margin-entry component — the in-flow TRAVELER heading */
  gutter: ReactNode;
  /** omit for a heading-only section whose content follows as sibling blocks */
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`wm-block${className ? ' ' + className : ''}`} id={`wm-block-${id}`}>
      {gutter}
      <div className="wm-body">{children}</div>
    </div>
  );
}
