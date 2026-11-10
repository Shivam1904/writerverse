import { PROPOSAL_SURFACES } from '../proposal/registry';

/**
 * Receipt rules — map an op / accepted capability to the `✦ what → where`
 * sentence ("Receipt" in docs/product/glossary.md).
 *
 * Two entry points:
 *  - `receiptForOp`     — direct WRITE ops worth announcing (Make real, etc.),
 *    matched by op name in the gateway after a successful call.
 *  - `receiptForAccept` — any accepted proposal, derived from the proposal
 *    registry's page hint so new capabilities inherit a receipt for free.
 */

// surface.page prefix → destination label + section route
const DEST: Record<string, { label: string; section: string }> = {
  outline: { label: 'Outline', section: 'outline' },
  threads: { label: 'Threads', section: 'plot-threads' },
  world: { label: 'World', section: 'world' },
  characters: { label: 'Characters', section: 'characters' },
  braindumps: { label: 'Brain Dumps', section: 'braindumps' },
  lenses: { label: 'Lenses', section: 'walks' },
  charts: { label: 'Lenses', section: 'walks' },
};

function dest(pageHint: string | undefined, projectId: any) {
  const prefix = String(pageHint || '').split('.')[0];
  const d = DEST[prefix];
  if (!d) return {};
  return { where: d.label, href: `/project/${projectId}/${d.section}` };
}

/** Receipt for an accepted proposal, from the registry's own metadata. */
export function receiptForAccept(capability: string, projectId: any):
  { what: string; where?: string; href?: string } | null {
  const surface = PROPOSAL_SURFACES[capability];
  if (!surface) return null;
  // cost_confirm accepts start a run rather than landing content — no receipt
  // (the run's own result will announce itself).
  if (surface.confirmType === 'cost_confirm') return null;
  return { what: `${surface.inlineLabel} — accepted`, ...dest(surface.page, projectId) };
}

/** Direct WRITE ops worth a receipt, keyed by op name. */
export function receiptForOp(op: string, args: any, projectId: any):
  { what: string; where?: string; href?: string } | null {
  const name = (args?.name || '').trim();
  switch (op) {
    case 'promote_to_character':
      return { what: `${name || 'Character'} made real`, ...dest('characters', projectId) };
    case 'promote_to_world_entity':
      return { what: `${name || 'Entry'} made real`, ...dest('world', projectId) };
    default:
      return null;
  }
}
