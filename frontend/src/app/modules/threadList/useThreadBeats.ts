import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  acceptBeat, addThreadBeat, deleteThreadBeat, rejectBeat, reorderThreadBeats, updateProposedBeat,
  updateThreadBeat,
} from '../../pages/threads/data';
import { qk, queries } from '../../queries';
import { wobblesByBeat } from '../../pages/threads/wobbles';
import { restoreDeletedBeat } from '../../pages/outline/data';
import { deletedWithUndo, receipt } from '../receipt/receiptStore';

// Shown when a failed beat write is rolled back on screen. (Once SA-291's
// gateway problem toast is on main, it covers this and the line can go.)
const UNDONE_MSG = "Couldn't save that change — undone";
// A failed TEXT write never throws away what the author typed (product rule):
// the text stays on screen and is retried on the next edit or blur.
const TEXT_KEPT_MSG = "Couldn't save your beat text — it's kept here and will retry";

/* useThreadBeats — owns one thread's beats: local optimistic state + the
 * mutations. Every author change is saved, optimistically:
 *   · text edit (debounced) / add / delete / kind change (Tab) →
 *     updateThreadBeat / addThreadBeat / deleteThreadBeat.
 *   · drag reorder → reorderThreadBeats (the whole saved order).
 *
 * Local state is authoritative for the session (seeded once from thread.beats);
 * we don't re-sync from the query, so a refetch never clobbers an edit in
 * flight. The component re-mounts per thread (keyed), which reseeds.
 *
 * `text` of the open beat lives in this array, so it IS the live draft — no
 * separate draft state to get out of sync. */

type Kind = 'text' | 'heading' | 'placeholder';
const KIND_CYCLE: Kind[] = ['text', 'heading', 'placeholder'];
const isTmp = (id: string) => String(id).startsWith('tmp-');

function normKind(k: any): Kind {
  return k === 'heading' ? 'heading' : k === 'placeholder' ? 'placeholder' : 'text';
}

// Move `activeId` to `overId`'s position. If `activeId` is a heading, its whole
// block (the heading + every beat until the next heading) moves together.
function moveWithBlock(beats: any[], activeId: string, overId: string): any[] {
  const from = beats.findIndex((b) => b.id === activeId);
  if (from < 0 || activeId === overId) return beats;
  let blockLen = 1;
  if (normKind(beats[from].kind) === 'heading') {
    let j = from + 1;
    while (j < beats.length && normKind(beats[j].kind) !== 'heading') j++;
    blockLen = j - from;
  }
  const block = beats.slice(from, from + blockLen);
  const rest = [...beats.slice(0, from), ...beats.slice(from + blockLen)];
  let to = rest.findIndex((b) => b.id === overId);
  if (to < 0) to = rest.length;
  return [...rest.slice(0, to), ...block, ...rest.slice(to)];
}

// Ids of the beats the server has: not a tmp beat still being typed, not a
// green AI insert that hasn't been accepted.
const savedIds = (beats: any[]): string[] =>
  beats.filter((b) => !isTmp(b.id) && !b.insert).map((b) => String(b.id));

// Put the saved beats of `beats` in the order of `ids`. A beat not in `ids`
// (tmp or green insert) stays right after the beat it follows now.
function orderLike(beats: any[], ids: string[]): any[] {
  const rank = new Map(ids.map((id, i) => [id, i]));
  let last = -1;
  const keyed = beats.map((b, i) => {
    const r = rank.get(String(b.id));
    if (r !== undefined) last = r;
    return { b, i, k: r ?? last + 0.5 };
  });
  keyed.sort((x, y) => x.k - y.k || x.i - y.i);
  return keyed.every((x, i) => x.i === i) ? beats : keyed.map((x) => x.b);
}

export function useThreadBeats(projectId: string | undefined, thread: any) {
  const threadId: string | undefined = thread?.id;
  const [beats, setBeats] = useState<any[]>(() => (thread?.beats ?? []).map((b: any) => ({ ...b, kind: normKind(b.kind) })));

  /* ---- real per-beat contradictions ("wobbles") from the gauge board ----
   * Same source as the legacy ThreadCard: the gauges watching this thread flag
   * offending beat ids; wobblesByBeat folds every watching lens into
   * beatId → [{lensName, reasoning, detail}]. Read-only overlay (the analysis
   * view colours the dot red + lists the reasonings). */
  const { data: gaugeBoard } = useQuery({ ...queries.gaugesBoard(projectId), enabled: !!projectId });
  const wobbles = useMemo(() => {
    const watching = (((gaugeBoard as any)?.charts || []) as any[]).filter((c) => c?.thread_ref === threadId);
    return wobblesByBeat(watching);
  }, [gaugeBoard, threadId]);
  const contradictionsFor = useCallback((beatId: string) => {
    const arr = wobbles.get(String(beatId));
    if (!arr || !arr.length) return [];
    return arr.map((w) => ({
      text: w.reasoning || w.detail || `${w.lensName} flagged this beat`,
      gauge: w.lensName,
    }));
  }, [wobbles]);
  const [openId, setOpenId] = useState<string | null>(null);
  const timers = useRef<Record<string, any>>({});
  // latest beats, so kind-cycle / lazy-create can read current state without a stale closure
  const beatsRef = useRef(beats);
  beatsRef.current = beats;
  // tmp beats not yet on the server: where to insert + their kind, until they get content
  const pendingAdds = useRef<Record<string, { afterId: string | null; kind: Kind; creating?: boolean }>>({});

  // Last text the server accepted, per beat id. While a beat's text write has
  // failed (`unsaved`), the cache mirror below writes this saved text instead of
  // the typed text, so the unsaved text never looks saved after a remount.
  const [savedText] = useState<Record<string, string>>(
    () => Object.fromEntries(beats.map((b) => [b.id, String(b.text ?? '')])));
  const [unsaved, setUnsaved] = useState<Set<string>>(() => new Set());
  const unsavedRef = useRef(unsaved);
  unsavedRef.current = unsaved;
  const markUnsaved = useCallback((id: string, on: boolean) => {
    setUnsaved((u) => {
      if (u.has(id) === on) return u;
      const nu = new Set(u);
      if (on) nu.add(id); else nu.delete(id);
      return nu;
    });
  }, []);

  const patch = useCallback((id: string, p: any) => {
    setBeats((bs) => bs.map((b) => (b.id === id ? { ...b, ...p } : b)));
  }, []);

  // Persist a beat's text. On failure, keep the typed text on screen but mark
  // it unsaved (kept out of the cache; retried on the next edit or blur).
  const queryClient = useQueryClient();
  const refetchThreads = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: qk.plotThreads(projectId) });
  }, [queryClient, projectId]);

  // A proposal (green) text write failed: refetch the thread so the screen
  // shows the proposal text the server actually holds.
  const proposalFailed = useCallback(() => {
    receipt(UNDONE_MSG);
    refetchThreads();
  }, [refetchThreads]);

  const saveText = useCallback((id: string, text: string) => {
    if (!projectId || !threadId) return;
    updateThreadBeat(projectId, threadId, id, text).then(
      () => { savedText[id] = text; markUnsaved(id, false); },
      () => {
        // a newer write for this beat has already been sent; it decides
        if (beatsRef.current.find((b) => b.id === id)?.text !== text) return;
        receipt(TEXT_KEPT_MSG);
        markUnsaved(id, true);
      },
    );
  }, [projectId, threadId, savedText, markUnsaved]);

  // Put `beat` back at list index `at` (unless it is already there).
  const putBack = useCallback((beat: any, at: number) => {
    setBeats((bs) => {
      if (bs.some((b) => b.id === beat.id)) return bs;
      const ng = bs.slice();
      ng.splice(Math.max(0, Math.min(at, ng.length)), 0, beat);
      return ng;
    });
  }, []);

  // Persist a delete. On failure, put the beat back where it was. On success,
  // a beat with words gets the 10-second "Deleted — Undo": the delete's
  // `undo_token` is a snapshot, and the server puts the beat back in place
  // (with the outline beats that were placed from it linked again).
  const deleteBeat = useCallback((id: string) => {
    if (!projectId || !threadId || isTmp(id)) return;
    const bs0 = beatsRef.current;
    const at = bs0.findIndex((b) => b.id === id);
    const beat = bs0[at];
    // The text the server holds (the field may already be emptied by Backspace).
    const serverText = String(savedText[id] ?? beat?.text ?? '');
    deleteThreadBeat(projectId, threadId, id).then((res: any) => {
      if (!serverText.trim() || !res?.undo_token) return;
      deletedWithUndo(() => {
        restoreDeletedBeat(projectId, res.undo_token).then((r: any) => {
          if (!r?.beat?.id) return;
          putBack({ ...beat, ...r.beat, kind: normKind(r.beat.kind), covered: normKind(r.beat.kind) === 'text' },
            Number(r.index ?? at));
          savedText[r.beat.id] = String(r.beat.text ?? '');
          markUnsaved(r.beat.id, false);
        }, () => { /* the gateway shows the problem toast */ });
      }, 'Beat deleted');
    }, () => {
      receipt(UNDONE_MSG);
      if (beat) putBack(beat, at);
    });
  }, [projectId, threadId, savedText, putBack, markUnsaved]);

  const open = useCallback((id: string) => setOpenId(id), []);
  const close = useCallback(() => setOpenId(null), []);

  // insert a new (empty) beat after `afterId`; open it. NOT persisted yet — the
  // backend rejects empty beats, so it lazy-creates the moment it gets text.
  const addAfter = useCallback((afterId: string | null, kind: Kind = 'placeholder') => {
    const tmpId = `tmp-${Date.now()}-${Math.round(performance.now())}`;
    const fresh = { id: tmpId, text: '', kind, covered: kind === 'text', contradictions: [] };
    pendingAdds.current[tmpId] = { afterId, kind };
    setBeats((bs) => {
      const i = afterId ? bs.findIndex((b) => b.id === afterId) : bs.length - 1;
      const ng = bs.slice();
      ng.splice((i < 0 ? bs.length - 1 : i) + 1, 0, fresh);
      return ng;
    });
    setOpenId(tmpId);
  }, []);

  // Lazy create: persist a tmp beat the moment it has text; swap its id; flush
  // any text typed during the create round-trip.
  const createFromTmp = useCallback(async (tmpId: string) => {
    const info = pendingAdds.current[tmpId];
    if (!info || info.creating || !projectId || !threadId) return;
    const text = String(beatsRef.current.find((b) => b.id === tmpId)?.text ?? '').trim();
    if (!text) return;
    info.creating = true;
    try {
      const after = info.afterId && !isTmp(info.afterId) ? info.afterId : null;
      const res: any = await addThreadBeat(projectId, threadId, text, after, info.kind);
      const realId = res?.beat?.id ?? res?.id ?? res?.item?.id;
      if (!realId) { info.creating = false; return; }
      const rid = String(realId);
      // keep chained adds anchored to this beat's new id
      for (const k of Object.keys(pendingAdds.current)) {
        if (pendingAdds.current[k].afterId === tmpId) pendingAdds.current[k].afterId = rid;
      }
      delete pendingAdds.current[tmpId];
      savedText[rid] = text;
      const latest = String(beatsRef.current.find((b) => b.id === tmpId)?.text ?? '');
      setBeats((bs) => bs.map((b) => (b.id === tmpId ? { ...b, id: rid } : b)));
      setOpenId((cur) => (cur === tmpId ? rid : cur));
      // text typed while the create was in flight wasn't sent — flush it
      if (latest.trim() && latest !== text) saveText(rid, latest);
    } catch {
      // Never saved: drop the tmp beat so it isn't mirrored into the cache as if
      // it were real.
      receipt(UNDONE_MSG);
      delete pendingAdds.current[tmpId];
      clearTimeout(timers.current[tmpId]);
      delete timers.current[tmpId];
      setBeats((bs) => bs.filter((b) => b.id !== tmpId));
      setOpenId((cur) => (cur === tmpId ? null : cur));
    }
  }, [projectId, threadId, saveText, savedText]);

  // text edit — optimistic + debounced. A tmp beat lazy-creates on first content;
  // an existing beat patches its text.
  const changeText = useCallback((id: string, text: string) => {
    patch(id, { text });
    clearTimeout(timers.current[id]);
    timers.current[id] = setTimeout(() => {
      if (isTmp(id)) createFromTmp(id);
      else saveText(id, text);
    }, 500);
  }, [patch, saveText, createFromTmp]);

  // Blur-to-save: persist a beat's pending (debounced) text immediately, or
  // retry it if its last save failed. No-op otherwise. A tmp beat lazy-creates;
  // an existing one patches its text (or its proposal's text when it's a green
  // AI suggestion).
  const flush = useCallback((id: string) => {
    const t = timers.current[id];
    if (!t && !unsavedRef.current.has(id)) return; // nothing waiting to be written
    clearTimeout(t);
    delete timers.current[id];
    if (isTmp(id)) { createFromTmp(id); return; }
    const beat = beatsRef.current.find((b) => b.id === id);
    if (!beat || !projectId || !threadId) return;
    if (beat.proposal?.id) updateProposedBeat(projectId, beat.proposal.id, beat.proposal.text ?? '', beat.proposal.kind).catch(proposalFailed);
    else saveText(id, beat.text ?? '');
  }, [projectId, threadId, createFromTmp, saveText, proposalFailed]);

  const remove = useCallback((id: string) => {
    delete pendingAdds.current[id];
    deleteBeat(id);
    setBeats((bs) => bs.filter((b) => b.id !== id));
    setOpenId((cur) => (cur === id ? null : cur));
    clearTimeout(timers.current[id]);
  }, [deleteBeat]);

  // Backspace on an empty beat: drop it and focus the previous one
  const removeAndFocusPrev = useCallback((id: string) => {
    deleteBeat(id);
    setBeats((bs) => {
      const i = bs.findIndex((b) => b.id === id);
      const prev = i > 0 ? bs[i - 1] : null;
      setOpenId(prev ? prev.id : null);
      return bs.filter((b) => b.id !== id);
    });
    clearTimeout(timers.current[id]);
    delete pendingAdds.current[id];
  }, [deleteBeat]);

  // Tab — cycle type (text→heading→placeholder) and persist (kind only, so the
  // text is preserved server-side). dir -1 = reverse.
  const cycleKind = useCallback((id: string, dir: 1 | -1 = 1) => {
    const beat = beatsRef.current.find((b) => b.id === id);
    if (!beat) return;
    const i = KIND_CYCLE.indexOf(normKind(beat.kind));
    const nk = KIND_CYCLE[(i + dir + KIND_CYCLE.length) % KIND_CYCLE.length];
    setBeats((bs) => bs.map((b) => (b.id === id ? { ...b, kind: nk, covered: nk === 'text' } : b)));
    // on failure, put the old kind back (unless it was cycled again since)
    if (projectId && threadId && !isTmp(id)) {
      updateThreadBeat(projectId, threadId, id, undefined, nk).catch(() => {
        receipt(UNDONE_MSG);
        setBeats((bs) => bs.map((b) => (
          b.id === id && b.kind === nk ? { ...b, kind: beat.kind, covered: beat.covered } : b)));
      });
    }
  }, [projectId, threadId]);

  // Alt+↑/↓ — move edit focus to the adjacent beat (within this thread)
  const navigate = useCallback((id: string, dir: 1 | -1) => {
    setBeats((bs) => {
      const i = bs.findIndex((b) => b.id === id);
      const ni = i + dir;
      setOpenId(ni >= 0 && ni < bs.length ? bs[ni].id : null);
      return bs;
    });
  }, []);

  // dnd-kit reorder — optimistic, then saved (reorder_thread_beats sends the
  // whole saved order, since a heading drags its block). On success the list
  // follows the order the server saved; on failure the old order comes back
  // (the gateway shows the problem toast). Only the latest drag decides: an
  // older request that fails after a newer one was sent changes nothing.
  const reorderSeq = useRef(0);
  const reorder = useCallback((activeId: string, overId: string) => {
    const before = beatsRef.current;
    const next = moveWithBlock(before, activeId, overId);
    if (next === before) return;
    setBeats(next);
    if (!projectId || !threadId) return;
    const seq = ++reorderSeq.current;
    reorderThreadBeats(projectId, threadId, savedIds(next)).then(
      (res: any) => {
        if (seq !== reorderSeq.current || !Array.isArray(res?.beat_ids)) return;
        setBeats((bs) => orderLike(bs, res.beat_ids));
      },
      () => {
        if (seq !== reorderSeq.current) return;
        setBeats((bs) => orderLike(bs, savedIds(before)));
      },
    );
  }, [projectId, threadId]);

  /* ---- AI beat proposals (green) ---- *
   * A beat carries `proposal:{id,text?,kind?}` (read-merged by get_thread); a
   * ghost insert also has `insert:true`. The displayed/edited value is the
   * PROPOSED one. The thread refetches after each, re-mounting this hook (keyed
   * on the proposal signature) so the applied/cleared state seeds fresh. */

  // Edit the green proposed value (optimistic + debounced into the proposal).
  const changeProposedText = useCallback((beat: any, text: string) => {
    const pid = beat?.proposal?.id;
    setBeats((bs) => bs.map((b) => (b.id === beat.id
      ? { ...b, proposal: { ...b.proposal, text } } : b)));
    if (!pid || !projectId) return;
    clearTimeout(timers.current[beat.id]);
    timers.current[beat.id] = setTimeout(
      () => updateProposedBeat(projectId, pid, text).catch(proposalFailed), 500);
  }, [projectId, proposalFailed]);

  // ✓ accept: save the latest edited value, then apply via the generic accept.
  // OPTIMISTIC: strip the proposal locally first so the green clears instantly —
  // the backend apply + refetch (which remounts this hook on the propSig change)
  // reconcile in the background. Without this the green lingers for the whole
  // accept→accept→get_thread round-trip ("doesn't update immediately").
  const acceptProposal = useCallback(async (beat: any) => {
    const pid = beat?.proposal?.id;
    if (!pid || !projectId) return;
    const nk = normKind(beat.proposal?.kind ?? beat.kind);
    const nt = beat.proposal?.text ?? beat.text ?? '';
    setBeats((bs) => bs.map((b) => {
      if (b.id !== beat.id) return b;
      const { proposal: _proposal, insert, ...rest } = b;
      // a ghost insert has no server id yet — a tmp- id keeps a follow-up
      // edit/delete from hitting the backend with the fake `prop-<id>`; the
      // refetch reconciles the real id on the next reseed.
      return { ...rest, id: insert ? `tmp-acc-${pid}` : b.id, text: nt, kind: nk, covered: nk === 'text' };
    }));
    try {
      await updateProposedBeat(projectId, pid, beat.proposal?.text ?? '', beat.proposal?.kind);
      await acceptBeat(projectId, pid);
    } finally { refetchThreads(); }
  }, [projectId, refetchThreads]);

  // ✗ reject: drop the proposal (the actual beat, if any, is untouched).
  // OPTIMISTIC (same reasoning as accept): an insert ghost vanishes, an edit
  // reverts to its committed text — instantly, before the backend round-trip.
  const rejectProposal = useCallback(async (beat: any) => {
    const pid = beat?.proposal?.id;
    if (!pid || !projectId) return;
    setBeats((bs) => (beat.insert
      ? bs.filter((b) => b.id !== beat.id)
      : bs.map((b) => {
        if (b.id !== beat.id) return b;
        const { proposal: _proposal, ...rest } = b;
        return rest;
      })));
    try { await rejectBeat(projectId, pid); }
    finally { refetchThreads(); }
  }, [projectId, refetchThreads]);

  // Mirror the live local beats into the plot_threads cache so a REMOUNT
  // (collapse/reopen a thread, a propSig-keyed reseed, SPA nav away and back)
  // reseeds from what the author sees — not the stale cache. The author beat ops
  // deliberately don't invalidate plot_threads (staleness.yml: no get_thread×N
  // per keystroke); without this mirror, edits/reorders persist to the backend
  // but visually revert on the next reseed. setQueryData is in-memory (no
  // refetch), so it keeps that local-optimistic contract intact.
  useEffect(() => {
    if (!projectId || !threadId) return;
    queryClient.setQueryData(qk.plotThreads(projectId), (old: any) => {
      if (!old?.threads) return old;
      return {
        ...old,
        threads: old.threads.map((t: any) => (t.id === threadId ? {
          ...t,
          beats: beats.map((b) => (unsaved.has(b.id) && b.id in savedText ? { ...b, text: savedText[b.id] } : b)),
        } : t)),
      };
    });
  }, [beats, unsaved, savedText, projectId, threadId, queryClient]);

  return {
    beats, openId, contradictionsFor, open, close, changeText, addAfter, remove,
    removeAndFocusPrev, cycleKind, navigate, reorder, flush,
    changeProposedText, acceptProposal, rejectProposal,
  };
}
