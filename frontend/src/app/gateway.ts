import axios from 'axios';
import { useProposalStore, makeProposalHandlers, isStaleConflict, isProposalClosed } from './modules/proposal';
import { problem, receipt } from './modules/receipt/receiptStore';
import { receiptForAccept, receiptForOp } from './modules/receipt/rules';
import { netStart, netFinish } from './modules/devpanel/netlog';
import { handleApiError } from './extensions';

/**
 * The UI adapter onto the Gateway. Every capability call goes through the
 * **semantic facade** (`backend/actions/facade.py`) — the legacy
 * `POST /dispatch/` envelope endpoint was decommissioned 2026-05-29.
 *
 *   - `callResource(projectId, method, path, body)` — a semantic resource route
 *     (e.g. `PATCH characters/<id>/`). Preferred for resource-shaped CRUD.
 *   - `callOp(projectId, capability, args)` — the generic `op/<capability>/`
 *     route for reads + RPC-style ops. Same signature as the old callOperation.
 *
 * Conventions: ran → 200 + result; proposed → 202 → pushed to `useProposalStore`
 * (the bell and any page reading the store show it) + returns `{__proposed, proposalId}`.
 * Invalidation rides the `X-Invalidates` response header, handled globally by
 * the queryInvalidator interceptor — call sites stay blind to it.
 *
 * (axios baseURL is the API root from config/api.ts; auth header is attached globally — see authStore.)
 */

/**
 * Tier 2 — call a capability via its semantic REST route on the facade.
 * The caller speaks resource URLs and the backend
 * resolves them to a capability. Conventions:
 *   ran      → 200, returns the result body
 *   proposed → 202, pushes the proposal to the store, returns {__proposed, proposalId}
 * Invalidation rides the `X-Invalidates` response header, handled globally by
 * the queryInvalidator interceptor — so this helper doesn't touch it.
 *
 * `path` is relative to `/api/consistency/projects/<projectId>/` (e.g.
 * `characters/`, `characters/12/`).
 */
export async function callResource(
  projectId: any, method: string, path: string, body: any = {}, page = '',
  retry?: boolean,
) {
  const isGet = method.toUpperCase() === 'GET';
  // `page` rides in the body (the facade strips it back out of the args).
  const data = isGet ? undefined : { ...(body ?? {}), ...(page ? { page } : {}) };
  // Reads are idempotent — retry them through a transient window (network blip,
  // cold-backend 5xx, a 401 still mid token-refresh) instead of letting the
  // caller swallow the failure into empty data. Writes are never retried here
  // (a retried add/update could double-apply); `retry` defaults to GET only.
  const run = () => axios.request({
    method,
    url: `/consistency/projects/${projectId}/${path}`,
    data,
  });
  // Dev-only instrumentation: record this call in the netlog live tail
  // (modules/devpanel/netlog.ts). Guarded by import.meta.env.DEV so it is
  // stripped from production builds entirely.
  const _dev = import.meta.env.DEV;
  const _t0 = _dev ? performance.now() : 0;
  const _evId = _dev ? netStart(method, path) : -1;
  // `retry` doubles as the read flag: callOp passes its `get_` sniff here.
  const isRead = retry ?? isGet;
  let res;
  try {
    res = await (isRead ? _withReadRetry(run) : run());
  } catch (err: any) {
    if (_dev) netFinish(_evId, { status: 'error', ms: performance.now() - _t0, httpStatus: err?.response?.status });
    // No failed write is silent: a red toast that stays until dismissed. Reads
    // aren't announced here (their pages show their own empty/error states).
    // An error the extension handles (handleApiError slot, e.g. with its own
    // modal) shows no toast. Any other 402 (the server refused the AI call)
    // shows the server's own words, and so does a 409 / 410
    // ("that scene no longer exists", "too late to
    // undo", "already handled"): there "Please try again" would be wrong.
    // A stale accept (409 `proposal_stale`, SA-209) is not a failure to announce:
    // the proposal card shows the author's text next to the AI's instead.
    const staleAccept = err?.response?.status === 409 && err?.response?.data?.code === 'proposal_stale';
    if (!isRead && !staleAccept && !axios.isCancel(err) && !handleApiError(err?.response?.status, err?.response?.data)) {
      const data = err?.response?.data;
      const status = err?.response?.status;
      // A failed accept says what went wrong, and that the card is still there
      // to retry or dismiss (wrt-106), so its 4xx text is shown as well.
      const failedAccept = path.includes('accept_proposal') && status >= 400 && status < 500;
      // A server with no AI key (503 `ai_not_configured`) says so in its own words.
      const ownWords = data?.code === 'ai_not_configured'
        || [402, 409, 410].includes(status) || failedAccept;
      const serverText = ownWords && typeof data?.error === 'string' && data.error
        ? data.error
        : null;
      problem(serverText ?? _problemText(method, path));
    }
    throw err;
  }
  const out = res.data ?? {};
  const proposed = res.status === 202 && out.status === 'proposed';
  // A response can carry proposals to surface in two cases: a PROPOSE op (202
  // `proposed`), OR a write whose accept spawned a follow-up proposal (200 `ran`
  // with a `proposals` array — e.g. accepting the story slice queues a
  // generate_thread_from_description proposal). Push one store entry per row
  // either way. Fall back to the singular shape for back-compat with
  // single-proposal `proposed` responses.
  const list = Array.isArray(out.proposals) && out.proposals.length
    ? out.proposals
    : (proposed && out.proposal_id
        ? [{ proposal_id: out.proposal_id, capability: out.capability, args: out.args, proposal: out.proposal, page: out.page }]
        : []);
  list.forEach((p: any) => _pushButtonProposal(projectId, page || p.page || out.page || '', p));
  if (_dev) {
    const hdr = res.headers?.['x-invalidates'] ?? res.headers?.['X-Invalidates'];
    const invalidates = hdr
      ? String(hdr).split(',').map((s) => s.trim()).filter(Boolean)
      : undefined;
    const pid0 = list.map((p: any) => p.proposal_id)[0];
    netFinish(_evId, {
      status: proposed ? 'proposed' : 'ran',
      ms: performance.now() - _t0,
      httpStatus: res.status,
      invalidates,
      proposalId: pid0 != null ? String(pid0) : undefined,
    });
  }
  if (proposed) {
    const ids = list.map((p: any) => p.proposal_id);
    return { __proposed: true, proposalId: ids[0], proposalIds: ids };
  }
  return out;
}

/**
 * Tier 2 — call any capability through the facade's generic operation route
 * (`<base>/op/<capability>/`). Drop-in for the legacy `callOperation`: same
 * signature, same return shape (ran→result, proposed→`{__proposed, proposalId}`)
 * — but routed through the facade, so invalidation rides the `X-Invalidates`
 * header (the global interceptor handles it). Resource-shaped capabilities
 * should prefer a semantic route via `callResource` (see characters); reads +
 * RPC ops use this.
 */
export async function callOp(projectId: any, capability: string, args: any = {}, page = '') {
  // Reads come through the same POST op-route as writes, so GET-sniffing can't
  // tell them apart — the `get_` prefix is the reliable read signal. Only those
  // opt into retry; add_/update_/delete_/run_/init_ stay single-shot.
  const isRead = /^get_/.test(String(capability));
  // For accepts, capture the original capability from the pending store BEFORE
  // the call — the accept's own args only carry the proposal id.
  const acceptedCap = capability === 'accept_proposal'
    ? useProposalStore.getState().pending.find(
        (p) => String(p.proposalId) === String(args?.proposal_id))?.capability
    : undefined;
  // Accept / reject from ANY surface (bell card, green inline beat, chat banner)
  // settles the proposal's card here, so the bell never keeps a stale one (SA-219).
  const settlesProposal = (capability === 'accept_proposal' || capability === 'reject_proposal')
    && args?.proposal_id != null;
  let out;
  try {
    out = await callResource(projectId, 'POST', `op/${capability}/`, args, page, isRead);
  } catch (err: any) {
    // Someone already accepted / dismissed it: the card is stale, drop it.
    if (settlesProposal && isProposalClosed(err)) useProposalStore.getState().remove(args.proposal_id);
    // Stale accept (SA-209) from ANY surface — the bell card, a green inline
    // beat, a studio field: put the conflict on the proposal's card, which shows
    // the author's value next to the AI's with Use AI's / Keep mine.
    const conflicts = isStaleConflict(err);
    if (conflicts && args?.proposal_id != null) {
      const store = useProposalStore.getState();
      const entry = store.pending.find((p) => String(p.proposalId) === String(args.proposal_id));
      if (entry) store.setConflicts(entry.proposalId, conflicts);
      else problem(err?.response?.data?.error || "You changed this after the AI suggested it.");
    }
    throw err;
  }
  if (settlesProposal) useProposalStore.getState().remove(args.proposal_id);
  // Work receipt ("Receipt" in docs/product/glossary.md): announce landed work at
  // this one choke point so every call site inherits it.
  if (!(out as any)?.__proposed) {
    const r = acceptedCap
      ? receiptForAccept(acceptedCap, projectId)
      : receiptForOp(capability, args, projectId);
    if (r) receipt(r.what, r.where, r.href);
  }
  return out;
}

const _VERB: Record<string, string> = { POST: 'add', PUT: 'update', PATCH: 'update', DELETE: 'delete' };

/**
 * Plain words for a failed call: `op/update_scene/` → "Couldn't update scene",
 * `PATCH characters/12/` → "Couldn't update characters".
 */
function _problemText(method: string, path: string) {
  const parts = path.split('/').filter(Boolean);
  const what = parts[0] === 'op' && parts[1]
    ? parts[1].replace(/_/g, ' ')
    : `${_VERB[method.toUpperCase()] ?? 'change'} ${(parts[0] ?? '').replace(/[_-]/g, ' ')}`.trim();
  return `Couldn't ${what}. Please try again.`;
}

/**
 * Retry an idempotent read across transient failures. Bounded (2 retries, short
 * linear backoff) so a genuinely-down backend still fails fast. Retries only on
 * "no response" (network error) or 401 / 5xx; a 4xx other than 401 is a real
 * answer (not found, forbidden) and is surfaced immediately.
 */
async function _withReadRetry<T>(run: () => Promise<T>, retries = 2): Promise<T> {
  let lastErr: any;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await run();
    } catch (err: any) {
      lastErr = err;
      const status = err?.response?.status;
      const transient = status === undefined || status === 401 || (status >= 500 && status <= 599);
      if (!transient || attempt === retries) break;
      await new Promise((r) => setTimeout(r, 150 * (attempt + 1)));
    }
  }
  throw lastErr;
}

/**
 * Shared push for button-originated proposals. Wires onAccept/onCancel to
 * the generic accept_proposal / reject_proposal capabilities via dispatch.
 * The store entry survives reload because the rehydration endpoint will
 * re-seed it on next mount (the row is in the DB).
 */
function _pushButtonProposal(projectId: any, page: string, data: any) {
  const proposalId = data.proposal_id;
  useProposalStore.getState().push({
    proposalId,
    capability: String(data.capability || ''),
    result: data.proposal?.preview || data.args || {},
    ...makeProposalHandlers(proposalId, (cap, extra) =>
      callOp(projectId, cap, { proposal_id: String(proposalId), ...extra }, page || data.page || '')),
  });
}
