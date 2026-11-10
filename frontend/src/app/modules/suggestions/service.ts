/**
 * Suggestions module — its own list + per-item statuses; pages embed a *view* of
 * it (this phase: expanded-notification). A suggestion is just text + buttons; it
 * may come from templates, special charts, or elsewhere. Loose objects / any — no
 * contracts. Backed by the `get_suggestions` Operation through the Gateway
 * (special charts + template fits from discovery). ?fixtures=1 short-circuits.
 */
import { callOp } from '../../gateway';
import { SUGGESTION_FIXTURES } from './fixtures';

const wantFixtures = () =>
  typeof window !== 'undefined' &&
  new URLSearchParams(window.location.search).get('fixtures') === '1';

// The expanded-notification view's buttons (the same for every suggestion today;
// move onto the suggestion if sources start needing different buttons).
const STANDARD_ACTIONS = [
  { id: 'watch', label: 'Start watching this', kind: 'primary' },
  { id: 'browse', label: 'Browse all lenses →', kind: 'secondary' },
  { id: 'dismiss', label: 'not now', kind: 'dismiss' },
];

// Session-local status overrides; real transitions become action Operations later.
const statusOverrides: Record<string, string> = {};
const HIDDEN = new Set(['dismissed', 'snoozed']);

export async function getSuggestions(projectId) {
  let raw;
  if (wantFixtures()) {
    raw = SUGGESTION_FIXTURES;
  } else {
    const res = await callOp(projectId, 'get_suggestions').catch(() => ({}));
    raw = Array.isArray(res.suggestions) ? res.suggestions : [];
  }
  return raw
    .map((s) => ({
      ...s,
      status: statusOverrides[s.id] ?? s.status ?? 'new',
      actions: s.actions ?? STANDARD_ACTIONS,
    }))
    .filter((s) => !HIDDEN.has(s.status));
}

export function setStatus(id: string, status: string) {
  statusOverrides[id] = status;
}
