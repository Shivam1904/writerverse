import { ThreadScopePrefix } from './ThreadRow';
import '../../../modules/threadList/thread-list.css'; // .tl-block-glyph

/* ThreadMarginEntry — the threads page's own margin heading. Fed a whole
 * thread, it draws the road glyph + scope prefix + the quoted storyline name.
 * The page renders it in BOTH the gutter (onClick = toggle) and the
 * <MarginOverlay> (onClick = scroll back) — same component, both places. */
export function ThreadMarginEntry({
  thread,
  sub: _sub,
  onClick,
}: {
  thread: any;
  sub?: string;
  onClick?: () => void;
}) {
  return (
    <aside
      className={`wm${onClick ? ' wm-clickable' : ''} flex w-full`}
      style={{ '--wm-c': thread.color } as any}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      {/* <span className="tl-block-glyph"><ThreadGlyph /></span> */}
      <span className="wm-text">
        {(
          <>
            {/* <span className="ty-story-caption">plot thread for</span> */}


            <ThreadScopePrefix thread={thread} />
          </>
        )}
        {/* {sub && <span className="wm-sub">{sub}</span>} */}
      </span>
    </aside>
  );
}
