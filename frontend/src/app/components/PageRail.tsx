import { useRightRailWidth } from '../rightRail/useRightRailWidth';

/**
 * PageRail — a page's OWN in-page panel column (grid-column 2), distinct from
 * the universal suggestions rail (<RightRail>, grid-column 3). Hosts the page's
 * page-specific content: the threads map, the write-page marginalia, the
 * character sidebar, the gauges "watching" list…
 *
 * Pages WITH a panel pass content (and, for a draggable + persisted width, a
 * `resizeKey`):
 *   <PageRail resizeKey="panel-plot-threads" width={360}>{panel}</PageRail>
 *
 * Pages WITHOUT panel content render a minimal spacer that keeps the Night Eyes
 * floating button from overlapping the main column:
 *   <PageRail />
 *
 * The minimal width (72px) is just wider than the 56px Night Eyes FAB.
 */
interface PageRailProps {
  /** Fixed width in px (or the starting width when `resizeKey` is set). */
  width?: number;
  /**
   * When set, the panel is drag-resizable and its width is persisted per this
   * key (left-edge handle, mirrors the suggestions rail). Omit for a fixed width.
   */
  resizeKey?: string;
  /** Extra class for page-specific styling (e.g. "thr-rail"). */
  className?: string;
  /** Stick to the viewport top while the main column scrolls. */
  sticky?: boolean;
  children?: React.ReactNode;
}

const MINIMAL_WIDTH = 72;
const DEFAULT_PANEL_WIDTH = 300;

export function PageRail({
  width,
  resizeKey,
  className,
  sticky,
  children,
}: PageRailProps) {
  const minimal = !children;
  const resizable = !minimal && !!resizeKey;
  // Hook is always called (rules of hooks); its width is only used when resizable.
  const { w, startDrag } = useRightRailWidth(
    resizeKey ?? '__page-rail-unused__',
    width ?? DEFAULT_PANEL_WIDTH,
  );
  const px = resizable ? w : width ?? MINIMAL_WIDTH;

  return (
    <aside
      className={[
        'wv2-page-rail',
        minimal && 'wv2-page-rail--minimal',
        !minimal && 'wv2-page-rail--panel',
        sticky && 'wv2-page-rail--sticky',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      style={{ flex: `0 0 ${px}px`, width: px }}
      aria-hidden={minimal || undefined}
    >
      {resizable && (
        <div
          className="wv2-page-rail-resize"
          onPointerDown={startDrag}
          title="Drag to resize"
        />
      )}
      {children}
    </aside>
  );
}
