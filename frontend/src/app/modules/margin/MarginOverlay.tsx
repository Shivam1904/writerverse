import { useEffect, useRef, type ReactNode, type RefObject } from 'react';
import './margin.css';

/* ═══════════════════════════════════════════════════════════════════════════
 * MarginOverlay — the reusable off-screen gutter (the docking rail).
 *
 * The trick: every entry exists THREE times, but only one is visible at a time —
 *   · the TRAVELER — the in-flow heading inside its MarginBlock (scrolls with
 *     the block; the rich copy)
 *   · a TOP DOCK — the compact copy parked in the top rail
 *   · a BOTTOM DOCK — the compact copy parked in the bottom rail
 *
 * Both rails render ALL entries up front, laid out but `visibility:hidden`, so
 * every dock has a stable, measurable Y. Each frame we compare the traveler's
 * top to its two docks' tops and reveal the right copy:
 *   · risen onto the top dock's slot     → show top dock, hide traveler
 *   · dropped onto the bottom dock's slot → show bottom dock, hide traveler
 *   · otherwise                          → show traveler, hide both docks
 *
 * Because the swap fires exactly when the traveler and a dock COINCIDE, the
 * heading appears to glide into place with no jump. Toggling is pure DOM
 * `visibility` — no React state, so scrolling triggers zero re-renders.
 *
 * The library owns only this mechanism; each page owns its entry's look (passed
 * in via `items[].render` — the DOCK, compact form of what its MarginBlock
 * renders as the traveler).
 * ═════════════════════════════════════════════════════════════════════════ */

export interface MarginItem {
  /** stable id — the overlay tracks `#wm-block-<id>` and scrolls there on click */
  id: string;
  /** the page's entry in its DOCK (compact) form; `scrollTo` jumps to this block */
  render: (scrollTo: () => void) => ReactNode;
}

// Sub-pixel slack so the swap lands cleanly on a frame instead of needing the
// traveler and dock to be at byte-identical Y (which never happens mid-scroll).
const EPS = 0.5;

// which of the three copies is visible — see the vocabulary in index.ts:
//   IN = traveler (moving) · ABOVE = top dock · BELOW = bottom dock
const IN = 0;
const ABOVE = 1;
const BELOW = 2;

export function MarginOverlay({ items, anchorRef, scrollerRef }: {
  items: MarginItem[];
  /** element whose left/width define the gutter column — usually the first
   *  block's gutter entry (or a wrapper around it). */
  anchorRef: RefObject<HTMLElement | null>;
  /** custom scroll container — defaults to .wv2-content if omitted */
  scrollerRef?: RefObject<HTMLElement | null>;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const topRailRef = useRef<HTMLDivElement>(null);
  const botRailRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const scroller = scrollerRef?.current ?? document.querySelector('.wv2-content') as HTMLElement | null;
    if (!scroller) return;
    const anchor = anchorRef.current;
    let raf = 0;

    // resolve the in-flow heading node for each block once per run; refreshed if
    // items change (the effect re-runs on `items`).
    const inflowOf = (id: string) =>
      (document.getElementById(`wm-block-${id}`)?.firstElementChild ?? null) as HTMLElement | null;

    const update = () => {
      const container = containerRef.current;
      const topRail = topRailRef.current;
      const botRail = botRailRef.current;
      if (!container || !topRail || !botRail) return;

      // position the fixed gutter column from the anchor (still valid even when
      // the anchor's own heading is hidden — visibility:hidden keeps layout).
      const sRect = scroller.getBoundingClientRect();
      if (anchor) {
        const ar = anchor.getBoundingClientRect();
        container.style.left = ar.left + 'px';
        container.style.width = ar.width + 'px';
      }
      container.style.top = sRect.top + 'px';

      const topKids = topRail.children;
      const botKids = botRail.children;

      // ── READ phase: gather every rect BEFORE writing anything (no interleaved
      //    read/write → no forced reflow) ──
      const plan: { inflow: HTMLElement | null; state: number }[] = new Array(items.length);
      for (let i = 0; i < items.length; i++) {
        const inflow = inflowOf(items[i].id);
        const topGhost = topKids[i] as HTMLElement | undefined;
        const botGhost = botKids[i] as HTMLElement | undefined;
        if (!inflow || !topGhost || !botGhost) { plan[i] = { inflow, state: IN }; continue; }
        const inflowTop = inflow.getBoundingClientRect().top;
        const topSlot = topGhost.getBoundingClientRect().top;
        const botSlot = botGhost.getBoundingClientRect().top;
        let state = IN;
        if (inflowTop <= topSlot + EPS) state = ABOVE;
        else if (inflowTop >= botSlot - EPS) state = BELOW;
        plan[i] = { inflow, state };
      }

      // ── WRITE phase: reveal exactly one copy per entry ──
      for (let i = 0; i < items.length; i++) {
        const { inflow, state } = plan[i];
        const topGhost = topKids[i] as HTMLElement | undefined;
        const botGhost = botKids[i] as HTMLElement | undefined;
        if (topGhost) topGhost.style.visibility = state === ABOVE ? 'visible' : 'hidden';
        if (botGhost) botGhost.style.visibility = state === BELOW ? 'visible' : 'hidden';
        if (inflow) inflow.style.visibility = state === IN ? '' : 'hidden';
      }
    };

    const schedule = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(update); };

    scroller.addEventListener('scroll', schedule, { passive: true });
    // re-measure when the column, the rails, or the viewport reflow
    const ro = new ResizeObserver(schedule);
    ro.observe(scroller);
    if (anchor) ro.observe(anchor);
    if (topRailRef.current) ro.observe(topRailRef.current);
    // ALSO observe the content column (the parent that holds the blocks). When a
    // block expands/collapses its own body, the scroller's border-box doesn't
    // change (only its scrollHeight, which RO can't see) and the anchor never
    // moves — so without this, every traveler/dock below a toggled block would
    // stay stale until the next scroll. The content column's height DOES change,
    // so observing it keeps the rail in sync with self-managed block toggles.
    // (Pure visibility flips in update() never resize layout, so no feedback loop.)
    const content = document.getElementById(`wm-block-${items[0]?.id}`)?.parentElement;
    if (content) ro.observe(content);
    update();

    return () => {
      scroller.removeEventListener('scroll', schedule);
      cancelAnimationFrame(raf);
      ro.disconnect();
      // restore any in-flow heading we hid, so a later re-mount starts clean
      for (const it of items) {
        const inflow = inflowOf(it.id);
        if (inflow) inflow.style.visibility = '';
      }
    };
  }, [items, anchorRef, scrollerRef]);

  const scrollToId = (id: string) =>
    document.getElementById(`wm-block-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  // Both rails render every entry up front (hidden via .wmo-ghost); the effect
  // above flips visibility imperatively. Same DOM order as `items` so a rail's
  // Nth child maps to items[N].
  const rail = (cls: string, ref: RefObject<HTMLDivElement | null>) => (
    <div ref={ref} className={`wmo-stack ${cls}`}>
      {items.map((it) => (
        <div className="wmo-ghost" key={it.id}>{it.render(() => scrollToId(it.id))}</div>
      ))}
    </div>
  );

  return (
    <div ref={containerRef} className="wmo" aria-hidden>
      {rail('wmo-top', topRailRef)}
      {rail('wmo-bottom', botRailRef)}
    </div>
  );
}
