import { SectionLens } from './SectionLens';
import { LensSection } from '../lens/LensSection';
import { LensInventory } from './LensInventory';

/* LensKit — the single typed entry to the lens kit. Pick a surface `type`:
 *
 *   type='section'   → the inline section/thread lens (shelf + attach + verdicts),
 *                      board-derived. arn (useArnKit) supplies arn / label / scope.
 *   type='page'      → the bottom-of-page lens boards (delegates to modules/lens
 *                      LensSection — pass `where` / `variant` / `id` / `threads`).
 *   type='inventory' → the unattached lens library (the whole bank, browse-only).
 *
 * TODO (slice 3): the attach box's scope-1 / scope-2 / walk / thread pickers with
 * ARN-derived defaults + the relationship (2-character) second scope + the
 * page-level "ask which scope" path (see modules/lensKit/AttachBox.tsx). */

export type LensKitType = 'section' | 'page' | 'inventory';

export function LensKit({ type, ...props }: { type: LensKitType } & Record<string, any>) {
  if (type === 'section') return <SectionLens {...(props as any)} />;
  if (type === 'page') return <LensSection {...(props as any)} />;
  if (type === 'inventory') return <LensInventory {...(props as any)} />;
  return null;
}
