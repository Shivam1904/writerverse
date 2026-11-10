import { BoxShell } from './BoxShell';
import { BOXES } from './registry';

/**
 * Renders one box: looks up the kind in the registry, picks the requested view
 * (falling back to the kind's default), and wraps the view in BoxShell. The
 * BoxShell owns the empty state, so a view only renders with data.
 */
export function Box({ kind, view, data, width }) {
  const def = BOXES[kind];
  if (!def) return null;
  const items = data ?? [];
  const View = def.views[view] ?? def.views[def.defaultView];
  return (
    <BoxShell
      label={def.label}
      count={items.length}
      isEmpty={items.length === 0}
      emptyText={def.emptyText}
      prominence={def.prominence}
      width={width}
    >
      {View ? <View data={items} /> : null}
    </BoxShell>
  );
}
