import { Tooltip } from '../../ui';
import './arnKit.css';

/* GhostDiamond — the Night Eyes "ghost" affordance, promoted verbatim from the UI
 * Kit showcase. Unlike the solid AiDiamond tile, this is just the ✦ spark: it rests
 * near-invisible (quiet), blooms to full strength on row hover (a parent with the
 * `gd-row` class), and lights up with a gold wash + glow when open. Styling lives
 * in arnKit.css. */

export function GhostDiamond({
  state = 'quiet', size = 28, title = 'Ask Night Eyes', onClick,
}: {
  state?: 'quiet' | 'hover' | 'open'; size?: number; title?: string;
  onClick?: (e: React.MouseEvent) => void;
}) {
  return (
    <Tooltip content={title}>
      <button
        type="button"
        className={`ghost-diamond focusring is-${state}`}
        aria-label={title}
        onClick={onClick}
        style={{ width: size, height: size }}
      >
        {state === 'open' && <span className="gd-halo" aria-hidden />}
        <span className="gd-spark kit-spark" style={{ fontSize: Math.round(size * 0.5) }}>✦</span>
      </button>
    </Tooltip>
  );
}
