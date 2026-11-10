import type { ScopeType } from './scope';

/* resolve.ts — lens types + tiny utils that don't belong in scope.ts or
 * catalogue.ts. The SCOPE is derived by useArnKit from the ARN + URL; the
 * LENSES come from the catalogue (bank + section bank). This file defines
 * the shapes they share. */

/* What a lens watches — derived by useArnKit from the node's ARN + the URL:
 *   · entity node → the entity itself (character / item / location) by name.
 *   · thread node → that thread (id), binding to its owning entity (owner).
 * The verdict finder matches on it; attach binds a gauge to it. */
export interface LensScope {
  kind: 'entity' | 'thread';
  /** the scoped entity's id: a character name, or a thread id (the ARN item). */
  id?: string;
  /** friendly name for prompts / labels. */
  name?: string;
  /** for a thread: the owning entity the gauge binds to (scope_name). */
  owner?: string;
  scopeType?: ScopeType;
}

/** The shelf-card + invent-spec shape a lens renders. */
export interface LensDef {
  slug: string;
  question: string;
  description: string;
  intent: string;
  good: string;
  problem: string;
}

/** The two y_items, ordered LOW→HIGH (problem, good) — the order the arc ladder
 *  + analyse expect (rungs run lowest→highest). Used by the attach engine when it
 *  invents a section-pure lens's spec. */
export function lensYItems(q: { good: string; problem: string }) {
  return [
    { value: 'problem', description: q.problem },
    { value: 'good', description: q.good },
  ];
}
