import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { buildArn, resolveArn, useArnLocation } from '../sectionMarker';
import {
  chartToVerdict, chartsForNode, useLensesFor,
  type LensScope,
} from '../lensKit';
import { normScope } from '../lensKit/scope';
import type { LensModeKey } from './LensIndicator';
import type { ArnNodeProps } from './tools';
import { queries } from '../../queries';

/* useArnKit — the per-node seam every arnKit button reads. Given a node's ARN
 * parts (section / sub / item), it resolves EVERYTHING from the URL + the ARN —
 * no ArnScope context:
 *
 *   · page / id      — from the URL via useArnLocation (the ARN's first two
 *                      parts; ties the ARN back to MARKER_REGISTRY).
 *   · projectId      — from the route (`useParams`), to run attach / read board.
 *   · scope          — DERIVED: a thread node (sub === 'thread') watches that
 *                      thread (id = item) bound to its owning entity (owner =
 *                      the page id); any other node watches the entity (name).
 *                      The display `name` is the one runtime bit the ARN can't
 *                      hold — the caller passes it.
 *   · arn / label / hints / intent / description / lenses  (registry)
 *   · lensMode + lensCount   — the live lens-indicator state, derived from
 *       (filled? · attached? · the gauge board's verdict):
 *         no content       → 'locked'  ("Can’t attach")
 *         content, no lens → 'add'     ("Add a lens")
 *         attached, no read→ 'attached'
 *         attached, ok     → 'good'
 *         attached, drift  → 'problem'  (+ flag count)
 *         attached, stale  → 'stale'
 *
 * `filled` is the only thing the registry can't know (does THIS node have content
 * yet) — the caller passes it (e.g. a thread has ≥1 text beat). */

export interface UseArnKitArgs {
  section: string;
  sub?: string;
  item?: string;
  /** does the node have content yet? false ⇒ the lens is `locked`. Default true. */
  filled?: boolean;
  /** the entity's display name (character / thread name) — for prompts + the
   *  character-lens verdict match. The one runtime bit the ARN can't supply. */
  name?: string;
  /** a thread's OWNING character (its `scope.name`) — the gauge binds to this.
   *  Defaults to the page id (character studio); pass it where the ARN has no
   *  character id (the standalone Plot Threads page). */
  owner?: string;
  /** the ENTITY scope type (`character` | `story` | `item` | …) — a thread passes
   *  its `scope.type`; character nodes default to 'character'. Filters the shelf. */
  scopeType?: string;
}

export interface ArnKit {
  arn: string;
  label: string;
  hints: string[];
  intent?: { human?: string; ai?: string };
  description?: string;
  lensMode: LensModeKey;
  lensCount: number;
  /** how many lenses are bound on this node (from the board). */
  attachedCount: number;
  scope: LensScope;
  projectId?: string;
}

/** Build the lens scope a node watches, from its ARN parts + the page entity id.
 *  A thread binds to its owning entity: `owner` if passed (Plot Threads page),
 *  else the page id (character studio). Non-thread nodes are `kind: 'entity'`. */
function deriveScope(sub: string | undefined, item: string | undefined, id: string | undefined, name?: string, owner?: string, scopeType?: string): LensScope {
  const isThread = sub === 'thread';
  return isThread
    ? { kind: 'thread', id: item, name, owner: owner ?? id, scopeType: normScope(scopeType) }
    : { kind: 'entity', id: name, name, owner: name, scopeType: 'character' };
}

/** The node's ARN string — page:id from the URL (useArnLocation), the rest is the node. */
export function useArn({ section, sub, item }: ArnNodeProps): string {
  const { page, id } = useArnLocation();
  return buildArn(page, id, section, sub, item);
}

export function useArnKit({ section, sub, item, filled = true, name, owner, scopeType }: UseArnKitArgs): ArnKit {
  const { page, id } = useArnLocation();
  const { projectId } = useParams();
  const resolved = resolveArn(page, id, section, sub, item);
  const { arn, label } = resolved;
  const scope = deriveScope(sub, item, id, name, owner, scopeType);
  // the lenses this section offers (section-pure only — bank lenses are page-only).
  const sectionLenses = useLensesFor(projectId, { kind: 'section', scope, section, sub });

  const { data: board = { charts: [], scenes: [] } } = useQuery({ ...queries.gaugesBoard(projectId), enabled: !!projectId });

  // what's bound on THIS node: scoped here AND its lens belongs to this section.
  const charts = chartsForNode(board.charts, sectionLenses, scope, section, sub);

  let lensMode: LensModeKey = filled ? 'add' : 'locked';
  let lensCount = 0;

  if (charts.length) {
    // aggregate the indicator across EVERY bound lens (worst tone wins, flags sum).
    let worst = 0; // 1 good · 2 attached/reading · 3 stale · 4 problem
    for (const ch of charts) {
      if (ch.stale) { worst = Math.max(worst, 3); continue; }
      const verdict = chartToVerdict(ch);
      lensCount += verdict.flagCount;
      if (verdict.tone === 'warn') worst = Math.max(worst, 4);
      else if (verdict.tone === 'ok') worst = Math.max(worst, 1);
      else worst = Math.max(worst, 2);
    }
    lensMode = worst >= 4 ? 'problem' : worst === 3 ? 'stale' : worst === 1 ? 'good' : 'attached';
  }

  return {
    arn,
    label,
    hints: resolved.hints ?? [],
    intent: resolved.intent,
    description: resolved.description,
    lensMode,
    lensCount,
    attachedCount: charts.length,
    scope,
    projectId,
  };
}
