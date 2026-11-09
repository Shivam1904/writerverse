import { Children, isValidElement, Fragment, type ReactNode } from 'react';
import { MarginBlock } from '../modules/margin';

/**
 * PageShell — the one page layout primitive.
 *
 * Centers a fixed-width reading panel between the sidebar and Night Eyes. Inside
 * the panel every row is a `.wm-block` 2-column grid `[gutter | body]` (from the
 * margin library), so the body column ALWAYS starts at exactly `--wm-gutter` —
 * and the header, the section blocks, and any plain intro content all share that
 * one left edge. The gutter marks sit to its left. Because the gutter width and
 * the panel width are standard (and the panel is centered), the title's left
 * edge lands in the same place on every page.
 *
 * Pages supply:
 *   - `header`   a <PageHeader …/> (populated pages) — omit on empty/init pages
 *   - `children` the body: a stack of <MarginBlock id gutter={…}>…</MarginBlock>
 *                for real sections; any NON-MarginBlock child (a banner, an
 *                intro, a form) is auto-wrapped in an empty-gutter block so it
 *                aligns to the body column too. (Don't wrap a MarginBlock inside
 *                your own component — pass it directly so it's recognised.)
 *   - `overlay`  the page's single <MarginOverlay items anchorRef/>
 *   - `rail`     optional right-region content (e.g. Manuscript's Plan rail)
 *
 * Layout only — no visual styles. Reuses margin.css `.wm-block` for the grid.
 * Keep `gutter`/`maxWidth` at their defaults for cross-page consistency; only an
 * intentionally-wide surface (the manuscript editor) should widen `maxWidth`.
 */
export function PageShell({
  header,
  children,
  overlay,
  rail,
  gutter = '220px',
  maxWidth = '1200px',
}: {
  header?: ReactNode;
  children: ReactNode;
  overlay?: ReactNode;
  rail?: ReactNode;
  /** gutter column width — keep the default for cross-page header alignment. */
  gutter?: string;
  /** total panel width (gutter + reading column), centered. Override ONLY for
   *  intentionally-wide pages (e.g. the manuscript editor). */
  maxWidth?: string;
}) {
  // Header + every child becomes a `.wm-block` row so they share one body
  // column. Real MarginBlock children pass through (they own their gutter mark);
  // anything else is wrapped in an empty-gutter block to align it to the body.
  const rows: ReactNode[] = [];
  if (header) {
    rows.push(
      <MarginBlock key="_pagehead" id="_pagehead" gutter={<span aria-hidden />}>
        {header}
      </MarginBlock>,
    );
  }
  const flatChildren: ReactNode[] = [];
  const addChildren = (nodes: ReactNode) => {
    Children.toArray(nodes).forEach((child) => {
      if (isValidElement(child) && child.type === Fragment) {
        addChildren(child.props.children);
      } else {
        flatChildren.push(child);
      }
    });
  };
  addChildren(children);

  flatChildren.forEach((child, i) => {
    const isMarginBlock = isValidElement(child) &&
      (child.type === MarginBlock || child.props.marginAware === true);
    rows.push(
      isMarginBlock
        ? child
        : (
          <MarginBlock key={`_pad-${i}`} id={`_pad-${i}`} gutter={<span aria-hidden />}>
            {child}
          </MarginBlock>
        ),
    );
  });

  return (
    <div
      className="wv2-page"
      style={{
        ['--wm-gutter' as any]: gutter,
        ['--read-max' as any]: maxWidth,
      }}
    >
      <div className="wv2-page-main">
        {rows}
      </div>
      {rail && (
        <aside className="wv2-page-rail wv2-page-rail--panel">
          {rail}
        </aside>
      )}
      {overlay}
    </div>
  );
}
