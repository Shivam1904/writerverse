/**
 * Braindumps — the data seam (loose; no contracts, per the phase-4 rule).
 *
 * The page renders rich items: { id, body, subtext?, tags, pinned }.
 * Backend op: `get_braindumps` returns full Braindump rows — id, title, content,
 * pnote, summary, tags (list), pinned, order. We map:
 *   body     ← content || title              (content is the main text)
 *   subtext  ← pnote || summary              (the design's italic note-to-self)
 *   tags     ← tags                          (already a list — pass through)
 *   pinned   ← pinned
 *
 * `get_braindumps` is read by both Night Eyes and this page, but the backend
 * shapes the row by actor: the AI (Actor.CHAT) gets the narrow view WITHOUT the
 * `ai_data` blob (it was pasting that raw JSON into replies), while the page
 * (Actor.USER_BUTTON) gets the full payload — including `ai_data` for the tag UI
 * / PackBreakdown below. See backend actions/data/braindumps.py.
 */
import { callOp } from '../../gateway';

export const EMPTY_BRAINDUMPS = { braindumps: [] };

/**
 * Unique optimistic-row id. The `tmp-` prefix is load-bearing — many call sites
 * detect not-yet-persisted rows via `String(id).startsWith('tmp-')` — but the
 * suffix MUST be unique: two rows created in the same millisecond used to share
 * `tmp-${Date.now()}`, which collided as a React key (cards rendered blank or
 * wore another card's tags). A shared monotonic counter guarantees uniqueness.
 */
let _tmpSeq = 0;
export const tmpId = (): string => `tmp-${Date.now()}-${++_tmpSeq}`;

function pickBody(bd): string {
  const content = String(bd?.content || '').trim();
  if (content) return content;
  const title = String(bd?.title || '').trim();
  return title;
}

function pickSubtext(bd): string | undefined {
  const pnote = String(bd?.pnote || '').trim();
  if (pnote) return pnote;
  const summary = String(bd?.summary || '').trim();
  return summary || undefined;
}

// Backend Braindump → page item. Falls back gracefully when fields are missing.
function fromBackend(bd) {
  const tags = Array.isArray(bd?.tags) ? bd.tags.filter(Boolean) : [];
  return {
    id: bd?.id ?? `bd-${Math.random().toString(36).slice(2, 8)}`,
    body: pickBody(bd),
    subtext: pickSubtext(bd),
    tags,
    pinned: !!bd?.pinned,
    aiData: bd?.ai_data ?? {},   // full AI annotation payload (phrases/packs/entities/tags/meta)
    aiGenerated: !!bd?.ai_generated,  // created by Night Eyes — drives the quiet hover marker
  };
}

export async function loadBraindumps(projectId) {
  if (!projectId) return EMPTY_BRAINDUMPS;

  // Throws on failure so the page shows "Couldn't load", not first-run (SA-132).
  const res = await callOp(projectId, 'get_braindumps');
  const raw = res.braindumps ?? [];
  const braindumps = raw.map(fromBackend).filter((it) => it.body.length > 0);
  return { braindumps };
}

/**
 * The braindump tag taxonomy from the backend (the canonical source). Returns
 * the ordered list of categories `{ name, color, tags }`. Project-independent —
 * we pass a projectId only because the op route is project-scoped. Callers fall
 * back to the hardcoded copy in tagCategories.ts while this loads / on error.
 */
export async function loadBraindumpTagCategories(projectId): Promise<{ name: string; color: string; tags: string[] }[]> {
  if (!projectId) return [];
  const res = await callOp(projectId, 'get_braindump_tag_categories').catch(() => ({}));
  const cats = (res as any)?.categories;
  return Array.isArray(cats) ? cats : [];
}

// ---- writes (add + edit) ----
// Thin wrappers around the gateway; return the new/updated page-shape item.
// Each throws on failure so callers can roll back optimistic state.

export async function addBraindump(
  projectId,
  { body, subtext, tags, pinned }: { body: any; subtext?: any; tags?: any; pinned?: any },
) {
  if (!projectId) throw new Error('no project');
  const res = await callOp(projectId, 'add_braindump', {
    body,
    subtext: subtext ?? undefined,
    tags: tags ?? undefined,
    pinned: pinned ?? false,
    // The page fires annotation itself (annotateBraindump, below) to keep the
    // add instant + drive the shimmer — so opt out of the backend follow-up,
    // which would double-annotate. Other sources (chat / button) leave it on.
    auto_annotate: false,
  });
  if (!res?.braindump) throw new Error('add failed');
  return fromBackend(res.braindump);
}

// Fire the AI annotator on an idea (right after the add, or on "Try again").
// Direct WRITE; returns the page-shape item with AI-assigned tags + ai_data. The
// idea is already saved either way — a failure only leaves it untagged.
export async function annotateBraindump(projectId, id) {
  if (!projectId) throw new Error('no project');
  const res = await callOp(projectId, 'annotate_braindump', { id });
  if (!res?.braindump) throw new Error('annotate failed');
  return fromBackend(res.braindump);
}

// The annotator doesn't raise when the AI call fails: it answers 200 with
// `ai_data.status: "failed"` (kept on the row so the idea can be re-run). That
// is how a failed annotation differs from one that found nothing to tag.
export function annotationFailed(item): boolean {
  return item?.aiData?.status === 'failed';
}

// Tagging failed because this server has no AI key (`ai_data.error_code`).
// Trying again can't help, so the card shows the server's own words instead.
export function aiNotConfigured(item): boolean {
  return annotationFailed(item) && item?.aiData?.error_code === 'ai_not_configured';
}

// The idea was edited after it was tagged: its text no longer matches the text
// the tags came from (`ai_data.meta.source_text`). Editing never re-tags on its
// own, so the card offers Re-tag instead (wrt-28).
export function tagsOutOfDate(item): boolean {
  const source = item?.aiData?.meta?.source_text;
  if (item?.aiData?.status !== 'ok' || typeof source !== 'string') return false;
  return source.trim() !== String(item?.body || '').trim();
}

export async function updateBraindump(projectId, id, patch) {
  if (!projectId) throw new Error('no project');
  // Send only fields the writer changed — undefined keys are stripped by axios.
  const args: any = { id };
  if (patch.body !== undefined) args.body = patch.body;
  if (patch.subtext !== undefined) args.subtext = patch.subtext;
  if (patch.tags !== undefined) args.tags = patch.tags;
  if (patch.pinned !== undefined) args.pinned = patch.pinned;
  if (patch.ai_data !== undefined) args.ai_data = patch.ai_data;
  const res = await callOp(projectId, 'update_braindump', args);
  if (!res?.braindump) throw new Error('update failed');
  return fromBackend(res.braindump);
}

export async function deleteBraindump(projectId, id) {
  if (!projectId) throw new Error('no project');
  await callOp(projectId, 'delete_braindump', { id });
  return true;
}

// Undo a delete (deletes are soft for 10s of Undo) — returns the restored idea.
export async function undeleteBraindump(projectId, id) {
  if (!projectId) throw new Error('no project');
  const res = await callOp(projectId, 'undelete_braindump', { id });
  if (!res?.braindump) throw new Error('undo delete failed');
  return fromBackend(res.braindump);
}

// ---- AI actions ----

export async function extractElements(projectId) {
  if (!projectId) throw new Error('no project');
  // One LLM call server-side, fanned out into per-type proposals (story /
  // characters / items / rules). The gateway pushes one toast per proposal;
  // the author accepts each independently. `page` tags each Proposal row so
  // page-surface filtering + rehydration know where it came from.
  return callOp(projectId, 'run_init_elements', {}, 'braindumps');
}
