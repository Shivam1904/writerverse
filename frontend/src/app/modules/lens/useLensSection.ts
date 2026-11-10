import { useCallback, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { callOp } from '../../gateway';
import { ARCHETYPE_TO_TYPE, type LensBinding, type WalkKey, type Where } from './lensLibrary';
// the shared layer — imported as FILES (not the lensKit barrel) to avoid a cycle
// (the barrel pulls LensKit → LensSection → useLensSection back into this module).
import { applyAttach, defaultChoice, type AttachChoice } from '../lensKit/attach';
import { useLensContext, useLensesFor } from '../lensKit/select';
import { useLensCatalogue, type CatalogueLens } from '../lensKit/catalogue';
import { bindingsFor, chartMatchesLens, chartSlug, type LensContext } from '../lensKit/verdict';
import { shapedLensFromSpec } from '../lensKit/shape';
import { inventLensFromAsk } from '../../pages/gauges/api';

import { normStr } from '../lensKit/scope';
import { qk } from '../../queries';
const norm = normStr;

export interface LensItem {
  key: string;
  lens: any;                 // CatalogueLens (canonical)
  /** every current binding of this lens on the page */
  bindings: LensBinding[];
  attached: boolean;
}

/**
 * useLensSection — the page lens-section data flow, now built on the SHARED layer:
 *   · useLensContext  — scope / cast / threads / board (+ the attach context)
 *   · useLensesFor    — the page's lenses (the curated pack, resolved to CatalogueLens)
 *   · bindingsFor     — the charts attached on this page
 * It groups the board's charts under each lens, ordered (attached first, in-view
 * thread leading), and hands the same context bundle to the attach container.
 */
export function useLensSection(projectId: string | undefined, where: Where, id?: string, threads: any[] = []) {
  const queryClient = useQueryClient();
  const ctx = useMemo<LensContext>(() => ({ kind: 'page', where, id }), [where, id]);

  const bundle = useLensContext({ projectId, where, id });
  const lenses = useLensesFor(projectId, ctx);
  // the full bank size = the "library" now (no hardcoded catalogue) — drives the
  // "library · N →" link and the "N more" affordance on the boards.
  const bank = useLensCatalogue(projectId);
  // prefer the page-provided threads (its own filtered query) for the picker.
  const useThreads = threads.length ? threads : bundle.threads;
  const ctxBundle = useMemo(
    () => ({ ...bundle, threads: useThreads, attach: { ...bundle.attach, threads: useThreads } }),
    [bundle, useThreads],
  );

  const pageCharts = useMemo(() => bindingsFor(bundle.board.charts, ctx), [bundle.board, ctx]);

  const toBinding = useCallback((ch: any): LensBinding => {
    const tref = ch.thread_ref;
    const walk: WalkKey = tref ? 'thread' : ch?.axis?.tick === 'chapter' ? 'chapter' : 'outline';
    return {
      binding_id: ch.binding_id, walk,
      scopeType: ch.scope?.type || 'story', scopeName: ch.scope?.name || 'the whole story',
      threadRef: tref || undefined,
      threadName: tref ? (useThreads.find((t: any) => t.id === tref)?.name || tref) : undefined,
      chart: ch,
    };
  }, [useThreads]);

  const items = useMemo<LensItem[]>(() => {
    const matched = new Set<any>();
    // the curated pack lenses, each carrying whatever charts match it.
    const packItems: LensItem[] = lenses.map((l) => {
      const mine = pageCharts.filter((ch) => chartMatchesLens(ch, l));
      mine.forEach((ch) => matched.add(ch));
      const bindings = mine.map(toBinding);
      return { key: l.slug, lens: l, bindings, attached: bindings.length > 0 };
    });
    // charts bound on this page but not in the pack → their own card (synth lens).
    const extrasByName = new Map<string, any[]>();
    for (const ch of pageCharts) {
      if (matched.has(ch)) continue;
      const k = norm(ch.name);
      if (!extrasByName.has(k)) extrasByName.set(k, []);
      extrasByName.get(k)!.push(ch);
    }
    const extras: LensItem[] = [...extrasByName.values()].map((chs) => {
      const c = chs[0];
      const lens = {
        slug: `bound:${norm(c?.name)}`, question: c?.name || 'Lens', description: c?.watches || c?.about || '',
        intent: '', good: '', problem: '', scope: [], scopeType: c?.scope?.type || 'story',
        templateId: chartSlug(c), raw: c, origin: 'bank' as const,
        type: ARCHETYPE_TO_TYPE[c?.type] || 'arc', walk: (c?.thread_ref ? 'thread' : 'outline') as WalkKey, attachable: true,
      };
      return { key: lens.slug, lens, bindings: chs.map(toBinding), attached: true };
    });

    const all = [...packItems, ...extras];
    const idKey = norm(id);
    const attachedItems = all.filter((i) => i.attached);
    if (idKey) {
      attachedItems.sort((a, b) =>
        (b.bindings.some((x) => norm(x.threadRef) === idKey) ? 1 : 0) -
        (a.bindings.some((x) => norm(x.threadRef) === idKey) ? 1 : 0));
    }
    return [...attachedItems, ...all.filter((i) => !i.attached)];
  }, [lenses, pageCharts, toBinding, id]);

  const [busyKey, setBusyKey] = useState<string | null>(null);
  const refetch = useCallback(
    () => queryClient.invalidateQueries({ queryKey: qk.gaugesBoard(projectId) }),
    [queryClient, projectId],
  );

  /** Attach a lens. The container hands a full AttachChoice; the quiet boards
   *  (ribbon / chip) toggle with no choice → the default is computed here. */
  const attach = useCallback(
    async (lens: any, choice?: AttachChoice) => {
      if (!projectId || busyKey || !lens) return;
      const ch = choice ?? defaultChoice(lens, ctxBundle.attach);
      setBusyKey(lens.slug);
      try {
        const res = await applyAttach(projectId, lens, ch);
        refetch();
        return res;
      } catch (err) {
        console.error('[lens] attach failed:', err);
      } finally {
        setBusyKey(null);
      }
    },
    [projectId, busyKey, ctxBundle.attach, refetch],
  );

  // ── "shape it": the AI shapes ONE lens from a plain-words ask, held in memory
  // (not persisted). The shaping attach box renders it; Attach binds it lazily. ──
  const [shaped, setShaped] = useState<CatalogueLens | null>(null);
  const [shaping, setShaping] = useState(false);
  const clearShaped = useCallback(() => setShaped(null), []);
  const shape = useCallback(
    async (ask: string) => {
      const q = (ask || '').trim();
      if (!projectId || shaping || !q) return;
      setShaping(true);
      setShaped(null);
      try {
        const res: any = await inventLensFromAsk(projectId, q);
        const spec = res?.lens ?? res?.result?.lens;
        if (spec?.name && spec?.type) setShaped(shapedLensFromSpec(spec));
        else console.warn('[lens] shape returned no usable lens', res);
      } catch (err) {
        console.error('[lens] shape failed:', err);
      } finally {
        setShaping(false);
      }
    },
    [projectId, shaping],
  );

  /** Remove one binding (a lens can have several). Keyed busy by binding_id. */
  const detach = useCallback(
    async (bindingId: string) => {
      if (!projectId || busyKey || !bindingId) return;
      setBusyKey(bindingId);
      try {
        await callOp(projectId, 'unbind_gauge', { binding_id: bindingId }, 'Gauges');
        refetch();
      } catch (err) {
        console.error('[lens] detach failed:', err);
      } finally {
        setBusyKey(null);
      }
    },
    [projectId, busyKey, refetch],
  );

  const moreCount = Math.max(0, bank.length - items.length);

  return {
    items,
    attach,
    detach,
    busyKey,
    threads: useThreads,
    cast: bundle.cast,
    /** the shared context bundle — handed to the attach container. */
    bundle: ctxBundle,
    libraryCount: bank.length,
    moreCount,
    // "shape it" — AI-shaped lens, held in memory until Attach binds it.
    shape,
    shaped,
    shaping,
    clearShaped,
  };
}
